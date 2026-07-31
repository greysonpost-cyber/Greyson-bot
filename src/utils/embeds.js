const { EmbedBuilder } = require('discord.js');

const BRAND = {
    colors: [0xE62429, 0x1464F4, 0x8B1CFB, 0x22D3EE],
    errorColor: 0xED4245,
    warnColor: 0xF5B942,
    successColor: 0x22C55E,
    footer: 'DRIPCORE • Across the Multiverse',
};
let colorIndex = 0;
function nextBrandColor() {
    const color = BRAND.colors[colorIndex % BRAND.colors.length];
    colorIndex += 1;
    return color;
}
function baseEmbed() {
    return new EmbedBuilder()
        .setColor(nextBrandColor())
        .setAuthor({ name: '🕷️ DRIPCORE • SPIDER-VERSE' })
        .setFooter({ text: BRAND.footer })
        .setTimestamp();
}
function successEmbed(title, description) {
    return baseEmbed().setColor(BRAND.successColor).setTitle(`✅ ${title}`).setDescription(description || null);
}
function errorEmbed(title, description) {
    return baseEmbed().setColor(BRAND.errorColor).setTitle(`❌ ${title}`).setDescription(description || null);
}
function infoEmbed(title, description) {
    return baseEmbed().setTitle(`🕸️ ${title}`).setDescription(description || null);
}
function warnEmbed(title, description) {
    return baseEmbed().setColor(BRAND.warnColor).setTitle(`⚠️ ${title}`).setDescription(description || null);
}
module.exports = { BRAND, baseEmbed, successEmbed, errorEmbed, infoEmbed, warnEmbed };
