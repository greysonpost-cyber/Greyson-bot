const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');
const { logModAction } = require('../../handlers/modActionHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true)),

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        logModAction(interaction.guild.id, user.id, interaction.user.id, 'warn', reason);

        await user.send({ embeds: [errorEmbed('You have been warned', `**Server:** ${interaction.guild.name}\n**Reason:** ${reason}`)] }).catch(() => {});
        await sendLog(interaction.guild, 'log_channel_mod', { title: 'Member Warned', description: `<@${user.id}> warned by <@${interaction.user.id}>`, fields: [{ name: 'Reason', value: reason }] });

        return interaction.reply({ embeds: [successEmbed('Warning Issued', `<@${user.id}> has been warned.\n**Reason:** ${reason}`)] });
    },
};
