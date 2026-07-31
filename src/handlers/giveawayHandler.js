const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
  ChannelType, AttachmentBuilder, Routes, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const db = require('../database/db');
const eco = require('../services/economy');
const arts = require('../services/artifacts');
const { successEmbed, errorEmbed, baseEmbed, infoEmbed } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');
const { getConfig } = require('../utils/config');

const getGiveaway = db.prepare('SELECT * FROM giveaways WHERE id=?');
const getGiveawayByMessage = db.prepare('SELECT * FROM giveaways WHERE message_id=?');
const updateEnded = db.prepare('UPDATE giveaways SET ended=1,winners_json=? WHERE id=?');
const updateLocked = db.prepare('UPDATE giveaways SET locked=? WHERE id=?');
const dueGiveaways = db.prepare('SELECT * FROM giveaways WHERE ended=0 AND ends_at<=?');
const upsertEntry = db.prepare('INSERT INTO giveaway_entries (giveaway_id,user_id,entries,roblox_username) VALUES (?,?,?,?) ON CONFLICT(giveaway_id,user_id) DO UPDATE SET entries=excluded.entries,roblox_username=excluded.roblox_username');
const deleteEntry = db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id=? AND user_id=?');
const getEntry = db.prepare('SELECT * FROM giveaway_entries WHERE giveaway_id=? AND user_id=?');
const allEntries = db.prepare('SELECT * FROM giveaway_entries WHERE giveaway_id=?');
const countEntries = db.prepare('SELECT COUNT(*) c FROM giveaway_entries WHERE giveaway_id=?');
const dueClaims = db.prepare('SELECT * FROM giveaway_claims WHERE claimed=0 AND resolved=0 AND deadline_at<=?');
const getClaim = db.prepare('SELECT * FROM giveaway_claims WHERE id=?');
const getVotes = db.prepare('SELECT * FROM giveaway_ticket_votes WHERE claim_id=?');
const ensureVotes = db.prepare('INSERT OR IGNORE INTO giveaway_ticket_votes (claim_id) VALUES (?)');
const REQUIRED_SERVER_TAG = 'DRIP';

function entryComponents(g) {
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_enter:${g.id}`).setLabel(`Enter Giveaway • ${countEntries.get(g.id).c}`).setEmoji('🎟️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`giveaway_participants:${g.id}`).setLabel('View Entrants').setEmoji('👥').setStyle(ButtonStyle.Secondary)
  );
  const boosts = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`giveaway_boostselect:${g.id}`)
      .setPlaceholder('💠 Choose an entry boost')
      .addOptions(
        { label: '+1 Bonus Entry', description: 'Spend 1 Power Token', value: 'token_1', emoji: '💠' },
        { label: '+3 Bonus Entries', description: 'Spend 3 Power Tokens', value: 'token_3', emoji: '⚡' },
        { label: '+5 Bonus Entries', description: 'Spend 5 Power Tokens', value: 'token_5', emoji: '🌌' },
        { label: 'Spider-Man Power', description: '+1 entry free • once every 24 hours', value: 'spider_man', emoji: '🕷️' }
      )
  );
  return [actions, boosts];
}

function leaveConfirmButton(giveawayId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_leave_confirm:${giveawayId}`)
      .setLabel('Leave Giveaway')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger)
  );
}

function bonusRoleLines(guildId) {
  const rows = db.prepare('SELECT * FROM giveaway_bonus_roles WHERE guild_id=? ORDER BY extra_entries DESC').all(guildId);
  if (!rows.length) return '';
  return `\n\n**Extra Entries:**\n${rows.map(r => `<@&${r.role_id}>: **${r.extra_entries} extra entr${r.extra_entries === 1 ? 'y' : 'ies'}**`).join('\n')}`;
}

function giveawayEmbed(g) {
  const bonusRoles = db.prepare('SELECT * FROM giveaway_bonus_roles WHERE guild_id=? ORDER BY extra_entries DESC').all(g.guild_id);
  const requirements = [];
  if (g.required_role_id) requirements.push(`<@&${g.required_role_id}>`);
  if (g.required_guild_rank) requirements.push(`Guild role: **${g.required_guild_rank}**`);

  const embed = baseEmbed()
    .setTitle(`🎉 ${g.prize}`)
    .setDescription('━━━━━━━━━━━━━━━━━━━━\n**ENTER THE MULTIVERSE. CLAIM THE PRIZE.**\nUse the controls below to enter, view competitors, or power up your odds.\n━━━━━━━━━━━━━━━━━━━━')
    .addFields(
      { name: '⏰ Ends', value: `<t:${Math.floor(g.ends_at / 1000)}:R>
<t:${Math.floor(g.ends_at / 1000)}:F>`, inline: true },
      { name: '🏆 Winners', value: `**${g.winner_count}**`, inline: true },
      { name: '👥 Entries', value: `**${countEntries.get(g.id).c}**`, inline: true },
      { name: '🎤 Hosted by', value: `<@${g.hosted_by}>`, inline: false }
    );

  if (requirements.length) {
    embed.addFields({ name: '✅ Requirements', value: requirements.join('\n'), inline: false });
  }

  if (bonusRoles.length) {
    embed.addFields({
      name: '✨ Bonus Entries',
      value: bonusRoles.map(role => `<@&${role.role_id}> — **+${role.extra_entries}**`).join('\n').slice(0, 1024),
      inline: false
    });
  } else {
    embed.addFields({ name: '✨ Bonus Entries', value: 'No bonus-entry roles are configured.', inline: false });
  }

  embed.addFields({ name: '💠 Multiverse Entry Boosts', value: 'After entering, use the select menu to choose **+1, +3, or +5 entries** with Power Tokens—or activate **Spider-Man** for a free +1 entry once every 24 hours. One paid boost per giveaway.', inline: false });

  const boosterRole = getConfig(g.guild_id, 'giveaway_booster_role');
  embed.addFields({
    name: '🏷️ Winner Requirement',
    value: boosterRole
      ? `Winners must display the **${REQUIRED_SERVER_TAG}** server tag. Members with <@&${boosterRole}> bypass all role, guild-rank, and tag requirements.`
      : `Winners must display the **${REQUIRED_SERVER_TAG}** server tag when the giveaway ends.`,
    inline: false
  });

  return embed.setColor(g.ended ? 0x64748B : g.locked ? 0xF5B942 : 0xE62429).setAuthor({ name: '🕷️ DRIPCORE GIVEAWAYS • SPIDER-VERSE' }).setFooter({ text: `Giveaway #${g.id} • Power Tokens can bend the odds` });
}

