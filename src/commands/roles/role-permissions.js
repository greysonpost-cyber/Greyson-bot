const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
} = require('discord.js');
const { successEmbed, infoEmbed, errorEmbed } = require('../../utils/embeds');
const { addGrantableRole, removeGrantableRole } = require('../../utils/permissions');
const db = require('../../database/db');

const listAll = db.prepare('SELECT granter_role_id, grantable_role_id FROM role_permissions WHERE guild_id = ?');
const listForRole = db.prepare('SELECT grantable_role_id FROM role_permissions WHERE guild_id = ? AND granter_role_id = ?');
const clearForRole = db.prepare('DELETE FROM role_permissions WHERE guild_id = ? AND granter_role_id = ?');
const insertPermission = db.prepare('INSERT OR IGNORE INTO role_permissions (guild_id, granter_role_id, grantable_role_id) VALUES (?, ?, ?)');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role-permissions')
    .setDescription('Configure which roles can grant which roles via /giverole')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc => sc.setName('manage')
      .setDescription('Choose every role a staff role may give or remove')
      .addRoleOption(o => o.setName('granter_role').setDescription('Role using /giverole, such as Elder').setRequired(true)))
    .addSubcommand(sc => sc.setName('add')
      .setDescription('Allow a role to grant another role')
      .addRoleOption(o => o.setName('granter_role').setDescription('e.g. Elder').setRequired(true))
      .addRoleOption(o => o.setName('grantable_role').setDescription('e.g. Guild Member').setRequired(true)))
    .addSubcommand(sc => sc.setName('remove')
      .setDescription('Revoke a role-granting permission')
      .addRoleOption(o => o.setName('granter_role').setDescription('e.g. Elder').setRequired(true))
      .addRoleOption(o => o.setName('grantable_role').setDescription('e.g. Guild Member').setRequired(true)))
    .addSubcommand(sc => sc.setName('clear')
      .setDescription('Remove every /giverole permission from one role')
      .addRoleOption(o => o.setName('granter_role').setDescription('Role to clear').setRequired(true)))
    .addSubcommand(sc => sc.setName('list').setDescription('List all configured role-grant permissions')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'manage') {
      const granter = interaction.options.getRole('granter_role');
      const existing = listForRole.all(interaction.guild.id, granter.id).map(r => r.grantable_role_id);
      const menu = new RoleSelectMenuBuilder()
        .setCustomId(`role_permissions_manage:${granter.id}`)
        .setPlaceholder(`Select roles ${granter.name} can give`)
        .setMinValues(0)
        .setMaxValues(25);
      if (existing.length && typeof menu.setDefaultRoles === 'function') menu.setDefaultRoles(...existing.slice(0, 25));
      return interaction.reply({
        embeds: [infoEmbed('Manage /giverole Permissions', `Choose every role members with ${granter} should be able to give **and remove**.\n\nSaving replaces the current list for this role.`)],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
      });
    }

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
      return interaction.reply({ embeds: [successEmbed('Permission Removed', `${granter} can no longer give/remove ${grantable}.`)], ephemeral: true });
    }

    if (sub === 'clear') {
      const granter = interaction.options.getRole('granter_role');
      clearForRole.run(interaction.guild.id, granter.id);
      return interaction.reply({ embeds: [successEmbed('Permissions Cleared', `${granter} no longer has any configured /giverole targets.`)], ephemeral: true });
    }

    const rows = listAll.all(interaction.guild.id);
    if (!rows.length) return interaction.reply({ embeds: [infoEmbed('No Permissions Configured')], ephemeral: true });
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.granter_role_id)) grouped.set(row.granter_role_id, []);
      grouped.get(row.granter_role_id).push(row.grantable_role_id);
    }
    const desc = [...grouped.entries()].map(([granter, roles]) => `<@&${granter}> → ${roles.map(id => `<@&${id}>`).join(', ')}`).join('\n');
    return interaction.reply({ embeds: [infoEmbed('Role Grant Permissions', desc.slice(0, 3900))], ephemeral: true });
  },

  async handleInteraction(interaction) {
    if (!interaction.isRoleSelectMenu() || !interaction.customId.startsWith('role_permissions_manage:')) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [errorEmbed('Not Allowed', 'Only administrators can change role permissions.')], ephemeral: true });
    }
    const granterRoleId = interaction.customId.split(':')[1];
    const selected = interaction.values.filter(roleId => roleId !== interaction.guild.roles.everyone.id);
    const save = db.transaction(() => {
      clearForRole.run(interaction.guild.id, granterRoleId);
      for (const roleId of selected) insertPermission.run(interaction.guild.id, granterRoleId, roleId);
    });
    save();
    const text = selected.length ? selected.map(id => `<@&${id}>`).join(', ') : 'No roles';
    return interaction.update({
      embeds: [successEmbed('/giverole Permissions Saved', `<@&${granterRoleId}> can now give/remove: ${text}`)],
      components: [],
    });
  },
};
