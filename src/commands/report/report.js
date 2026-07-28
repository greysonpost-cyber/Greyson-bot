const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed, BRAND } = require('../../utils/embeds');
const { getConfig } = require('../../utils/config');
const { sendLog } = require('../../utils/logger');

const REASONS = [
    { name: 'Harassment', value: 'harassment' },
    { name: 'Spam / Advertising', value: 'spam' },
    { name: 'Hacking / Exploiting', value: 'hacking' },
    { name: 'Scamming / Middleman Fraud', value: 'scamming' },
    { name: 'Inappropriate Content (NSFW)', value: 'nsfw' },
    { name: 'Impersonation', value: 'impersonation' },
    { name: 'Other (use comments)', value: 'other' },
];

const insertReport = db.prepare(
    `INSERT INTO reports (guild_id, reporter_id, reported_user_id, reason, evidence_url, comments, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
);
const updateReportMessage = db.prepare(`UPDATE reports SET staff_message_id = ?, thread_id = ? WHERE id = ?`);

function statusButtons(reportId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`report_accept:${reportId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`report_deny:${reportId}`).setLabel('Deny').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`report_evidence:${reportId}`).setLabel('Need More Evidence').setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`report_warned:${reportId}`).setLabel('Warned').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`report_muted:${reportId}`).setLabel('Muted').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`report_kicked:${reportId}`).setLabel('Kicked').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`report_banned:${reportId}`).setLabel('Banned').setStyle(ButtonStyle.Danger),
        ),
    ];
}

module.exports = {
    REASONS,
    statusButtons,
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Report a user to staff')
        .addUserOption(o => o.setName('user').setDescription('The user you are reporting').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for the report').setRequired(true)
            .addChoices(...REASONS))
        .addAttachmentOption(o => o.setName('evidence').setDescription('Screenshot/video proof').setRequired(false))
        .addStringOption(o => o.setName('comments').setDescription('Additional details').setRequired(false)),

    async execute(interaction) {
        const reportChannelId = getConfig(interaction.guild.id, 'report_channel');
        if (!reportChannelId) {
            return interaction.reply({ embeds: [errorEmbed('Not Configured', 'Staff have not set a reports channel yet. Ask an admin to run `/config set-channel key:report_channel`.')], ephemeral: true });
        }
        const reportChannel = await interaction.guild.channels.fetch(reportChannelId).catch(() => null);
        if (!reportChannel) return interaction.reply({ embeds: [errorEmbed('Reports Channel Missing')], ephemeral: true });

        const reportedUser = interaction.options.getUser('user');
        if (reportedUser.id === interaction.user.id) {
            return interaction.reply({ embeds: [errorEmbed('Invalid Target', "You can't report yourself.")], ephemeral: true });
        }
        const reasonValue = interaction.options.getString('reason');
        const reasonLabel = REASONS.find(r => r.value === reasonValue)?.name ?? reasonValue;
        const evidence = interaction.options.getAttachment('evidence');
        const comments = interaction.options.getString('comments');

        const info = insertReport.run(
            interaction.guild.id, interaction.user.id, reportedUser.id, reasonLabel,
            evidence?.url ?? null, comments ?? null, Date.now(), Date.now()
        );
        const reportId = info.lastInsertRowid;

        const embed = infoEmbed('🚩 New Report', null)
            .addFields(
                { name: 'Reported User', value: `<@${reportedUser.id}> (${reportedUser.tag})`, inline: true },
                { name: 'Reporter', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Reason', value: reasonLabel, inline: true },
                { name: 'Status', value: 'Pending', inline: true },
            );
        if (comments) embed.addFields({ name: 'Comments', value: comments });
        if (evidence) embed.setImage(evidence.contentType?.startsWith('image/') ? evidence.url : null);
        embed.setFooter({ text: `Report #${reportId}`, iconURL: BRAND.footerIcon });

        const staffMsg = await reportChannel.send({
            embeds: [embed],
            components: statusButtons(reportId),
            files: evidence && !evidence.contentType?.startsWith('image/') ? [evidence.url] : [],
        });

        let threadId = null;
        if (getConfig(interaction.guild.id, 'report_thread_enabled') === 'true' && reportChannel.type === ChannelType.GuildText) {
            const thread = await staffMsg.startThread({ name: `Report #${reportId} - ${reportedUser.username}` }).catch(() => null);
            threadId = thread?.id ?? null;
        }
        updateReportMessage.run(staffMsg.id, threadId, reportId);

        await sendLog(interaction.guild, 'log_channel_report', { title: 'Report Submitted', description: `Report #${reportId}: <@${interaction.user.id}> reported <@${reportedUser.id}> for **${reasonLabel}**` });

        return interaction.reply({ embeds: [successEmbed('Report Submitted', `Your report has been sent to staff. Report ID: **#${reportId}**. You'll receive a DM when its status changes.`)], ephemeral: true });
    },
};
