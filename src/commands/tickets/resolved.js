const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { getConfig } = require('../../utils/config');

function hasConfiguredRole(member, roleId) {
  return Boolean(roleId && member.roles.cache.has(roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resolved')
    .setDescription('Resolve an escalated giveaway ticket'),

  async execute(interaction) {
    const staffRole = getConfig(interaction.guild.id, 'giveaway_staff_role');
    const managerRole = getConfig(interaction.guild.id, 'giveaway_manager_role');
    const allowed = interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      || interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
      || hasConfiguredRole(interaction.member, staffRole)
      || hasConfiguredRole(interaction.member, managerRole);

    if (!allowed) {
      return interaction.reply({
        embeds: [errorEmbed('No Permission', 'Only the configured Staff or Giveaway Manager role can resolve an escalated ticket.')],
        ephemeral: true,
      });
    }

    const claim = db.prepare(
      'SELECT * FROM giveaway_claims WHERE guild_id=? AND ticket_channel_id=?'
    ).get(interaction.guild.id, interaction.channel.id);

    if (!claim) {
      return interaction.reply({
        embeds: [errorEmbed('Not a Giveaway Ticket', 'Use this command inside an automatic giveaway claim ticket.')],
        ephemeral: true,
      });
    }

    if (!claim.escalated) {
      return interaction.reply({
        embeds: [errorEmbed('Not Escalated', 'This ticket must be escalated before staff can resolve it.')],
        ephemeral: true,
      });
    }

    db.prepare(
      "UPDATE giveaway_claims SET resolved=1,status='resolved',handled_by=? WHERE id=?"
    ).run(interaction.user.id, claim.id);


    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_delete:${claim.id}`)
        .setLabel('Delete Ticket')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      embeds: [successEmbed(
        'Ticket Resolved',
        `Resolved by <@${interaction.user.id}>. The channel remains open for the winner and host. Staff may delete the ticket below when everything is complete.`
      )],
      components: [row],
    });
  },
};
