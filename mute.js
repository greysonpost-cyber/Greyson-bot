const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');
const { getConfig } = require('../../utils/config');
const { logModAction } = require('../../handlers/modActionHelper');

// Role-based mute (distinct from native /timeout) - useful when you want a mute
// that persists indefinitely or applies a custom "Muted" role with its own channel overrides.
module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Apply the configured Muted role to a member indefinitely')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

    async execute(interaction) {
        const mutedRoleId = getConfig(interaction.guild.id, 'muted_role_id');
        if (!mutedRoleId) return interaction.reply({ embeds: [errorEmbed('Not Configured', 'Set a Muted role first: `/config set-role key:muted_role_id role:@Muted`')], ephemeral: true });

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ embeds: [errorEmbed('Member Not Found')], ephemeral: true });

        await member.roles.add(mutedRoleId, reason).catch(() => null);
        logModAction(interaction.guild.id, user.id, interaction.user.id, 'mute', reason);

        await user.send({ embeds: [errorEmbed('You have been muted', `**Server:** ${interaction.guild.name}\n**Reason:** ${reason}`)] }).catch(() => {});
        await sendLog(interaction.guild, 'log_channel_mod', { title: 'Member Muted', description: `<@${user.id}> muted by <@${interaction.user.id}>`, fields: [{ name: 'Reason', value: reason }] });

        return interaction.reply({ embeds: [successEmbed('Member Muted', `<@${user.id}> has been muted.\n**Reason:** ${reason}`)] });
    },
};