async function refreshGiveawayMessage(client, g) {
  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel?.isTextBased() || !g.message_id) return;
  const message = await channel.messages.fetch(g.message_id).catch(() => null);
  if (message) await message.edit({ embeds: [giveawayEmbed(g)], components: entryComponents(g) }).catch(() => {});
}

function memberEntries(member) {
  let total = 1;
  for (const role of db.prepare('SELECT * FROM giveaway_bonus_roles WHERE guild_id=?').all(member.guild.id)) {
    if (member.roles.cache.has(role.role_id)) total += role.extra_entries;
  }
  return total;
}

function isBooster(member) {
  const boosterRole = getConfig(member.guild.id, 'giveaway_booster_role');
  return Boolean(boosterRole && member.roles.cache.has(boosterRole));
}

async function userHasRequiredServerTag(client, userId) {
  try {
    // Fetch raw user data so this also works on discord.js versions that do not
    // expose User#primaryGuild yet.
    const user = await client.rest.get(Routes.user(userId));
    const primaryGuild = user?.primary_guild;
    return Boolean(
      primaryGuild &&
      primaryGuild.identity_enabled !== false &&
      String(primaryGuild.tag || '').toUpperCase() === REQUIRED_SERVER_TAG
    );
  } catch (error) {
    console.error(`[giveaway tag check] Could not check ${userId}:`, error);
    return false;
  }
}

async function pickWinners(g, client) {
  const entries = allEntries.all(g.id);
  const eligible = [];
  for (const entry of entries) {
    const member = await client.guilds.cache.get(g.guild_id)?.members.fetch(entry.user_id).catch(() => null);
    if ((member && isBooster(member)) || await userHasRequiredServerTag(client, entry.user_id)) eligible.push(entry);
  }

  const pool = [];
  for (const entry of eligible) {
    for (let n = 0; n < entry.entries; n += 1) pool.push(entry.user_id);
  }

  const winners = new Set();
  const unique = new Set(pool);
  while (winners.size < g.winner_count && winners.size < unique.size && pool.length) {
    winners.add(pool[Math.floor(Math.random() * pool.length)]);
  }
  return [...winners];
}

async function claimMinutes(member) {
  let minutes = Number(getConfig(member.guild.id, 'giveaway_default_claim_minutes', '10')) || 10;
  for (const role of db.prepare('SELECT * FROM giveaway_claim_time_roles WHERE guild_id=?').all(member.guild.id)) {
    if (member.roles.cache.has(role.role_id)) minutes += role.extra_minutes;
  }
  return minutes;
}

function autoClaim(member) {
  return db.prepare('SELECT role_id FROM giveaway_auto_claim_roles WHERE guild_id=?').all(member.guild.id)
    .some(role => member.roles.cache.has(role.role_id));
}

function voteText(claim, votes) {
  const giveaway = getGiveaway.get(claim.giveaway_id);
  const winnerClaim = claim.claimed ? '✅' : '⬜';
  const winnerFulfilled = votes.winner_fulfilled ? '✅' : '⬜';
  const hostFulfilled = votes.host_fulfilled ? '✅' : '⬜';
  return [
    `**Prize:** ${giveaway?.prize || `Giveaway #${claim.giveaway_id}`}`,
    `**Winner:** <@${claim.winner_id}>`,
    `**Roblox Username:** ${db.prepare('SELECT roblox_username FROM giveaway_entries WHERE giveaway_id=? AND user_id=?').get(claim.giveaway_id, claim.winner_id)?.roblox_username || 'Not provided'}`,
    `**Host:** <@${claim.host_id}>`,
    '',
    `**Claimed by winner:** ${winnerClaim}`,
    `**Fulfilled confirmation** — Winner ${winnerFulfilled} • Host ${hostFulfilled}`,
    '',
    claim.claimed ? '**CLAIMED**' : `**WAITING ON CLAIM** — Claim before <t:${Math.floor(claim.deadline_at / 1000)}:R>.`,
    claim.resolved ? 'Both parties confirmed fulfillment. This ticket may now be closed.' : 'The ticket cannot be closed until both parties press **Fulfilled**.'
  ].join('\n');
}

