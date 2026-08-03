const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const arts = require('../../services/artifacts');

function ownerOnly(interaction) {
  return interaction.guild?.ownerId === interaction.user.id ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription('Configure automatic rewards for completed artifact collections')
    .addSubcommandGroup(group => group
      .setName('reward')
      .setDescription('Manage collection-completion roles')
      .addSubcommand(sub => sub
        .setName('set')
        .setDescription('Automatically award a role when a collection is completed')
        .addStringOption(option => option
          .setName('collection')
          .setDescription('Exact artifact collection name')
          .setRequired(true)
          .setAutocomplete(true))
        .addRoleOption(option => option
          .setName('role')
          .setDescription('Role awarded for completing the collection')
          .setRequired(true))
        .addBooleanOption(option => option
          .setName('remove_if_incomplete')
          .setDescription('Remove the role if the member later loses an artifact (default: yes)')))
      .addSubcommand(sub => sub
        .setName('remove')
        .setDescription('Remove an automatic collection reward')
        .addStringOption(option => option
          .setName('collection')
          .setDescription('Collection name')
          .setRequired(true)
          .setAutocomplete(true)))
      .addSubcommand(sub => sub
        .setName('view')
        .setDescription('View configured collection rewards'))
      .addSubcommand(sub => sub
        .setName('sync')
        .setDescription('Recheck every member for a collection reward')
        .addStringOption(option => option
          .setName('collection')
          .setDescription('Collection name')
          .setRequired(true)
          .setAutocomplete(true)))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const rows = db.prepare(`SELECT DISTINCT collection_name FROM artifact_types
      WHERE guild_id=? AND lower(collection_name) LIKE ? ORDER BY collection_name LIMIT 25`)
      .all(interaction.guild.id, `%${focused}%`);
    return interaction.respond(rows.map(row => ({ name: row.collection_name, value: row.collection_name })));
  },

  async execute(interaction) {
    if (!ownerOnly(interaction)) {
      return interaction.reply({ content: '❌ Server administrators only.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'set') {
      const collectionName = interaction.options.getString('collection').trim();
      const role = interaction.options.getRole('role');
      const removeIfIncomplete = interaction.options.getBoolean('remove_if_incomplete') !== false;
      const typeCount = db.prepare(`SELECT COUNT(*) c FROM artifact_types
        WHERE guild_id=? AND lower(collection_name)=lower(?)`).get(guildId, collectionName).c;
      if (!typeCount) {
        return interaction.reply({ content: `❌ No artifact collection named **${collectionName}** exists.`, ephemeral: true });
      }
      if (role.managed) {
        return interaction.reply({ content: '❌ Discord-managed roles cannot be used as collection rewards.', ephemeral: true });
      }

      db.prepare(`INSERT INTO collection_rewards(guild_id,collection_name,role_id,remove_if_incomplete,created_by,created_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(guild_id,collection_name) DO UPDATE SET
          role_id=excluded.role_id,
          remove_if_incomplete=excluded.remove_if_incomplete,
          created_by=excluded.created_by,
          created_at=excluded.created_at`)
        .run(guildId, collectionName, role.id, removeIfIncomplete ? 1 : 0, interaction.user.id, Date.now());

      await interaction.deferReply({ ephemeral: true });
      const result = await arts.syncCollectionMembers(interaction.guild, collectionName);
      const spiderVerse = collectionName.toLowerCase() === 'spider-verse';
      return interaction.editReply({
        content: spiderVerse
          ? `✅ **Spider-Verse** now awards ${role} through either completion path:
` +
            `• **Spider-Man + Web Slinger/Web Swing + Friendly Neighborhood**
` +
            `• **The Punisher** by itself
` +
            `The Punisher is not a fourth requirement.
` +
            `Role removal when incomplete: **${removeIfIncomplete ? 'Enabled' : 'Disabled'}**
` +
            `Initial sync: checked **${result.checked}**, granted **${result.granted}**, removed **${result.removed}**.`
          : `✅ **${collectionName}** now awards ${role} when all **${typeCount}** artifact types are owned.
` +
            `Role removal when incomplete: **${removeIfIncomplete ? 'Enabled' : 'Disabled'}**
` +
            `Initial sync: checked **${result.checked}**, granted **${result.granted}**, removed **${result.removed}**.`
      });
    }

    if (subcommand === 'remove') {
      const collectionName = interaction.options.getString('collection').trim();
      const existing = db.prepare(`SELECT * FROM collection_rewards
        WHERE guild_id=? AND lower(collection_name)=lower(?)`).get(guildId, collectionName);
      if (!existing) {
        return interaction.reply({ content: `❌ **${collectionName}** does not have a configured reward.`, ephemeral: true });
      }
      db.prepare('DELETE FROM collection_rewards WHERE guild_id=? AND collection_name=?')
        .run(guildId, existing.collection_name);
      return interaction.reply({
        content: `✅ Removed the automatic reward for **${existing.collection_name}**. Existing role assignments were left unchanged.`,
        ephemeral: true
      });
    }

    if (subcommand === 'sync') {
      const collectionName = interaction.options.getString('collection').trim();
      const existing = db.prepare(`SELECT * FROM collection_rewards
        WHERE guild_id=? AND lower(collection_name)=lower(?)`).get(guildId, collectionName);
      if (!existing) {
        return interaction.reply({ content: '❌ Configure that collection first with `/collection reward set`.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const result = await arts.syncCollectionMembers(interaction.guild, existing.collection_name);
      return interaction.editReply({
        content: `🔄 Synced **${existing.collection_name}**: checked **${result.checked}**, granted **${result.granted}**, removed **${result.removed}**.`
      });
    }

    const rows = db.prepare(`SELECT r.*,
      (SELECT COUNT(*) FROM artifact_types t WHERE t.guild_id=r.guild_id AND lower(t.collection_name)=lower(r.collection_name)) AS type_count
      FROM collection_rewards r WHERE r.guild_id=? ORDER BY r.collection_name`).all(guildId);
    return interaction.reply({
      content: rows.length
        ? `🏆 **Collection Rewards**\n${rows.map(row =>
            row.collection_name.toLowerCase() === 'spider-verse'
              ? `• **Spider-Verse** (original 3 OR The Punisher) → <@&${row.role_id}> • Remove if incomplete: **${row.remove_if_incomplete ? 'Yes' : 'No'}**`
              : `• **${row.collection_name}** (${row.type_count} artifacts) → <@&${row.role_id}> • Remove if incomplete: **${row.remove_if_incomplete ? 'Yes' : 'No'}**`
          ).join('\n')}`
        : '🏆 No collection rewards are configured yet.',
      ephemeral: true
    });
  }
};
