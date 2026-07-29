const { EmbedBuilder } = require('discord.js');

// Discord embeds only support one accent color at a time. DripCore alternates
// between the two brand-gradient endpoints so the bot keeps the gradient look.
const BRAND = {
    colors: [0x7D5CFF, 0x00C8FF],
    errorColor: 0xED4245,
    warnColor: 0xFEE75C,
    footer: 'DripCore by Greyson',
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
        .setFooter({ text: BRAND.footer })
        .setTimestamp();
}
function successEmbed(title, description) { return baseEmbed().setTitle(`✅ ${title}`).setDescription(description || null); }
function errorEmbed(title, description) { return baseEmbed().setColor(BRAND.errorColor).setTitle(`❌ ${title}`).setDescription(description || null); }
function infoEmbed(title, description) { return baseEmbed().setTitle(title).setDescription(description || null); }
function warnEmbed(title, description) { return baseEmbed().setColor(BRAND.warnColor).setTitle(`⚠️ ${title}`).setDescription(description || null); }
module.exports = { BRAND, baseEmbed, successEmbed, errorEmbed, infoEmbed, warnEmbed };
