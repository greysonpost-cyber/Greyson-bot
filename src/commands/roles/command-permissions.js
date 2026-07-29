const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, infoEmbed } = require('../../utils/embeds');
const { addCommandPermission, removeCommandPermission, getCommandPermissions } = require('../../utils/permissions');
const db = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder().setName('command-permissions')
    .setDescription('Choose which roles can use commands or guild subcommands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc => sc.setName('add').setDescription('Allow a role to use a command')
      .addStringOption(o => o.setName('command').setDescription('Examples: guild, guild.add, giveaway').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Allowed role').setRequired(true)))
    .addSubcommand(sc => sc.setName('remove').setDescription('Remove an allowed role')
      .addStringOption(o => o.setName('command').setDescription('Examples: guild, guild.add').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true)))
    .addSubcommand(sc => sc.setName('list').setDescription('List configured command permissions')
      .addStringOption(o => o.setName('command').setDescription('Optional command filter')))
    .addSubcommand(sc => sc.setName('clear').setDescription('Make a command unrestricted again')
      .addStringOption(o => o.setName('command').setDescription('Command name').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const command = interaction.options.getString('command')?.toLowerCase().replace(/^\//, '');
    if (sub === 'add') {
      const role = interaction.options.getRole('role'); addCommandPermission(interaction.guild.id, command, role.id);
      return interaction.reply({ embeds: [successEmbed('Permission Added', `${role} can now use \`/${command.replace('.', ' ')}\`.`)], ephemeral: true });
    }
    if (sub === 'remove') {
      const role = interaction.options.getRole('role'); removeCommandPermission(interaction.guild.id, command, role.id);
      return interaction.reply({ embeds: [successEmbed('Permission Removed')], ephemeral: true });
    }
    if (sub === 'clear') {
      db.prepare('DELETE FROM command_permissions WHERE guild_id=? AND command_name=?').run(interaction.guild.id, command);
      return interaction.reply({ embeds: [successEmbed('Permissions Cleared', `\`/${command.replace('.', ' ')}\` is unrestricted again.`)], ephemeral: true });
    }
    const rows = command ? getCommandPermissions(interaction.guild.id, command).map(role_id => ({ command_name: command, role_id })) : db.prepare('SELECT command_name,role_id FROM command_permissions WHERE guild_id=? ORDER BY command_name').all(interaction.guild.id);
    const text = rows.length ? rows.map(r => `\`/${r.command_name.replace('.', ' ')}\` → <@&${r.role_id}>`).join('\n') : 'No command permissions are configured. Commands are unrestricted unless Discord permissions block them.';
    return interaction.reply({ embeds: [infoEmbed('Command Permissions', text.slice(0, 4000))], ephemeral: true });
  }
};
