const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure DripCore automatic moderation rules')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Show the server automod rules'))
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a blocked word or phrase')
      .addStringOption(o => o.setName('phrase').setDescription('Word or phrase to block').setRequired(true))
      .addStringOption(o => o.setName('action').setDescription('Action when matched').setRequired(true)
        .addChoices(
          { name: 'Delete message', value: 'delete' },
          { name: 'Delete and alert staff', value: 'alert' }
        )))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove an automod rule')
      .addIntegerOption(o => o.setName('id').setDescription('Rule ID shown by /automod list').setRequired(true).setMinValue(1))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      const rules = db.prepare('SELECT id, pattern, action, enabled FROM automod_rules WHERE guild_id = ? ORDER BY id').all(guildId);
      const description = rules.length
        ? rules.map(r => `**#${r.id}** • \`${r.pattern}\` → **${r.action}**${r.enabled ? '' : ' *(disabled)*'}`).join('\n')
        : 'No custom automod rules are configured.';
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('DripCore Automod').setDescription(description)], ephemeral: true });
    }

    if (sub === 'add') {
      const pattern = interaction.options.getString('phrase', true).trim();
      const action = interaction.options.getString('action', true);
      if (!pattern) return interaction.reply({ content: 'Enter a valid word or phrase.', ephemeral: true });
      db.prepare(`INSERT INTO automod_rules (guild_id, rule_type, pattern, action, enabled, created_by, created_at)
                  VALUES (?, 'blocked_phrase', ?, ?, 1, ?, ?)`)
        .run(guildId, pattern, action, interaction.user.id, Date.now());
      return interaction.reply({ content: `Added \`${pattern}\` to automod with the **${action}** action.`, ephemeral: true });
    }

    const id = interaction.options.getInteger('id', true);
    const result = db.prepare('DELETE FROM automod_rules WHERE guild_id = ? AND id = ?').run(guildId, id);
    return interaction.reply({ content: result.changes ? `Removed automod rule #${id}.` : `I could not find automod rule #${id}.`, ephemeral: true });
  }
};