function activeTicketRows(claim, votes) {
  const buttons = [];
  if (!claim.claimed && !claim.auto_claimed) {
    buttons.push(new ButtonBuilder().setCustomId(`giveaway_claim:${claim.id}`).setLabel('Claim').setStyle(ButtonStyle.Success));
  }
  buttons.push(
    new ButtonBuilder().setCustomId(`giveaway_fulfilled:${claim.id}`).setLabel('Fulfilled').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`giveaway_close:${claim.id}`).setLabel('Close').setStyle(ButtonStyle.Secondary)
      .setDisabled(!(votes.winner_fulfilled && votes.host_fulfilled))
  );
  return [new ActionRowBuilder().addComponents(...buttons)];
}

function escalationRow(claimId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_escalate:${claimId}`).setLabel('Escalate').setEmoji('🚨').setStyle(ButtonStyle.Danger)
  );
}

function closedTicketRows(claimId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_reopen:${claimId}`).setLabel('Reopen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`giveaway_delete:${claimId}`).setLabel('Delete').setStyle(ButtonStyle.Danger)
  )];
}

async function generateTranscript(channel) {
  const fetched = await channel.messages.fetch({ limit: 100 });
  const messages = [...fetched.values()].reverse();
  const lines = messages.map(message => {
    const attachments = [...message.attachments.values()].map(a => a.url).join(' ');
    return `[${new Date(message.createdTimestamp).toISOString()}] ${message.author.tag}: ${message.content}${attachments ? ` ${attachments}` : ''}`;
  });
  return Buffer.from(lines.join('\n') || '(no messages)', 'utf8');
}

async function sendTranscript(guild, channel, claim) {
  ensureVotes.run(claim.id);
  const votes = getVotes.get(claim.id);
  if (votes.transcript_sent) return;
  const transcript = await generateTranscript(channel);
  const file = new AttachmentBuilder(transcript, { name: `giveaway-${claim.giveaway_id}-claim-${claim.id}-transcript.txt` });
  const transcriptChannelId = getConfig(guild.id, 'ticket_transcript_channel') || getConfig(guild.id, 'giveaway_transcript_channel');
  if (transcriptChannelId) {
    const destination = await guild.channels.fetch(transcriptChannelId).catch(() => null);
    if (destination?.isTextBased()) {
      await destination.send({ embeds: [infoEmbed('Giveaway Ticket Transcript', `Claim #${claim.id} • Winner <@${claim.winner_id}> • Host <@${claim.host_id}>`)], files: [file] });
    }
  } else {
    await channel.send({ embeds: [infoEmbed('Automatic Transcript', 'The transcript is attached below.')], files: [file] });
  }
  db.prepare('UPDATE giveaway_ticket_votes SET transcript_sent=1 WHERE claim_id=?').run(claim.id);
}

async function refreshTicketMessage(channel, claimId, closed = false) {
  const claim = getClaim.get(claimId);
  if (!claim) return;
  ensureVotes.run(claimId);
  const votes = getVotes.get(claimId);
  const embed = infoEmbed('🎉 Giveaway Claim Ticket', voteText(claim, votes));
  const components = closed ? closedTicketRows(claimId) : activeTicketRows(claim, votes);
  if (claim.message_id) {
    const message = await channel.messages.fetch(claim.message_id).catch(() => null);
    if (message) return message.edit({ embeds: [embed], components });
  }
  const message = await channel.send({ embeds: [embed], components });
  db.prepare('UPDATE giveaway_claims SET message_id=? WHERE id=?').run(message.id, claimId);
}

async function updateClaimStatusMessage(guild, claim, status) {
  const giveaway = getGiveaway.get(claim.giveaway_id);
  if (!giveaway) return;
  const channel = await guild.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  const content = status === 'claimed'
    ? `**CLAIMED** — <@${claim.winner_id}> claimed **${giveaway.prize}**.`
    : `**WAITING ON CLAIM** — <@${claim.winner_id}> must claim **${giveaway.prize}** before <t:${Math.floor(claim.deadline_at / 1000)}:R>.`;
  if (claim.status_message_id) {
    const oldMessage = await channel.messages.fetch(claim.status_message_id).catch(() => null);
    if (oldMessage) {
      await oldMessage.edit({ content, embeds: [] }).catch(() => {});
      return;
    }
  }
  const message = await channel.send({ content }).catch(() => null);
  if (message) db.prepare('UPDATE giveaway_claims SET status_message_id=? WHERE id=?').run(message.id, claim.id);
}

function safeChannelPart(value, fallback = 'giveaway') {
  const cleaned = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return cleaned || fallback;
}

