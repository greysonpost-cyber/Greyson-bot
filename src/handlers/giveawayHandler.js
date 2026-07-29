const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const db = require('../database/db');
const { successEmbed, errorEmbed, baseEmbed, infoEmbed } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');
const { getConfig } = require('../utils/config');

const getGiveaway = db.prepare('SELECT * FROM giveaways WHERE id=?');
const getGiveawayByMessage = db.prepare('SELECT * FROM giveaways WHERE message_id=?');
const updateEnded = db.prepare('UPDATE giveaways SET ended=1,winners_json=? WHERE id=?');
const updateLocked = db.prepare('UPDATE giveaways SET locked=? WHERE id=?');
const dueGiveaways = db.prepare('SELECT * FROM giveaways WHERE ended=0 AND ends_at<=?');
const upsertEntry = db.prepare('INSERT INTO giveaway_entries (giveaway_id,user_id,entries) VALUES (?,?,?) ON CONFLICT(giveaway_id,user_id) DO UPDATE SET entries=excluded.entries');
const getEntry = db.prepare('SELECT * FROM giveaway_entries WHERE giveaway_id=? AND user_id=?');
const allEntries = db.prepare('SELECT * FROM giveaway_entries WHERE giveaway_id=?');
const countEntries = db.prepare('SELECT COUNT(*) c FROM giveaway_entries WHERE giveaway_id=?');
const dueClaims = db.prepare('SELECT * FROM giveaway_claims WHERE claimed=0 AND resolved=0 AND deadline_at<=?');

function entryButton(g) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_enter:${g.id}`).setLabel('🎉 Enter Giveaway').setStyle(ButtonStyle.Success),
  );
}
function claimButton(claimId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_claim:${claimId}`).setLabel('Claim Prize').setStyle(ButtonStyle.Success),
  );
}
function fulfillmentButtons(claimId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_fulfilled:${claimId}`).setLabel('Fulfilled').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`giveaway_escalate:${claimId}`).setLabel('Escalate').setStyle(ButtonStyle.Danger),
  );
}
function deleteButton(claimId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_delete:${claimId}`).setLabel('Delete Ticket').setStyle(ButtonStyle.Danger),
  );
}
function giveawayEmbed(g) {
  return baseEmbed().setTitle(`🎉 ${g.prize}`).setDescription(
    `Click below to enter!\n\n**Ends:** <t:${Math.floor(g.ends_at / 1000)}:R>\n` +
    `**Winners:** ${g.winner_count}\n**Hosted by:** <@${g.hosted_by}>\n` +
    `${g.required_role_id ? `**Required Role:** <@&${g.required_role_id}>\n` : ''}` +
    `${g.required_guild_rank ? `**Required Guild Role:** ${g.required_guild_rank}\n` : ''}` +
    `\n**Entries:** ${countEntries.get(g.id).c}\n\nConfigured bonus-entry roles apply automatically.`,
  );
}
function memberEntries(member) {
  let n = 1;
  for (const r of db.prepare('SELECT * FROM giveaway_bonus_roles WHERE guild_id=?').all(member.guild.id)) {
    if (member.roles.cache.has(r.role_id)) n += r.extra_entries;
  }
  return n;
}
async function pickWinners(g) {
  const entries = allEntries.all(g.id);
  const pool = [];
  for (const e of entries) for (let i = 0; i < e.entries; i += 1) pool.push(e.user_id);
  const winners = new Set();
  const unique = new Set(pool);
  while (winners.size < g.winner_count && winners.size < unique.size) {
    winners.add(pool[Math.floor(Math.random() * pool.length)]);
  }
  return [...winners];
}
async function claimMinutes(member) {
  let n = Number(getConfig(member.guild.id, 'giveaway_default_claim_minutes', '10')) || 10;
  for (const r of db.prepare('SELECT * FROM giveaway_claim_time_roles WHERE guild_id=?').all(member.guild.id)) {
    if (member.roles.cache.has(r.role_id)) n += r.extra_minutes;
  }
  return n;
}
function autoClaim(member) {
  return db.prepare('SELECT role_id FROM giveaway_auto_claim_roles WHERE guild_id=?').all(member.guild.id)
    .some(r => member.roles.cache.has(r.role_id));
}
function safeName(value) {
  return String(value || 'giveaway').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 45);
}
function managementRoleIds(guildId) {
  return {
    hostRole: getConfig(guildId, 'giveaway_host_role'),
    managerRole: getConfig(guildId, 'giveaway_manager_role'),
    staffRole: getConfig(guildId, 'giveaway_staff_role'),
  };
}
function canManageClaim(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const { managerRole, staffRole } = managementRoleIds(member.guild.id);
  return Boolean((managerRole && member.roles.cache.has(managerRole)) || (staffRole && member.roles.cache.has(staffRole)));
}

