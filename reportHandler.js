const db = require('../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');
const { logModAction } = require('./modActionHelper');

const getReport = db.prepare(`SELECT * FROM reports WHERE id = ?`);
const updateReportStatus = db.prepare(`UPDATE reports SET status = ?, handled_by = ?, updated_at = ? WHERE id = ?`);

const STATUS_LABELS = {
    accept: 'Accepted', deny: 'Denied', evidence: 'Need More Evidence',
    warned: 'Warned', muted: 'Muted', kicked: 'Kicked', banned: 'Banned',
};

async function dmReporter(client, report, statusLabel) {
    try {
        const user = await client.users.fetch(report.reporter_id);
        await user.send({ embeds: [infoEmbed('Report Update', `Your report **#${report.id}** against <@${report.reported_user_id}> is now: **${statusLabel}**`)] });
    } catch {
        // reporter has DMs closed - nothing more we can do
    }
}

async function handleInteraction(interaction, client) {
    const [action, idRaw] = interaction.customId.split(':');
    const reportId = Number(idRaw);
    const report = getReport.get(reportId);
    if (!report) return interaction.reply({ embeds: [errorEmbed('Report Not Found')], ephemeral: true });

    const key = action.replace('report_', '');
    const label = STATUS_LABELS[key];
    if (!label) return;

    updateReportStatus.run(key, interaction.user.id, Date.now(), reportId);

    // Update the original embed's "Status" field.
    const embed = interaction.message.embeds[0];
    const fields = embed.fields.map(f => f.name === 'Status' ? { ...f, value: `${label} (by <@${interaction.user.id}>)` } : f);
    await interaction.update({ embeds: [{ ...embed.data, fields }] }).catch(() => interaction.reply({ embeds: [successEmbed('Updated', label)], ephemeral: true }));

    await dmReporter(client, report, label);
    await sendLog(interaction.guild, 'log_channel_report', { title: 'Report Updated', description: `Report #${reportId} marked **${label}** by <@${interaction.user.id}>` });

    // Optionally record a corresponding moderation action for warned/muted/kicked/banned outcomes.
    if (['warned', 'muted', 'kicked', 'banned'].includes(key)) {
        logModAction(interaction.guild.id, report.reported_user_id, interaction.user.id, key === 'warned' ? 'warn' : key.replace('ed', ''), `From report #${reportId}`);
    }
}

module.exports = { handleInteraction };