async function createWinnerTicket(guild, g, winnerId) {
  const member = await guild.members.fetch(winnerId).catch(() => null);
  if (!member) return null;
  const host = await guild.members.fetch(g.hosted_by).catch(() => null);
  const minutes = await claimMinutes(member);
  const automatic = autoClaim(member);
  const deadline = Date.now() + minutes * 60_000;
  db.prepare(`INSERT OR REPLACE INTO giveaway_claims
    (giveaway_id,guild_id,winner_id,host_id,deadline_at,claimed,auto_claimed,resolved,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(g.id, guild.id, winnerId, g.hosted_by, deadline, automatic ? 1 : 0, automatic ? 1 : 0, 0, Date.now());
  const claim = db.prepare('SELECT * FROM giveaway_claims WHERE giveaway_id=? AND winner_id=?').get(g.id, winnerId);
  ensureVotes.run(claim.id);
  if (automatic) db.prepare('UPDATE giveaway_ticket_votes SET winner_claimed=1 WHERE claim_id=?').run(claim.id);
  await updateClaimStatusMessage(guild, claim, automatic ? 'claimed' : 'waiting');

  const categoryId = getConfig(guild.id, 'giveaway_ticket_category');
  const hostRole = getConfig(guild.id, 'giveaway_host_role');
  const staffRole = getConfig(guild.id, 'giveaway_staff_role');
  const managerRole = getConfig(guild.id, 'giveaway_manager_role');
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: winnerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: g.hosted_by, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
  ];

  // The configured giveaway-host and giveaway-manager roles can view tickets read-only.
  // The staff role has no ticket access until the winner presses Escalate.
  const readOnlyRoleIds = [...new Set([hostRole, managerRole].filter(Boolean))];
  for (const roleId of readOnlyRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads]
    });
  }

  const prizePart = safeChannelPart(g.prize, `giveaway-${g.id}`);
  const hostPart = safeChannelPart(host?.displayName || host?.user?.username || `host-${g.hosted_by}`, 'host');
  const channel = await guild.channels.create({
    name: `${prizePart}-${hostPart}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    permissionOverwrites: overwrites,
    reason: `Giveaway #${g.id} winner claim`
  }).catch(() => null);
  if (!channel) return null;
  db.prepare('UPDATE giveaway_claims SET ticket_channel_id=? WHERE id=?').run(channel.id, claim.id);

  // Always place visible content in a newly created ticket. A failure updating the
  // main claim panel should not prevent the winner notification from being sent.
  try {
    await refreshTicketMessage(channel, claim.id, false);
  } catch (error) {
    console.error(`[giveaway ticket] Failed to create claim panel for claim ${claim.id}:`, error);
    const fallback = await channel.send({
      embeds: [infoEmbed(
        '🎉 Giveaway Claim Ticket',
        `**Prize:** ${g.prize}
**Winner:** <@${winnerId}>
**Host:** <@${g.hosted_by}>

Use the buttons on the next message to complete this claim.`
      )]
    }).catch(() => null);
    if (fallback) db.prepare('UPDATE giveaway_claims SET message_id=? WHERE id=?').run(fallback.id, claim.id);
  }

  if (!automatic) {
    const prompt = await channel.send({
      content: `<@${winnerId}> You won **${g.prize}**! Press **Claim** on the claim panel above before <t:${Math.floor(deadline / 1000)}:R>.`,
      allowedMentions: { users: [winnerId], roles: [] }
    }).catch(error => {
      console.error(`[giveaway ticket] Failed to send winner prompt for claim ${claim.id}:`, error);
      return null;
    });
    if (prompt) db.prepare('UPDATE giveaway_claims SET claim_prompt_message_id=? WHERE id=?').run(prompt.id, claim.id);
  } else {
    await channel.send({
      content: `<@${winnerId}> Your **${g.prize}** giveaway claim was created automatically. The host can now send your prize.`,
      allowedMentions: { users: [winnerId], roles: [] }
    }).catch(() => null);
  }
  return channel;
}

async function applyFriendlyNeighborhoodRefunds(g, winners, client) {
  const winnerSet = new Set(winners);
  const boosts = db.prepare('SELECT * FROM giveaway_token_boosts WHERE giveaway_id=?').all(g.id);
  const day = eco.dayKey();
  for (const boost of boosts) {
    if (winnerSet.has(boost.user_id) || !arts.ownsNamed(g.guild_id, boost.user_id, 'Friendly Neighborhood')) continue;
    if (db.prepare('SELECT 1 FROM artifact_passive_refunds WHERE giveaway_id=? AND user_id=? AND artifact_name=?').get(g.id,boost.user_id,'Friendly Neighborhood')) continue;
    const used = db.prepare('SELECT uses FROM artifact_passive_daily_usage WHERE guild_id=? AND user_id=? AND passive_key=? AND day_key=?').get(g.guild_id,boost.user_id,'friendly_refund',day)?.uses || 0;
    if (used >= 2) continue;
    db.transaction(()=>{
      eco.add(g.guild_id,boost.user_id,1,`Friendly Neighborhood refund: giveaway #${g.id}`,'SYSTEM');
      db.prepare(`INSERT INTO artifact_passive_refunds(giveaway_id,guild_id,user_id,artifact_name,refunded_at) VALUES(?,?,?,?,?)`).run(g.id,g.guild_id,boost.user_id,'Friendly Neighborhood',Date.now());
      db.prepare(`INSERT INTO artifact_passive_daily_usage(guild_id,user_id,passive_key,day_key,uses) VALUES(?,?,?,?,1) ON CONFLICT(guild_id,user_id,passive_key,day_key) DO UPDATE SET uses=uses+1`).run(g.guild_id,boost.user_id,'friendly_refund',day);
    })();
    const user=await client.users.fetch(boost.user_id).catch(()=>null);
    await user?.send(`🌀 **Friendly Neighborhood activated!** You lost **${g.prize}**, so your spent Power Token was refunded. (${used+1}/2 refunds used today)`).catch(()=>{});
  }
}

