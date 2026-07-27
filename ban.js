const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');
const { logModAction } = require('../../handlers/modActionHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
        .addIntegerOption(o => o.setName('delete_days').setDescription('Days of message history to delete (0-7)').setMinValue(0).setMaxValue(7)),

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

        await user.send({ embeds: [errorEmbed('You have been banned', `**Server:** ${interaction.guild.name}\n**Reason:** ${reason}`)] }).catch(() => {});
        await interaction.guild.members.ban(user.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
        logModAction(interaction.guild.id, user.id, interaction.user.id, 'ban', reason);
        await sendLog(interaction.guild, 'log_channel_mod', { title: 'Member Banned', description: `<@${user.id}> banned by <@${interaction.user.id}>`, fields: [{ name: 'Reason', value: reason }] });

        return interaction.reply({ embeds: [successEmbed('Member Banned', `<@${user.id}> has been banned.\n**Reason:** ${reason}`)] });
    },
};
