const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');
const { getGrantableRolesForMember } = require('../../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giverole')
        .setDescription('Give a member a role you are permitted to grant')
        .addSubcommand(sc => sc.setName('add')
            .setDescription('Add a role to a member')
            .addUserOption(o => o.setName('user').setDescription('Member to give the role to').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true)))
        .addSubcommand(sc => sc.setName('remove')
            .setDescription('Remove a role from a member')
            .addUserOption(o => o.setName('user').setDescription('Member to remove the role from').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');

        const grantable = getGrantableRolesForMember(interaction.member);
        const allowed = grantable === 'ALL' || grantable.includes(role.id);
        if (!allowed) {
            return interaction.reply({
                embeds: [errorEmbed('Not Permitted', `You are not configured to ${sub === 'add' ? 'give' : 'remove'} the **${role.name}** role. Ask an admin to set this up with \`/role-permissions add\`.`)],
                ephemeral: true,
            });
        }

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.reply({ embeds: [errorEmbed('Member Not Found')], ephemeral: true });

        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ embeds: [errorEmbed("Can't Assign Role", "That role is higher than or equal to my highest role - move my bot role above it in Server Settings.")], ephemeral: true });
        }

        if (sub === 'add') {
            await member.roles.add(role);
            await sendLog(interaction.guild, 'log_channel_role', { title: 'Role Given', description: `<@${interaction.user.id}> gave **${role.name}** to <@${member.id}>` });
            return interaction.reply({ embeds: [successEmbed('Role Given', `Gave **${role.name}** to <@${member.id}>.`)] });
        } else {
            await member.roles.remove(role);
            await sendLog(interaction.guild, 'log_channel_role', { title: 'Role Removed', description: `<@${interaction.user.id}> removed **${role.name}** from <@${member.id}>` });
            return interaction.reply({ embeds: [successEmbed('Role Removed', `Removed **${role.name}** from <@${member.id}>.`)] });
        }
    },
};