async function endGiveaway(client, id, { reroll = false } = {}) {
  const g = getGiveaway.get(id);
  if (!g) return null;
  const guild = await client.guilds.fetch(g.guild_id).catch(() => null);
  if (!guild) return null;
  const channel = await guild.channels.fetch(g.channel_id).catch(() => null);
  const winners = await pickWinners(g, client);
  updateEnded.run(JSON.stringify(winners), id);
  if (!reroll) await applyFriendlyNeighborhoodRefunds(g, winners, client);
  const text = winners.length ? winners.map(userId => `<@${userId}>`).join(', ') : `No eligible entries with the **${REQUIRED_SERVER_TAG}** server tag.`;
  if (channel) {
    await channel.send({ embeds: [successEmbed(reroll ? 'Giveaway Rerolled!' : 'Giveaway Ended!', `**${g.prize}**\n**Winner(s):** ${text}\nAutomatic claim tickets were created.`)] });
    if (g.message_id) {
      const message = await channel.messages.fetch(g.message_id).catch(() => null);
      if (message) await message.edit({ embeds: [giveawayEmbed(g).setTitle(`[ENDED] ${g.prize}`)], components: [] }).catch(() => {});
    }
  }
  for (const winner of winners) await createWinnerTicket(guild, g, winner);
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
    const channel = await guild.channels.fetch(claim.ticket_channel_id).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [errorEmbed('Claim Time Expired', 'The winner did not claim in time. A new winner is being selected.')] });
      await sendTranscript(guild, channel, claim).catch(() => {});
      setTimeout(() => channel.delete().catch(() => {}), 3_000);
    }
  }
  const winners = await pickWinners({ ...old, winner_count: 1 }, client);
  if (!winners.length || !guild) return;
  const winner = winners[0];
  const channel = await guild.channels.fetch(old.channel_id).catch(() => null);
  if (channel) await channel.send({ embeds: [successEmbed('Automatic Reroll', `<@${claim.winner_id}> did not finish claiming **${old.prize}** in time.\nNew winner: <@${winner}>`)] });
  await createWinnerTicket(guild, old, winner);
}

