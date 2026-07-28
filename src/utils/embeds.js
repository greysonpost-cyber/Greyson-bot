const { EmbedBuilder } = require('discord.js');

// Change these to match your server branding.
const BRAND = {
    color: 0x57F287,       // green - tweak to your server's theme
    errorColor: 0xED4245,
    warnColor: 0xFEE75C,
    footer: 'Grow a Garden',
    // footerIcon: 'https://your-server-icon-url.png',
};

function baseEmbed() {
    return new EmbedBuilder()
        .setColor(BRAND.color)
        .setFooter({ text: BRAND.footer, iconURL: BRAND.footerIcon })
        .setTimestamp();
}

function successEmbed(title, description) {
    return baseEmbed().setTitle(`✅ ${title}`).setDescription(description || null);
}

function errorEmbed(title, description) {
    return baseEmbed().setColor(BRAND.errorColor).setTitle(`❌ ${title}`).setDescription(description || null);
}

function infoEmbed(title, description) {
    return baseEmbed().setTitle(title).setDescription(description || null);
}

function warnEmbed(title, description) {
    return baseEmbed().setColor(BRAND.warnColor).setTitle(`⚠️ ${title}`).setDescription(description || null);
}

module.exports = { BRAND, baseEmbed, successEmbed, errorEmbed, infoEmbed, warnEmbed };
