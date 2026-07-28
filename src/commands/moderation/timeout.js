const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');
const { logModAction } = require('../../handlers/modActionHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription("Timeout (Discord native) a member so they can't send messages/join voice")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('User to timeout').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes (max 40320 = 28 days)').setRequired(true).setMinValue(1).setMaxValue(40320))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const minutes = interaction.options.getInteger('minutes');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ embeds: [errorEmbed('Member Not Found')], ephemeral: true });
        if (!member.moderatable) return interaction.reply({ embeds: [errorEmbed("Can't Timeout", 'I cannot timeout this member (role hierarchy or missing permission).')], ephemeral: true });

        await member.timeout(minutes * 60_000, reason);
        logModAction(interaction.guild.id, user.id, interaction.user.id, 'timeout', reason, minutes * 60_000);

        await user.send({ embeds: [errorEmbed('You have been timed out', `**Server:** ${interaction.guild.name}\n**Duration:** ${minutes} minutes\n**Reason:** ${reason}`)] }).catch(() => {});
        await sendLog(interaction.guild, 'log_channel_mod', { title: 'Member Timed Out', description: `<@${user.id}> timed out by <@${interaction.user.id}> for ${minutes}m`, fields: [{ name: 'Reason', value: reason }] });

        return interaction.reply({ embeds: [successEmbed('Timeout Applied', `<@${user.id}> timed out for **${minutes} minutes**.\n**Reason:** ${reason}`)] });
    },
};