async function handleInteraction(i, client) {
  const [action, idRaw] = i.customId.split(':');
  const id = Number(idRaw);

  if (action === 'giveaway_enter') {
    const g = getGiveaway.get(id);
    if (!g) return i.reply({ embeds: [errorEmbed('Giveaway Not Found')], ephemeral: true });
    if (g.ended || g.locked) return i.reply({ embeds: [errorEmbed(g.ended ? 'Giveaway Ended' : 'Giveaway Locked')], ephemeral: true });
    const existing = getEntry.get(id, i.user.id);
    if (existing) {
      return i.reply({
        embeds: [infoEmbed('Already Entered', `You currently have **${existing.entries}** entries with Roblox username **${existing.roblox_username || 'Not provided'}**. Press below to leave.`)],
        components: [leaveConfirmButton(id)],
        ephemeral: true
      });
    }
    const modal = new ModalBuilder()
      .setCustomId(`giveaway_roblox_submit:${id}`)
      .setTitle('Enter Giveaway');
    const usernameInput = new TextInputBuilder()
      .setCustomId('roblox_username')
      .setLabel('Your Roblox username')
      .setPlaceholder('Type your exact Roblox username')
      .setMinLength(3)
      .setMaxLength(20)
      .setRequired(true)
      .setStyle(TextInputStyle.Short);
    modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));
    return i.showModal(modal);
  }

  if (action === 'giveaway_roblox_submit') {
    const g = getGiveaway.get(id);
    if (!g) return i.reply({ embeds: [errorEmbed('Giveaway Not Found')], ephemeral: true });
    if (g.ended || g.locked) return i.reply({ embeds: [errorEmbed(g.ended ? 'Giveaway Ended' : 'Giveaway Locked')], ephemeral: true });
    const bypass = isBooster(i.member);
    if (!bypass && g.required_role_id && !i.member.roles.cache.has(g.required_role_id)) {
      return i.reply({ embeds: [errorEmbed('Not Eligible', `You need <@&${g.required_role_id}>.`)], ephemeral: true });
    }
    if (!bypass && g.required_guild_rank) {
      const row = db.prepare('SELECT guild_rank FROM guild_members WHERE guild_id=? AND discord_id=? AND active=1').get(i.guild.id, i.user.id);
      if (!row || row.guild_rank.toLowerCase() !== g.required_guild_rank.toLowerCase()) {
        return i.reply({ embeds: [errorEmbed('Not Eligible', `You need the guild role **${g.required_guild_rank}**.`)], ephemeral: true });
      }
    }
    const robloxUsername = i.fields.getTextInputValue('roblox_username').trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername)) {
      return i.reply({ embeds: [errorEmbed('Invalid Roblox Username', 'Use 3–20 letters, numbers, or underscores only.')], ephemeral: true });
    }
    const entries = memberEntries(i.member);
    upsertEntry.run(id, i.user.id, entries, robloxUsername);
    const total = countEntries.get(id).c;
    const channel = await i.guild.channels.fetch(g.channel_id).catch(() => null);
    const message = channel?.isTextBased() && g.message_id ? await channel.messages.fetch(g.message_id).catch(() => null) : null;
    if (message) {
      await message.edit({ embeds: [giveawayEmbed(g)], components: entryComponents(g) }).catch(() => {});
    }
    return i.reply({ embeds: [successEmbed('Entered!', `Roblox username: **${robloxUsername}**\nYou received **${entries}** entr${entries === 1 ? 'y' : 'ies'}${bypass ? ' and your booster bypass is active.' : '.'}`)], ephemeral: true });
  }

  if (action === 'giveaway_tokenboost' || action === 'giveaway_boostselect') {
    const g = getGiveaway.get(id);
    if (!g) return i.reply({ embeds: [errorEmbed('Giveaway Not Found')], ephemeral: true });
    if (g.ended || g.locked) return i.reply({ embeds: [errorEmbed(g.ended ? 'Giveaway Ended' : 'Giveaway Locked')], ephemeral: true });
    const entry = getEntry.get(id, i.user.id);
    if (!entry) return i.reply({ embeds: [errorEmbed('Enter First', 'Enter the giveaway normally before choosing an entry boost.')], ephemeral: true });

    const choice = action === 'giveaway_tokenboost' ? 'token_1' : i.values?.[0];
    if (choice === 'spider_man') {
      if (!arts.ownsNamed(i.guild.id, i.user.id, 'Spider-Man')) {
        return i.reply({ embeds: [errorEmbed('Spider-Man Required', 'You must own the **Spider-Man** artifact to use this power.')], ephemeral: true });
      }
      const DAY = 86_400_000;
      const row = db.prepare('SELECT last_used_at FROM artifact_passive_cooldowns WHERE guild_id=? AND user_id=? AND passive_key=?').get(i.guild.id, i.user.id, 'spider_man');
      const last = row?.last_used_at || 0;
      if (Date.now() - last < DAY) {
        return i.reply({ embeds: [infoEmbed('Spider-Sense Recharging', `Your Spider-Man boost is ready <t:${Math.floor((last + DAY) / 1000)}:R>.`)], ephemeral: true });
      }
      db.transaction(() => {
        db.prepare('UPDATE giveaway_entries SET entries=entries+1 WHERE giveaway_id=? AND user_id=?').run(id, i.user.id);
        db.prepare(`INSERT INTO artifact_passive_cooldowns(guild_id,user_id,passive_key,last_used_at) VALUES(?,?,?,?)
          ON CONFLICT(guild_id,user_id,passive_key) DO UPDATE SET last_used_at=excluded.last_used_at`).run(i.guild.id, i.user.id, 'spider_man', Date.now());
      })();
      await refreshGiveawayMessage(client, g);
      return i.reply({ embeds: [successEmbed('Spider-Man Activated!', `🕷️ **+1 bonus entry** added to **${g.prize}**.

You now have **${entry.entries + 1} entries**. Your power recharges in 24 hours.`)], ephemeral: true });
    }

    const amount = Number(String(choice || '').replace('token_', ''));
    if (![1, 3, 5].includes(amount)) return i.reply({ embeds: [errorEmbed('Invalid Boost', 'Choose a valid entry boost from the menu.')], ephemeral: true });
    if (db.prepare('SELECT 1 FROM giveaway_token_boosts WHERE giveaway_id=? AND user_id=?').get(id, i.user.id)) {
      return i.reply({ embeds: [infoEmbed('Paid Boost Already Used', 'You can choose only one paid Power Token boost per giveaway.')], ephemeral: true });
    }
    if (!eco.spend(i.guild.id, i.user.id, amount, `Giveaway #${id} +${amount} entries`, i.user.id)) {
      return i.reply({ embeds: [errorEmbed('Not Enough Power Tokens', `This boost costs **${amount} PT**. Your balance is **${eco.bal(i.guild.id, i.user.id)} PT**.`)], ephemeral: true });
    }
    db.transaction(() => {
      db.prepare('UPDATE giveaway_entries SET entries=entries+? WHERE giveaway_id=? AND user_id=?').run(amount, id, i.user.id);
      db.prepare('INSERT INTO giveaway_token_boosts(giveaway_id,guild_id,user_id,tokens_spent,created_at) VALUES(?,?,?,?,?)').run(id, i.guild.id, i.user.id, amount, Date.now());
    })();
    await refreshGiveawayMessage(client, g);
    return i.reply({ embeds: [successEmbed('Multiverse Boost Applied!', `💠 **+${amount} entries** added to **${g.prize}**.

**Entries:** ${entry.entries + amount}
**Balance:** ${eco.bal(i.guild.id, i.user.id)} PT

Friendly Neighborhood may refund the spent tokens if you lose, up to its daily limit.`)], ephemeral: true });
  }

  if (action === 'giveaway_leave_confirm') {
    const g = getGiveaway.get(id);
    if (!g) return i.update({ embeds: [errorEmbed('Giveaway Not Found')], components: [] });
    if (g.ended || g.locked) {
      return i.update({
        embeds: [errorEmbed(g.ended ? 'Giveaway Ended' : 'Giveaway Locked', 'You can no longer change your entry.')],
        components: []
      });
    }
    const existing = getEntry.get(id, i.user.id);
    if (!existing) return i.update({ embeds: [infoEmbed('Not Entered', 'You are not entered in this giveaway.')], components: [] });

    const paidBoost = db.prepare('SELECT * FROM giveaway_token_boosts WHERE giveaway_id=? AND user_id=?').get(id,i.user.id);
    db.transaction(()=>{
      deleteEntry.run(id, i.user.id);
      db.prepare('DELETE FROM giveaway_token_boosts WHERE giveaway_id=? AND user_id=?').run(id,i.user.id);
      if (paidBoost) eco.add(i.guild.id,i.user.id,paidBoost.tokens_spent,'Refunded after leaving giveaway','SYSTEM');
    })();
    const total = countEntries.get(id).c;
    const giveawayMessage = await i.channel.messages.fetch(g.message_id).catch(() => null);
    if (giveawayMessage) {
      await giveawayMessage.edit({ embeds: [giveawayEmbed(g)], components: entryComponents(g) }).catch(() => {});
    }
    return i.update({
      embeds: [successEmbed('Left Giveaway', 'All of your entries, including bonus entries, were removed.')],
      components: []
    });
  }

  if (action === 'giveaway_participants') {
    const rows = allEntries.all(id);
    const text = rows.length ? rows.map(row => `<@${row.user_id}> — **${row.entries}** entries`).join('\n') : 'No participants yet.';
    return i.reply({ embeds: [infoEmbed('Giveaway Participants', text.slice(0, 3900))], ephemeral: true });
  }

  const claim = getClaim.get(id);
  if (!claim) return i.reply({ embeds: [errorEmbed('Claim Not Found')], ephemeral: true });
  const isWinner = i.user.id === claim.winner_id;
  const isHost = i.user.id === claim.host_id;
  const configuredStaffRole = getConfig(i.guild.id, 'giveaway_staff_role');
  const configuredManagerRole = getConfig(i.guild.id, 'giveaway_manager_role');
  const isStaff = i.member.permissions.has(PermissionFlagsBits.ManageChannels)
    || i.member.permissions.has(PermissionFlagsBits.Administrator)
    || Boolean(configuredStaffRole && i.member.roles.cache.has(configuredStaffRole))
    || Boolean(configuredManagerRole && i.member.roles.cache.has(configuredManagerRole));

  if (action === 'giveaway_claim') {
    if (!isWinner) return i.reply({ embeds: [errorEmbed('Not Allowed', 'Only the giveaway winner can claim this prize.')], ephemeral: true });
    if (claim.auto_claimed || claim.claimed) return i.reply({ embeds: [errorEmbed('Already Claimed')], ephemeral: true });
    ensureVotes.run(id);
    db.prepare('UPDATE giveaway_ticket_votes SET winner_claimed=1 WHERE claim_id=?').run(id);
    db.prepare("UPDATE giveaway_claims SET claimed=1,status='claimed',claimed_at=? WHERE id=?").run(Date.now(), id);
    const updatedClaim = getClaim.get(id);
    if (updatedClaim.claim_prompt_message_id) {
      const prompt = await i.channel.messages.fetch(updatedClaim.claim_prompt_message_id).catch(() => null);
      if (prompt) await prompt.delete().catch(() => {});
      db.prepare('UPDATE giveaway_claims SET claim_prompt_message_id=NULL WHERE id=?').run(id);
    }
    await updateClaimStatusMessage(i.guild, updatedClaim, 'claimed');
    await refreshTicketMessage(i.channel, id, false);
    const robloxUsername = db.prepare('SELECT roblox_username FROM giveaway_entries WHERE giveaway_id=? AND user_id=?').get(claim.giveaway_id, claim.winner_id)?.roblox_username || 'Not provided';
    await i.channel.send({
      content: `<@${claim.host_id}> The winner has claimed **${getGiveaway.get(claim.giveaway_id)?.prize || 'the prize'}**. Their Roblox username is **${robloxUsername}**.`,
      allowedMentions: { users: [claim.host_id], roles: [] }
    }).catch(() => {});
    return i.reply({ embeds: [successEmbed('Giveaway Claimed', 'Your claim was saved and the host was pinged with your Roblox username.')], ephemeral: true });
  }

  if (action === 'giveaway_fulfilled') {
    if (!isWinner && !isHost) return i.reply({ embeds: [errorEmbed('Not Allowed', 'Only the giveaway winner and host can confirm fulfillment.')], ephemeral: true });
    if (!claim.claimed) return i.reply({ embeds: [errorEmbed('Not Claimed Yet', 'The winner must press **Claim** first.')], ephemeral: true });
    ensureVotes.run(id);
    const field = isWinner ? 'winner_fulfilled' : 'host_fulfilled';
    db.prepare(`UPDATE giveaway_ticket_votes SET ${field}=1 WHERE claim_id=?`).run(id);
    const votes = getVotes.get(id);
    if (isHost && !votes.winner_fulfilled) {
      const existing = claim.fulfillment_prompt_message_id
        ? await i.channel.messages.fetch(claim.fulfillment_prompt_message_id).catch(() => null)
        : null;
      if (!existing) {
        const prompt = await i.channel.send({
          content: `<@${claim.winner_id}> The host has marked **${getGiveaway.get(claim.giveaway_id)?.prize || 'your prize'}** as sent. Press **Fulfilled** once you receive it, then close the ticket. If you have a problem with the prize or have not received it, press **Escalate** below.`,
          components: [escalationRow(id)],
          allowedMentions: { users: [claim.winner_id], roles: [] }
        });
        db.prepare('UPDATE giveaway_claims SET fulfillment_prompt_message_id=? WHERE id=?').run(prompt.id, id);
      }
    }
    if (votes.winner_fulfilled && votes.host_fulfilled) {
      db.prepare("UPDATE giveaway_claims SET resolved=1,status='fulfilled',fulfilled_at=? WHERE id=?").run(Date.now(), id);
      const latest = getClaim.get(id);
      if (latest.fulfillment_prompt_message_id) {
        const prompt = await i.channel.messages.fetch(latest.fulfillment_prompt_message_id).catch(() => null);
        if (prompt) await prompt.delete().catch(() => {});
        db.prepare('UPDATE giveaway_claims SET fulfillment_prompt_message_id=NULL WHERE id=?').run(id);
      }
    }
    await refreshTicketMessage(i.channel, id, false);
    const bothDone = votes.winner_fulfilled && votes.host_fulfilled;
    return i.reply({ embeds: [successEmbed('Fulfillment Saved', bothDone ? 'Both parties confirmed fulfillment. The ticket can now be closed.' : 'Your confirmation was saved. Waiting for the other party.')], ephemeral: true });
  }


  if (action === 'giveaway_escalate') {
    if (!isWinner) return i.reply({ embeds: [errorEmbed('Not Allowed', 'Only the giveaway winner can escalate this ticket.')], ephemeral: true });
    const staffRole = getConfig(i.guild.id, 'giveaway_staff_role');
    const managerRole = getConfig(i.guild.id, 'giveaway_manager_role');
    const roleIds = [...new Set([staffRole, managerRole].filter(Boolean))];
    if (!roleIds.length) {
      return i.reply({ embeds: [errorEmbed('Escalation Roles Not Configured', 'An admin must set the giveaway staff and/or manager role first.')], ephemeral: true });
    }
    for (const roleId of roleIds) {
      await i.channel.permissionOverwrites.edit(roleId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        AddReactions: true,
        SendMessagesInThreads: true
      }).catch(() => {});
    }
    db.prepare('UPDATE giveaway_claims SET escalated=1 WHERE id=?').run(id);
    const mentions = roleIds.map(roleId => `<@&${roleId}>`).join(' ');
    await i.reply({
      content: `${mentions} Giveaway issue escalated by <@${claim.winner_id}> for **${getGiveaway.get(claim.giveaway_id)?.prize || 'a prize'}**. Please review this ticket.`,
      allowedMentions: { roles: roleIds, users: [claim.winner_id] }
    });
    return;
  }

  if (action === 'giveaway_close') {
    if (!isWinner && !isHost && !isStaff) return i.reply({ embeds: [errorEmbed('Not Allowed')], ephemeral: true });
    ensureVotes.run(id);
    const votes = getVotes.get(id);
    if (!votes.winner_fulfilled || !votes.host_fulfilled) return i.reply({ embeds: [errorEmbed('Cannot Close Yet', 'Both the winner and host must press **Fulfilled** before this ticket can be closed.')], ephemeral: true });
    await i.deferReply();
    await sendTranscript(i.guild, i.channel, claim).catch(() => {});
    ensureVotes.run(id);
    db.prepare('UPDATE giveaway_ticket_votes SET closed=1 WHERE claim_id=?').run(id);
    await i.channel.permissionOverwrites.edit(claim.winner_id, { SendMessages: false }).catch(() => {});
    await i.channel.permissionOverwrites.edit(claim.host_id, { SendMessages: false }).catch(() => {});
    await refreshTicketMessage(i.channel, id, true);
    return i.editReply({ embeds: [infoEmbed('Ticket Closed', 'Transcript created. Use **Reopen** or **Delete** below.')] });
  }

  if (action === 'giveaway_reopen') {
    if (!isHost && !isStaff) return i.reply({ embeds: [errorEmbed('Not Allowed', 'Only the host or staff can reopen this ticket.')], ephemeral: true });
    db.prepare('UPDATE giveaway_ticket_votes SET closed=0,transcript_sent=0 WHERE claim_id=?').run(id);
    await i.channel.permissionOverwrites.edit(claim.winner_id, { SendMessages: true }).catch(() => {});
    await i.channel.permissionOverwrites.edit(claim.host_id, { SendMessages: true }).catch(() => {});
    await refreshTicketMessage(i.channel, id, false);
    return i.reply({ embeds: [successEmbed('Ticket Reopened')], ephemeral: true });
  }

  if (action === 'giveaway_delete') {
    if (!isHost && !isStaff) return i.reply({ embeds: [errorEmbed('Not Allowed', 'Only the host or staff can delete this ticket.')], ephemeral: true });
    await sendTranscript(i.guild, i.channel, claim).catch(() => {});
    await i.reply({ embeds: [infoEmbed('Deleting Ticket', 'This channel will be deleted in 3 seconds.')] });
    return setTimeout(() => i.channel.delete().catch(() => {}), 3000);
  }
}

function startScheduler(client) {
  setInterval(async () => {
    for (const giveaway of dueGiveaways.all(Date.now())) await endGiveaway(client, giveaway.id).catch(error => console.error('[giveaway scheduler]', error));
    for (const claim of dueClaims.all(Date.now())) await rerollExpired(client, claim).catch(error => console.error('[claim scheduler]', error));
  }, 15_000);
}

module.exports = { handleInteraction, entryComponents, giveawayEmbed, refreshGiveawayMessage, endGiveaway, startScheduler, updateLocked, getGiveawayByMessage };
