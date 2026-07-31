const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const { economyEmbed, COLORS, divider } = require('../utils/economyTheme');

function payload(guildId) {
  const rows = db.prepare('SELECT user_id,balance FROM token_balances WHERE guild_id=? ORDER BY balance DESC,updated_at ASC LIMIT 15').all(guildId);
  const medals = ['🥇','🥈','🥉'];
  const lines = rows.map((r, i) => `${medals[i] || `**${i+1}.**`} <@${r.user_id}> — **${r.balance} PT**`);
  return {
    embeds: [economyEmbed('🏆 LIVE POWER TOKEN LEADERBOARD', `${divider()}\n${lines.join('\n') || 'No Power Tokens have been earned yet.'}\n${divider()}\n*Press refresh for the latest live balances.*`, COLORS.neonCyan).setTimestamp()],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('econ_token_leaderboard').setLabel('Refresh Live Leaderboard').setEmoji('🔄').setStyle(ButtonStyle.Primary))],
    allowedMentions: { parse: [] },
  };
}
module.exports = { payload };
