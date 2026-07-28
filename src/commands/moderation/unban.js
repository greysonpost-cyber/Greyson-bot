const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');
const { logModAction } = require('../../handlers/modActionHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user by ID')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption(o => o.setName('user_id').setDescription('The user ID to unban').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

    async execute(interaction) {
        const userId = interaction.options.getString('user_id');
        const reason = interaction.options.getString('reason');

        const bans = await interaction.guild.bans.fetch();
        if (!bans.has(userId)) return interaction.reply({ embeds: [errorEmbed('Not Banned', 'That user ID is not currently banned.')], ephemeral: true });

        await interaction.guild.members.unban(userId, reason);
        logModAction(interaction.guild.id, userId, interaction.user.id, 'unban', reason);
        await sendLog(interaction.guild, 'log_channel_mod', { title: 'Member Unbanned', description: `<@${userId}> unbanned by <@${interaction.user.id}>`, fields: [{ name: 'Reason', value: reason }] });

        return interaction.reply({ embeds: [successEmbed('Member Unbanned', `<@${userId}> has been unbanned.\n**Reason:** ${reason}`)] });
    },
};
