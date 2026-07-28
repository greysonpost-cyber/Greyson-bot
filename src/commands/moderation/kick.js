const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');
const { logModAction } = require('../../handlers/modActionHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ embeds: [errorEmbed('Member Not Found')], ephemeral: true });
        if (!member.kickable) return interaction.reply({ embeds: [errorEmbed("Can't Kick", 'Role hierarchy or missing permission prevents this.')], ephemeral: true });

        await user.send({ embeds: [errorEmbed('You have been kicked', `**Server:** ${interaction.guild.name}\n**Reason:** ${reason}`)] }).catch(() => {});
        await member.kick(reason);
        logModAction(interaction.guild.id, user.id, interaction.user.id, 'kick', reason);
        await sendLog(interaction.guild, 'log_channel_mod', { title: 'Member Kicked', description: `<@${user.id}> kicked by <@${interaction.user.id}>`, fields: [{ name: 'Reason', value: reason }] });

        return interaction.reply({ embeds: [successEmbed('Member Kicked', `<@${user.id}> has been kicked.\n**Reason:** ${reason}`)] });
    },
};
