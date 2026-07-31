const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const db = require('../database/db');
const { getConfig } = require('../utils/config');

const DROP_INTERVAL_MS = 10 * 60 * 1000;
const CLAIM_WINDOW_MS = 15 * 1000;
const CHECK_INTERVAL_MS = 2 * 1000;

let timer = null;
let running = false;

function activeEmbed(amount, expiresAt) {
  return new EmbedBuilder()
    .setColor(0x22D3EE)
    .setAuthor({ name: '🕷️ DRIPCORE • TOKEN DROP' })
    .setTitle('⚡ A Power Token Drop Appeared!')
    .setDescription([
      '━━━━━━━━━━━━━━━━━━━━',
      `Be the **first person** to claim **${amount} Power Token${amount === 1 ? '' : 's'}**!`,
      '',
      `⏳ Expires <t:${Math.floor(expiresAt / 1000)}:R>`,
      '━━━━━━━━━━━━━━━━━━━━',
    ].join('\n'))
    .setFooter({ text: 'Fastest click wins • One winner only' })
    .setTimestamp();
}

function claimedEmbed(amount, userId) {
  return new EmbedBuilder()
    .setColor(0x22C55E)
    .setAuthor({ name: '🕷️ DRIPCORE • TOKEN DROP' })
    .setTitle('⚡ Token Drop Claimed!')
    .setDescription([
      '━━━━━━━━━━━━━━━━━━━━',
      `🏆 <@${userId}> grabbed **${amount} Power Token${amount === 1 ? '' : 's'}**!`,
      '',
      'Another drop will appear in about **10 minutes**.',
      '━━━━━━━━━━━━━━━━━━━━',
    ].join('\n'))
    .setFooter({ text: 'DRIPCORE • Across the Multiverse' })
    .setTimestamp();
}

function expiredEmbed(amount) {
  return new EmbedBuilder()
    .setColor(0x6B7280)
    .setAuthor({ name: '🕷️ DRIPCORE • TOKEN DROP' })
    .setTitle('⌛ Token Drop Expired')
    .setDescription([
      '━━━━━━━━━━━━━━━━━━━━',
      `Nobody claimed the **${amount} Power Token${amount === 1 ? '' : 's'}** in time.`,
      '',
      'Stay ready—the next drop appears in about **10 minutes**.',
      '━━━━━━━━━━━━━━━━━━━━',
    ].join('\n'))
    .setFooter({ text: 'DRIPCORE • Across the Multiverse' })
    .setTimestamp();
}

function claimRow(dropId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`token_drop:${dropId}`)
      .setLabel(disabled ? 'Drop Closed' : 'Claim Power Tokens')
      .setEmoji(disabled ? '🔒' : '⚡')
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

function resolveDropChannel(guild) {
  const configured = getConfig(guild.id, 'token_drop_channel');
  if (configured) {
    const channel = guild.channels.cache.get(configured);
    if (channel?.isTextBased() && channel.viewable) return channel;
  }

  const exactGeneral = guild.channels.cache.find(
    channel => channel?.isTextBased() && channel.viewable && channel.name?.toLowerCase() === 'general',
  );
  if (exactGeneral) return exactGeneral;

  const namedGeneral = guild.channels.cache.find(
    channel => channel?.isTextBased() && channel.viewable && channel.name?.toLowerCase().includes('general'),
  );
  if (namedGeneral) return namedGeneral;

  if (guild.systemChannel?.isTextBased() && guild.systemChannel.viewable) return guild.systemChannel;
  return null;
}

async function createDrop(client, guild, now) {
  const channel = resolveDropChannel(guild);
  if (!channel) {
    db.prepare(`UPDATE token_drop_state SET next_drop_at = ? WHERE guild_id = ?`)
      .run(now + DROP_INTERVAL_MS, guild.id);
    return;
  }

  const amount = Math.floor(Math.random() * 3) + 1;
  const expiresAt = now + CLAIM_WINDOW_MS;
  const result = db.prepare(`
    INSERT INTO token_drops
      (guild_id, channel_id, message_id, amount, status, winner_id, created_at, expires_at, claimed_at)
    VALUES (?, ?, NULL, ?, 'active', NULL, ?, ?, NULL)
  `).run(guild.id, channel.id, amount, now, expiresAt);
  const dropId = Number(result.lastInsertRowid);

  try {
    const message = await channel.send({
      embeds: [activeEmbed(amount, expiresAt)],
      components: [claimRow(dropId)],
      allowedMentions: { parse: [] },
    });
    db.prepare(`UPDATE token_drops SET message_id = ? WHERE id = ?`).run(message.id, dropId);
  } catch (error) {
    console.error(`[tokenDrops] Could not post in ${guild.name}:`, error);
    db.prepare(`UPDATE token_drops SET status = 'failed' WHERE id = ?`).run(dropId);
  } finally {
    db.prepare(`UPDATE token_drop_state SET next_drop_at = ? WHERE guild_id = ?`)
      .run(now + DROP_INTERVAL_MS, guild.id);
  }
}

