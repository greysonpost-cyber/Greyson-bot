const { EmbedBuilder } = require('discord.js');

const COLORS = {
  spiderRed: 0xE62429,
  spiderBlue: 0x1464F4,
  neonCyan: 0x22D3EE,
  limited: 0xE62429,
  legendary: 0xF5B942,
  secret: 0x8B1CFB,
  common: 0x94A3B8,
};

function rarityColor(rarity) {
  const key = String(rarity || '').toLowerCase();
  return COLORS[key] || COLORS.spiderBlue;
}
function rarityEmoji(rarity) {
  const key = String(rarity || '').toLowerCase();
  return ({ limited: '🕷️', legendary: '🌟', secret: '🌀', rare: '💎', common: '⚪' })[key] || '🕸️';
}
function divider() { return '━━━━━━━━━━━━━━━━━━━━'; }
function economyEmbed(title, description, color = COLORS.spiderBlue) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: 'DRIPCORE • SPIDER-VERSE ECONOMY' })
    .setTitle(title)
    .setDescription(description || null)
    .setFooter({ text: '🕷️ Power Tokens • Artifacts • Multiverse Trading' })
    .setTimestamp();
}
function rarityLabel(rarity) {
  return `${rarityEmoji(rarity)} ${String(rarity || 'Unknown').toUpperCase()}`;
}
module.exports = { COLORS, rarityColor, rarityEmoji, rarityLabel, divider, economyEmbed };
