const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, infoEmbed } = require('../../utils/embeds');
const { addGrantableRole, removeGrantableRole } = require('../../utils/permissions');
const db = require('../../database/db');

const listAll = db.prepare(`SELECT granter_role_id, grantable_role_id FROM role_permissions WHERE guild_id = ?`);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('role-permissions')
        .setDescription('Configure which roles can grant which roles via /giverole')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sc => sc.setName('add')
            .setDescription('Allow a role to grant another role')
            .addRoleOption(o => o.setName('granter_role').setDescription('e.g. Elder').setRequired(true))
            .addRoleOption(o => o.setName('grantable_role').setDescription('e.g. Guild Member').setRequired(true)))
        .addSubcommand(sc => sc.setName('remove')
            .setDescription('Revoke a role-granting permission')
            .addRoleOption(o => o.setName('granter_role').setDescription('e.g. Elder').setRequired(true))
            .addRoleOption(o => o.setName('grantable_role').setDescription('e.g. Guild Member').setRequired(true)))
        .addSubcommand(sc => sc.setName('list').setDescription('List all configured role-grant permissions')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
            const granter = interaction.options.getRole('granter_role');
            const grantable = interaction.options.getRole('grantable_role');
            addGrantableRole(interaction.guild.id, granter.id, grantable.id);
            return interaction.reply({ embeds: [successEmbed('Permission Added', `Members with **${granter.name}** can now give/remove **${grantable.name}** via /giverole.`)], ephemeral: true });
        }

        if (sub === 'remove') {
            const granter = interaction.options.getRole('granter_role');
            const grantable = interaction.options.getRole('grantable_role');
            removeGrantableRole(interaction.guild.id, granter.id, grantable.id);
            return interaction.reply({ embeds: [successEmbed('Permission Removed')], ephemeral: true });
        }

        if (sub === 'list') {
            const rows = listAll.all(interaction.guild.id);
            if (!rows.length) return interaction.reply({ embeds: [infoEmbed('No Permissions Configured')], ephemeral: true });
            const desc = rows.map(r => `<@&${r.granter_role_id}> → <@&${r.grantable_role_id}>`).join('\n');
            return interaction.reply({ embeds: [infoEmbed('Role Grant Permissions', desc)], ephemeral: true });
        }
    },
};