async function createWinnerTicket(guild, g, winnerId) {
  const member = await guild.members.fetch(winnerId).catch(() => null);
  const host = await guild.members.fetch(g.hosted_by).catch(() => null);
  if (!member) return null;

  const mins = await claimMinutes(member);
  const auto = autoClaim(member);
  const deadline = Date.now() + mins * 60_000;
  const info = db.prepare(`INSERT OR REPLACE INTO giveaway_claims
    (giveaway_id,guild_id,winner_id,deadline_at,claimed,auto_claimed,resolved,created_at)
    VALUES (?,?,?,?,?,?,0,?)`).run(g.id, guild.id, winnerId, deadline, auto ? 1 : 0, auto ? 1 : 0, Date.now());
  const claimId = info.lastInsertRowid || db.prepare('SELECT id FROM giveaway_claims WHERE giveaway_id=? AND winner_id=?').get(g.id, winnerId).id;

  const categoryId = getConfig(guild.id, 'giveaway_ticket_category');
  const { hostRole, managerRole, staffRole } = managementRoleIds(guild.id);
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: winnerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: g.hosted_by, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
  // Host role can watch tickets, but cannot send messages.
  if (hostRole) overwrites.push({ id: hostRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
  // Giveaway managers and staff can view and talk in all winner tickets.
  if (managerRole) overwrites.push({ id: managerRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  if (staffRole) overwrites.push({ id: staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const hostDisplay = host?.displayName || host?.user?.username || 'host';
  const channel = await guild.channels.create({
    name: `${safeName(g.prize)}-${safeName(hostDisplay)}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    permissionOverwrites: overwrites,
    reason: `Giveaway #${g.id} winner claim`,
  }).catch(() => null);
  if (!channel) return null;

  db.prepare('UPDATE giveaway_claims SET ticket_channel_id=? WHERE id=?').run(channel.id, claimId);
  const opening = await channel.send({
    content: `<@${winnerId}> <@${g.hosted_by}>`,
    allowedMentions: { users: [winnerId, g.hosted_by], roles: [] },
    embeds: [infoEmbed(auto ? '🎉 Prize Auto-Claimed' : '🎉 Giveaway Claim Ticket',
      `**Prize:** ${g.prize}\n**Winner:** <@${winnerId}>\n**Host:** <@${g.hosted_by}>\n\n` +
      (auto ? 'This prize was automatically claimed. The host and winner can use the fulfillment buttons below.' : `Winner: press **Claim Prize** before <t:${Math.floor(deadline / 1000)}:R>.`))],
    components: auto ? [fulfillmentButtons(claimId)] : [claimButton(claimId)],
  });
  db.prepare('UPDATE giveaway_claims SET reminder_message_id=? WHERE id=?').run(opening.id, claimId);
  return channel;
}

async function endGiveaway(client, id, { reroll = false } = {}) {
  const g = getGiveaway.get(id);
  if (!g) return null;
  const guild = await client.guilds.fetch(g.guild_id).catch(() => null);
  if (!guild) return null;
  const channel = await guild.channels.fetch(g.channel_id).catch(() => null);
  const winners = await pickWinners(g);
  updateEnded.run(JSON.stringify(winners), id);
  const text = winners.length ? winners.map(x => `<@${x}>`).join(', ') : 'No valid entries.';
  if (channel) {
    await channel.send({ embeds: [successEmbed(reroll ? '🎉 Giveaway Rerolled!' : '🎉 Giveaway Ended!', `**${g.prize}**\n**Winner(s):** ${text}\n**WAITING ON CLAIM**`)] });
    if (g.message_id) {
      const m = await channel.messages.fetch(g.message_id).catch(() => null);
      if (m) await m.edit({ embeds: [giveawayEmbed(g).setTitle(`🎉 [ENDED] ${g.prize}`)], components: [] }).catch(() => {});
    }
  }
  for (const w of winners) await createWinnerTicket(guild, g, w);
  await sendLog(guild, 'log_channel_mod', { title: reroll ? 'Giveaway Rerolled' : 'Giveaway Ended', description: `${g.prize} • ${text}` });
  return winners;
}

async function rerollExpired(client, claim) {
  db.prepare('UPDATE giveaway_claims SET resolved=1 WHERE id=?').run(claim.id);
  const old = getGiveaway.get(claim.giveaway_id);
  if (!old) return;
  db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id=? AND user_id=?').run(old.id, claim.winner_id);
  const guild = await client.guilds.fetch(claim.guild_id).catch(() => null);
  if (claim.ticket_channel_id && guild) {
    const c = await guild.channels.fetch(claim.ticket_channel_id).catch(() => null);
    if (c) setTimeout(() => c.delete().catch(() => {}), 3000);
  }
  const winners = await pickWinners({ ...old, winner_count: 1 });
  if (!winners.length || !guild) return;
  const winner = winners[0];
  const ch = await guild.channels.fetch(old.channel_id).catch(() => null);
  if (ch) await ch.send({ embeds: [successEmbed('🎉 Automatic Reroll', `<@${claim.winner_id}> did not claim **${old.prize}** in time.\nNew winner: <@${winner}>`)] });
  await createWinnerTicket(guild, old, winner);
}

async function handleInteraction(i, client) {
  const [action, idRaw] = i.customId.split(':');
  const id = Number(idRaw);

  if (action === 'giveaway_enter') {
    const g = getGiveaway.get(id);
    if (!g) return i.reply({ embeds: [errorEmbed('Giveaway Not Found')], ephemeral: true });
    if (g.ended || g.locked) return i.reply({ embeds: [errorEmbed(g.ended ? 'Giveaway Ended' : 'Giveaway Locked')], ephemeral: true });
    if (g.required_role_id && !i.member.roles.cache.has(g.required_role_id)) return i.reply({ embeds: [errorEmbed('Not Eligible', `You need <@&${g.required_role_id}>.`)], ephemeral: true });
    if (g.required_guild_rank) {
      const row = db.prepare('SELECT guild_rank FROM guild_members WHERE guild_id=? AND discord_id=? AND active=1').get(i.guild.id, i.user.id);
      if (!row || row.guild_rank.toLowerCase() !== g.required_guild_rank.toLowerCase()) return i.reply({ embeds: [errorEmbed('Not Eligible', `You need the guild role **${g.required_guild_rank}**.`)], ephemeral: true });
    }
    const existing = getEntry.get(id, i.user.id);
    if (existing) {
      db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id=? AND user_id=?').run(id, i.user.id);
      return i.reply({ embeds: [successEmbed('Left Giveaway', 'All of your entries were removed.')], ephemeral: true });
    }
    const n = memberEntries(i.member);
    upsertEntry.run(id, i.user.id, n);
    return i.reply({ embeds: [successEmbed('Entered!', `You have **${n}** entr${n === 1 ? 'y' : 'ies'} based on your configured roles.`)], ephemeral: true });
  }

  const claim = db.prepare('SELECT * FROM giveaway_claims WHERE id=?').get(id);
  if (!claim) return i.reply({ embeds: [errorEmbed('Claim Not Found')], ephemeral: true });
  const giveaway = getGiveaway.get(claim.giveaway_id);

  if (action === 'giveaway_claim') {
    if (claim.winner_id !== i.user.id) return i.reply({ embeds: [errorEmbed('Not Your Claim', 'Only the selected winner can claim this prize.')], ephemeral: true });
    if (claim.claimed) return i.reply({ embeds: [successEmbed('Already Claimed')], ephemeral: true });
    if (Date.now() > claim.deadline_at) return i.reply({ embeds: [errorEmbed('Claim Time Expired')], ephemeral: true });
    db.prepare('UPDATE giveaway_claims SET claimed=1,claimed_at=? WHERE id=?').run(Date.now(), id);
    if (claim.reminder_message_id) {
      const old = await i.channel.messages.fetch(claim.reminder_message_id).catch(() => null);
      if (old && old.id !== i.message.id) await old.delete().catch(() => {});
    }
    const sourceChannel = giveaway ? await i.guild.channels.fetch(giveaway.channel_id).catch(() => null) : null;
    if (sourceChannel) await sourceChannel.send({ content: `**CLAIMED** — <@${i.user.id}> claimed **${giveaway.prize}**.`, allowedMentions: { users: [i.user.id] } });
    return i.update({ embeds: [successEmbed('Prize Claimed!', `<@${i.user.id}> claimed **${giveaway?.prize || 'the prize'}**.\nThe host can now send it and press **Fulfilled**.`)], components: [fulfillmentButtons(id)] });
  }

  if (action === 'giveaway_fulfilled') {
    if (!giveaway) return i.reply({ embeds: [errorEmbed('Giveaway Not Found')], ephemeral: true });
    const isWinner = i.user.id === claim.winner_id;
    const isHost = i.user.id === giveaway.hosted_by;
    if (!isWinner && !isHost && !canManageClaim(i.member)) return i.reply({ embeds: [errorEmbed('No Permission', 'Only the winner, host, staff, or giveaway managers can use this button.')], ephemeral: true });
    if (isHost || (!isWinner && canManageClaim(i.member))) db.prepare('UPDATE giveaway_claims SET host_fulfilled=1 WHERE id=?').run(id);
    if (isWinner) db.prepare('UPDATE giveaway_claims SET winner_fulfilled=1 WHERE id=?').run(id);
    const latest = db.prepare('SELECT * FROM giveaway_claims WHERE id=?').get(id);
    if (latest.host_fulfilled && !latest.winner_fulfilled) {
      await i.reply({
        content: `<@${claim.winner_id}> the host marked **${giveaway.prize}** as sent. Press **Fulfilled** once you receive it. If you have a problem or have not received it, press **Escalate** below.`,
        allowedMentions: { users: [claim.winner_id] },
        components: [fulfillmentButtons(id)],
      });
      return;
    }
    if (latest.host_fulfilled && latest.winner_fulfilled) {
      db.prepare('UPDATE giveaway_claims SET fulfilled_at=? WHERE id=?').run(Date.now(), id);
      return i.reply({ embeds: [successEmbed('Fulfillment Confirmed', 'Both the host and winner confirmed fulfillment. The ticket can now be closed or resolved.')], components: [deleteButton(id)] });
    }
    return i.reply({ embeds: [successEmbed('Confirmation Saved', 'Waiting for the other party to confirm fulfillment.')], ephemeral: true });
  }

  if (action === 'giveaway_escalate') {
    if (i.user.id !== claim.winner_id && i.user.id !== giveaway?.hosted_by) return i.reply({ embeds: [errorEmbed('No Permission')], ephemeral: true });
    const { managerRole, staffRole } = managementRoleIds(i.guild.id);
    if (managerRole) await i.channel.permissionOverwrites.edit(managerRole, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
    if (staffRole) await i.channel.permissionOverwrites.edit(staffRole, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
    db.prepare('UPDATE giveaway_claims SET escalated=1 WHERE id=?').run(id);
    const roleMentions = [staffRole, managerRole].filter(Boolean).map(r => `<@&${r}>`).join(' ');
    return i.reply({
      content: `${roleMentions}\nThis giveaway ticket was escalated by <@${i.user.id}>. Please review the issue.`,
      allowedMentions: { roles: [staffRole, managerRole].filter(Boolean), users: [i.user.id] },
      embeds: [errorEmbed('Ticket Escalated', `Prize: **${giveaway?.prize || 'Unknown'}**`)],
    });
  }

  if (action === 'giveaway_delete') {
    if (!canManageClaim(i.member)) return i.reply({ embeds: [errorEmbed('No Permission', 'Only staff or giveaway managers can delete this ticket.')], ephemeral: true });
    await i.reply({ embeds: [infoEmbed('Deleting Ticket', 'This ticket will be deleted in 3 seconds.')] });
    setTimeout(() => i.channel.delete().catch(() => {}), 3000);
  }
}

function startScheduler(client) {
  setInterval(async () => {
    for (const g of dueGiveaways.all(Date.now())) await endGiveaway(client, g.id).catch(e => console.error('[giveaway scheduler]', e));
    for (const c of dueClaims.all(Date.now())) await rerollExpired(client, c).catch(e => console.error('[claim scheduler]', e));
  }, 15000);
}

module.exports = {
  handleInteraction, entryButton, giveawayEmbed, endGiveaway, startScheduler,
  updateLocked, getGiveawayByMessage, canManageClaim, deleteButton,
};
