const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { canManageClaim, deleteButton } = require('../../handlers/giveawayHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resolved')
    .setDescription('Resolve an escalated giveaway ticket')
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    if (!canManageClaim(interaction.member) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [errorEmbed('No Permission', 'Only staff or giveaway managers can resolve escalated tickets.')], ephemeral: true });
    }

    const claim = db.prepare('SELECT * FROM giveaway_claims WHERE guild_id=? AND ticket_channel_id=?').get(interaction.guild.id, interaction.channel.id);
    if (!claim) return interaction.reply({ embeds: [errorEmbed('Not a Giveaway Ticket', 'Use this command inside an automatic giveaway claim ticket.')], ephemeral: true });
    if (!claim.escalated) return interaction.reply({ embeds: [errorEmbed('Not Escalated', 'This giveaway ticket has not been escalated.')], ephemeral: true });

    const giveaway = db.prepare('SELECT * FROM giveaways WHERE id=?').get(claim.giveaway_id);
    db.prepare('UPDATE giveaway_claims SET resolved=1,handled_by=? WHERE id=?').run(interaction.user.id, claim.id);

    await interaction.channel.permissionOverwrites.edit(claim.winner_id, { SendMessages: false }).catch(() => {});
    if (giveaway?.hosted_by) await interaction.channel.permissionOverwrites.edit(giveaway.hosted_by, { SendMessages: false }).catch(() => {});

    return interaction.reply({
      embeds: [successEmbed('Ticket Resolved', `Resolved by <@${interaction.user.id}>. Staff can now delete this ticket.`)],
      components: [deleteButton(claim.id)],
    });
  },
};
