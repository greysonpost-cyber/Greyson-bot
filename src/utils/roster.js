const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { getConfig, setConfig } = require('./config');

const list = db.prepare(`SELECT * FROM guild_members WHERE guild_id = ? AND active = 1 ORDER BY guild_rank COLLATE NOCASE, join_date ASC`);

function rosterEmbed(guildId) {
  const rows = list.all(guildId);
  const groups = new Map();
  for (const row of rows) {
    const rank = row.guild_rank || 'Member';
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank).push(row);
  }
  const embed = new EmbedBuilder().setColor(0x4f9cff).setTitle('🌱 Live Guild Roster')
    .setDescription(rows.length ? `**${rows.length} active member${rows.length === 1 ? '' : 's'}**` : 'No active guild members yet.')
    .setTimestamp().setFooter({ text: 'Updates automatically' });
  for (const [rank, members] of [...groups.entries()].slice(0, 20)) {
    const value = members.map(m => `<@${m.discord_id}> • \`${m.roblox_username}\``).join('\n').slice(0, 1024);
    embed.addFields({ name: `${rank} (${members.length})`, value: value || 'None' });
  }
  return embed;
}

async function updateRosterMessage(guild) {
  const channelId = getConfig(guild.id, 'guild_roster_channel');
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const messageId = getConfig(guild.id, 'guild_roster_message');
  let message = messageId ? await channel.messages.fetch(messageId).catch(() => null) : null;
  if (message) await message.edit({ embeds: [rosterEmbed(guild.id)] });
  else {
    message = await channel.send({ embeds: [rosterEmbed(guild.id)] });
    setConfig(guild.id, 'guild_roster_message', message.id);
  }
}

module.exports = { rosterEmbed, updateRosterMessage };
