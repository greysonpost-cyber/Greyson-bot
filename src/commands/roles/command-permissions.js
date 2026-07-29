const {
  SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const { successEmbed, infoEmbed, errorEmbed } = require('../../utils/embeds');
const db = require('../../database/db');

const GROUPS = {
  guild: [
    ['guild', 'All Guild Commands'], ['guild.add', 'Add Guild Member'], ['guild.edit-user', 'Edit Roblox User'],
    ['guild.set-role', 'Set Guild Role'], ['guild.remove', 'Remove Guild Member'], ['guild.view', 'View Guild Member'],
    ['guild.list', 'List Guild Members'], ['guild.stats', 'Guild Stats'], ['guild.refresh-list', 'Refresh Live Roster']
  ],
  giveaways: [
    ['giveaway', 'All Giveaway Commands'], ['giveaway.start', 'Start Giveaway'], ['giveaway.end', 'End Giveaway'],
    ['giveaway.reroll', 'Reroll Giveaway'], ['giveaway.lock', 'Lock Giveaway'],
    ['giveaway-config', 'All Giveaway Configuration'], ['giveaway-config.bonus-role', 'Bonus Entry Roles'],
    ['giveaway-config.claim-time', 'Claim Time Roles'], ['giveaway-config.auto-claim', 'Auto Claim Roles'],
    ['giveaway-config.default-time', 'Default Claim Time'], ['giveaway-config.ticket-category', 'Ticket Category'],
    ['giveaway-config.staff-role', 'Giveaway Staff Role']
  ],
  moderation: [
    ['warn', 'Warn'], ['mute', 'Mute'], ['timeout', 'Timeout'], ['kick', 'Kick'], ['ban', 'Ban'],
    ['unban', 'Unban'], ['history', 'History'], ['notes', 'Notes'], ['report', 'Reports'], ['automod', 'Automod']
  ],
  roles: [
    ['giverole', 'Give Role'], ['role-permissions', 'Role Assignment Permissions'],
    ['command-permissions', 'Command Permission Configuration'], ['config', 'Bot Configuration']
  ],
  ai: [['ai', 'All AI Commands'], ['ai.set-info', 'Set AI Information'], ['ai.set-prompt', 'Set AI Prompt'], ['ai.enable', 'Enable AI'], ['ai.disable', 'Disable AI']],
  utility: [
    ['avatar', 'Avatar'], ['botinfo', 'Bot Info'], ['membercount', 'Member Count'], ['ping', 'Ping'],
    ['poll', 'Poll'], ['roleinfo', 'Role Info'], ['serverinfo', 'Server Info'], ['userinfo', 'User Info']
  ]
};

function commandMenu(roleId, action, group) {
  const choices = GROUPS[group];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`permission_commands:${action}:${roleId}:${group}`)
      .setPlaceholder('Select one or more commands')
      .setMinValues(1)
      .setMaxValues(Math.min(choices.length, 25))
      .addOptions(choices.map(([value, label]) => ({ label, value })))
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('command-permissions')
    .setDescription('Choose commands a role can use from selectable menus')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc => sc.setName('manage').setDescription('Add or remove several commands for a role')
      .addRoleOption(o => o.setName('role').setDescription('Role to configure').setRequired(true))
      .addStringOption(o => o.setName('action').setDescription('Add or remove permission').setRequired(true)
        .addChoices({ name: 'Add permissions', value: 'add' }, { name: 'Remove permissions', value: 'remove' }))
      .addStringOption(o => o.setName('category').setDescription('Command category').setRequired(true)
        .addChoices(
          { name: 'Guild', value: 'guild' }, { name: 'Giveaways', value: 'giveaways' },
          { name: 'Moderation', value: 'moderation' }, { name: 'Roles and Config', value: 'roles' },
          { name: 'AI', value: 'ai' }, { name: 'Utility', value: 'utility' }
        )))
    .addSubcommand(sc => sc.setName('list').setDescription('List permissions for a role')
      .addRoleOption(o => o.setName('role').setDescription('Role to inspect').setRequired(true)))
    .addSubcommand(sc => sc.setName('clear-role').setDescription('Remove all configured command permissions for a role')
      .addRoleOption(o => o.setName('role').setDescription('Role to clear').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole('role');
    if (sub === 'manage') {
      const action = interaction.options.getString('action');
      const group = interaction.options.getString('category');
      return interaction.reply({
        embeds: [infoEmbed('Select Commands', `${action === 'add' ? 'Add' : 'Remove'} permissions for ${role}. You can select multiple commands at once.`)],
        components: [commandMenu(role.id, action, group)],
        ephemeral: true
      });
    }
    if (sub === 'clear-role') {
      db.prepare('DELETE FROM command_permissions WHERE guild_id=? AND role_id=?').run(interaction.guild.id, role.id);
      return interaction.reply({ embeds: [successEmbed('Permissions Cleared', `All DripCore command permissions were removed from ${role}.`)], ephemeral: true });
    }
    const rows = db.prepare('SELECT command_name FROM command_permissions WHERE guild_id=? AND role_id=? ORDER BY command_name').all(interaction.guild.id, role.id);
    const text = rows.length ? rows.map(row => `• \`/${row.command_name.replaceAll('.', ' ')}\``).join('\n') : 'No commands are configured for this role.';
    return interaction.reply({ embeds: [infoEmbed(`Permissions for ${role.name}`, text)], ephemeral: true });
  },

  async handleInteraction(interaction) {
    const [, action, roleId, group] = interaction.customId.split(':');
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [errorEmbed('Administrator Required')], ephemeral: true });
    }
    const insert = db.prepare('INSERT OR IGNORE INTO command_permissions (guild_id,command_name,role_id) VALUES (?,?,?)');
    const remove = db.prepare('DELETE FROM command_permissions WHERE guild_id=? AND command_name=? AND role_id=?');
    const transaction = db.transaction(values => {
      for (const command of values) {
        if (action === 'add') insert.run(interaction.guild.id, command, roleId);
        else remove.run(interaction.guild.id, command, roleId);
      }
    });
    transaction(interaction.values);
    const role = interaction.guild.roles.cache.get(roleId);
    return interaction.update({
      embeds: [successEmbed(action === 'add' ? 'Permissions Added' : 'Permissions Removed', `${interaction.values.length} command permission(s) updated for ${role || `<@&${roleId}>`}.`)],
      components: []
    });
  }
};