async function closeExpiredDrop(client, row) {
  const changed = db.prepare(`
    UPDATE token_drops
    SET status = 'expired'
    WHERE id = ? AND status = 'active' AND expires_at <= ?
  `).run(row.id, Date.now());
  if (!changed.changes) return;

  try {
    const guild = client.guilds.cache.get(row.guild_id);
    const channel = guild?.channels.cache.get(row.channel_id)
      || await client.channels.fetch(row.channel_id).catch(() => null);
    const message = channel?.isTextBased()
      ? await channel.messages.fetch(row.message_id).catch(() => null)
      : null;
    if (message) {
      await message.edit({
        embeds: [expiredEmbed(row.amount)],
        components: [claimRow(row.id, true)],
      });
    }
  } catch (error) {
    console.error('[tokenDrops] Failed to close an expired drop:', error);
  }
}

async function tick(client) {
  if (running || !client.isReady()) return;
  running = true;
  try {
    const now = Date.now();

    const expired = db.prepare(`
      SELECT * FROM token_drops
      WHERE status = 'active' AND expires_at <= ?
    `).all(now);
    for (const row of expired) await closeExpiredDrop(client, row);

    for (const guild of client.guilds.cache.values()) {
      db.prepare(`
        INSERT OR IGNORE INTO token_drop_state (guild_id, next_drop_at)
        VALUES (?, ?)
      `).run(guild.id, now + DROP_INTERVAL_MS);

      const state = db.prepare(`SELECT next_drop_at FROM token_drop_state WHERE guild_id = ?`).get(guild.id);
      if (!state || state.next_drop_at > now) continue;

      const reserved = db.prepare(`
        UPDATE token_drop_state
        SET next_drop_at = ?
        WHERE guild_id = ? AND next_drop_at <= ?
      `).run(now + DROP_INTERVAL_MS, guild.id, now);
      if (reserved.changes) await createDrop(client, guild, now);
    }
  } finally {
    running = false;
  }
}

function start(client) {
  if (timer) return;
  const begin = () => {
    tick(client).catch(error => console.error('[tokenDrops] Initial tick failed:', error));
    timer = setInterval(() => {
      tick(client).catch(error => console.error('[tokenDrops] Tick failed:', error));
    }, CHECK_INTERVAL_MS);
    timer.unref?.();
    console.log('[tokenDrops] Automatic token drops started.');
  };
  if (client.isReady()) begin();
  else client.once('ready', begin);
}

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return;
  const dropId = Number(interaction.customId.split(':')[1]);
  if (!Number.isSafeInteger(dropId)) return;

  const now = Date.now();
  let result;
  try {
    result = db.transaction(() => {
      const drop = db.prepare(`SELECT * FROM token_drops WHERE id = ?`).get(dropId);
      if (!drop || drop.guild_id !== interaction.guildId) return { state: 'missing' };
      if (drop.status === 'claimed') return { state: 'claimed', drop };
      if (drop.status !== 'active' || drop.expires_at <= now) {
        db.prepare(`UPDATE token_drops SET status = 'expired' WHERE id = ? AND status = 'active'`).run(dropId);
        return { state: 'expired', drop };
      }

      const won = db.prepare(`
        UPDATE token_drops
        SET status = 'claimed', winner_id = ?, claimed_at = ?
        WHERE id = ? AND status = 'active' AND expires_at > ?
      `).run(interaction.user.id, now, dropId, now);
      if (!won.changes) return { state: 'lost', drop };

      db.prepare(`
        INSERT INTO token_balances (guild_id, user_id, balance, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id, user_id)
        DO UPDATE SET balance = token_balances.balance + excluded.balance, updated_at = excluded.updated_at
      `).run(interaction.guildId, interaction.user.id, drop.amount, now);
      db.prepare(`
        INSERT INTO token_ledger (guild_id, user_id, amount, reason, actor_id, created_at)
        VALUES (?, ?, ?, 'Automatic token drop', 'SYSTEM', ?)
      `).run(interaction.guildId, interaction.user.id, drop.amount, now);
      return { state: 'won', drop };
    })();
  } catch (error) {
    console.error('[tokenDrops] Claim transaction failed:', error);
    return interaction.reply({ content: '❌ The drop could not be claimed. Please try again.', ephemeral: true });
  }

  if (result.state === 'won') {
    return interaction.update({
      embeds: [claimedEmbed(result.drop.amount, interaction.user.id)],
      components: [claimRow(dropId, true)],
      allowedMentions: { parse: [] },
    });
  }

  if (result.state === 'expired') {
    await interaction.message.edit({
      embeds: [expiredEmbed(result.drop.amount)],
      components: [claimRow(dropId, true)],
    }).catch(() => {});
    return interaction.reply({ content: '⌛ This token drop expired.', ephemeral: true });
  }

  if (result.state === 'claimed' || result.state === 'lost') {
    const winnerText = result.drop?.winner_id ? ` It was claimed by <@${result.drop.winner_id}>.` : '';
    return interaction.reply({ content: `⚡ Someone else claimed this drop first.${winnerText}`, ephemeral: true });
  }

  return interaction.reply({ content: '❌ This token drop no longer exists.', ephemeral: true });
}

module.exports = { start, handleInteraction };
