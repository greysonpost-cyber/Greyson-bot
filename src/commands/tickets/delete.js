const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const db = require('../../database/db');
const { errorEmbed, infoEmbed } = require('../../utils/embeds');
const { getConfig } = require('../../utils/config');
const { sendLog } = require('../../utils/logger');

async function generateTranscript(channel) {
    const messages = [];
    let before;
    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
        if (!batch || batch.size === 0) break;
        messages.push(...batch.values());
        before = batch.last().id;
        if (batch.size < 100 || messages.length >= 2000) break;
    }
    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const lines = messages.map(m => {
        const time = new Date(m.createdTimestamp).toISOString();
        const attachments = [...m.attachments.values()].map(a => a.url).join(' ');
        return `[${time}] ${m.author?.tag || m.author?.username || 'Unknown'} (${m.author?.id || 'unknown'}): ${m.cleanContent || ''}${attachments ? ` ${attachments}` : ''}`;
    });
    return Buffer.from(lines.join('\n') || 'No messages were available.', 'utf8');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete the current ticket channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ embeds: [errorEmbed('Admin Only', 'Only server administrators can delete tickets with this command.')], ephemeral: true });
        }

        const normalTicket = db.prepare('SELECT * FROM tickets WHERE guild_id=? AND channel_id=?').get(interaction.guild.id, interaction.channel.id);
        const giveawayTicket = db.prepare('SELECT * FROM giveaway_claims WHERE guild_id=? AND ticket_channel_id=?').get(interaction.guild.id, interaction.channel.id);
        if (!normalTicket && !giveawayTicket) {
            return interaction.reply({ embeds: [errorEmbed('Not a Ticket', 'Use `/delete` inside a regular ticket or giveaway claim ticket.')], ephemeral: true });
        }

        await interaction.deferReply();
        const transcript = await generateTranscript(interaction.channel);
        const label = normalTicket ? `ticket-${normalTicket.id}` : `giveaway-claim-${giveawayTicket.id}`;
        const transcriptChannelId = getConfig(interaction.guild.id, 'ticket_transcript_channel');
        if (transcriptChannelId) {
            const transcriptChannel = await interaction.guild.channels.fetch(transcriptChannelId).catch(() => null);
            if (transcriptChannel) {
                await transcriptChannel.send({
                    embeds: [infoEmbed('Admin Ticket Deletion', `**${label}** was deleted by <@${interaction.user.id}> from <#${interaction.channel.id}>.`)],
                    files: [new AttachmentBuilder(transcript, { name: `${label}-transcript.txt` })],
                }).catch(() => {});
            }
        }

        if (normalTicket) {
            db.prepare("UPDATE tickets SET status='deleted', closed_at=?, closed_by=? WHERE id=?")
                .run(Date.now(), interaction.user.id, normalTicket.id);
        }
        if (giveawayTicket) {
            db.prepare('UPDATE giveaway_claims SET ticket_channel_id=NULL WHERE id=?').run(giveawayTicket.id);
        }

        await sendLog(interaction.guild, 'log_channel_ticket', {
            title: 'Ticket Deleted by Admin',
            description: `${label} deleted by <@${interaction.user.id}>`,
        }).catch(() => {});

        await interaction.editReply({ embeds: [infoEmbed('Deleting Ticket', 'This ticket will be deleted in 3 seconds.')] });
        setTimeout(() => interaction.channel.delete(`Admin /delete used by ${interaction.user.tag}`).catch(() => {}), 3000);
    },
};
