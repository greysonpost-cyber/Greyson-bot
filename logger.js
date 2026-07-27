const { getConfig } = require('./config');
const { baseEmbed } = require('./embeds');

/**
 * Sends a log embed to a configured channel for the given category.
 * `configKey` matches one of the log_channel_* keys set via /config set-log-channel.
 * Silently no-ops if that channel hasn't been configured yet, so the bot
 * never spams errors in guilds that haven't finished setup.
 */
async function sendLog(guild, configKey, { title, description, fields, color }) {
    try {
        const channelId = getConfig(guild.id, configKey);
        if (!channelId) return;
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const embed = baseEmbed().setTitle(title);
        if (description) embed.setDescription(description);
        if (fields?.length) embed.addFields(fields);
        if (color) embed.setColor(color);

        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error(`[logger] Failed to send log (${configKey}):`, err.message);
    }
}

/** Generic error logger - logs to console and, if configured, an error-log channel. */
async function logError(client, context, error) {
    console.error(`[error] ${context}:`, error);
}

module.exports = { sendLog, logError };
