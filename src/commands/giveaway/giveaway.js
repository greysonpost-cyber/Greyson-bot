const { SlashCommandBuilder, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { entryButton, giveawayEmbed, endGiveaway, updateLocked, getGiveawayByMessage } = require('../../handlers/giveawayHandler');

const insert = db.prepare(`INSERT INTO giveaways
  (guild_id,channel_id,prize,hosted_by,winner_count,required_role_id,required_guild_rank,ends_at,created_at)
  VALUES (?,?,?,?,?,?,?,?,?)`);
const get = db.prepare('SELECT * FROM giveaways WHERE id=?');

function duration(value) {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
  return match ? Number(match[1]) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()]) : null;
}

function parseDiscordMessageLink(value) {
  const match = /^https?:\/\/(?:www\.)?(?:discord\.com|discordapp\.com)\/channels\/(\d+)\/(\d+)\/(\d+)(?:\?.*)?$/.exec(value.trim());
  if (!match) return null;
  return { guildId: match[1], channelId: match[2], messageId: match[3] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Run giveaways')
    .addSubcommand(subcommand => subcommand
      .setName('start')
      .setDescription('Start a giveaway; configured role bonuses apply automatically')
      .addStringOption(option => option.setName('prize').setDescription('Prize').setRequired(true))
      .addStringOption(option => option.setName('duration').setDescription('30m, 2h, 1d').setRequired(true))
      .addChannelOption(option => option.setName('channel').setDescription('Post channel').addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(option => option.setName('winners').setDescription('Winner count').setMinValue(1).setMaxValue(20))
      .addRoleOption(option => option.setName('required_role').setDescription('Required Discord role'))
      .addStringOption(option => option.setName('required_guild_role').setDescription('Required guild role/rank')))
    .addSubcommand(subcommand => subcommand
      .setName('end')
      .setDescription('End early')
      .addIntegerOption(option => option.setName('giveaway_id').setDescription('ID').setRequired(true)))
    .addSubcommand(subcommand => subcommand
      .setName('reroll')
      .setDescription('Reroll an ended giveaway by pasting its Discord message link')
      .addStringOption(option => option.setName('message_link').setDescription('Giveaway message link').setRequired(true)))
    .addSubcommand(subcommand => subcommand
      .setName('lock')
      .setDescription('Lock/unlock entries')
      .addIntegerOption(option => option.setName('giveaway_id').setDescription('ID').setRequired(true))
      .addBooleanOption(option => option.setName('locked').setDescription('Locked?').setRequired(true))),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'start') {
      const milliseconds = duration(interaction.options.getString('duration'));
      if (!milliseconds) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Duration', 'Use `30m`, `2h`, or `1d`.')], ephemeral: true });
      }

      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const prize = interaction.options.getString('prize');
      const winnerCount = interaction.options.getInteger('winners') || 1;
      const requiredRole = interaction.options.getRole('required_role');
      const requiredGuildRole = interaction.options.getString('required_guild_role');
      const info = insert.run(
        interaction.guild.id,
        channel.id,
        prize,
        interaction.user.id,
        winnerCount,
        requiredRole?.id || null,
        requiredGuildRole || null,
        Date.now() + milliseconds,
        Date.now()
      );
      const giveaway = get.get(info.lastInsertRowid);
      const message = await channel.send({ embeds: [giveawayEmbed(giveaway)], components: [entryButton(giveaway)] });
      db.prepare('UPDATE giveaways SET message_id=? WHERE id=?').run(message.id, giveaway.id);
      return interaction.reply({
        embeds: [successEmbed('Giveaway Started', `**#${giveaway.id}** posted in ${channel}. Winners must display the **DRIP** server tag.`)],
        ephemeral: true
      });
    }

    let giveaway;
    let giveawayId;

    if (subcommand === 'reroll') {
      const parsed = parseDiscordMessageLink(interaction.options.getString('message_link'));
      if (!parsed || parsed.guildId !== interaction.guild.id) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Message Link', 'Paste the giveaway message link from this server.')], ephemeral: true });
      }
      giveaway = getGiveawayByMessage.get(parsed.messageId);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id || giveaway.channel_id !== parsed.channelId) {
        return interaction.reply({ embeds: [errorEmbed('Giveaway Not Found', 'That message is not a giveaway created by DripCore.')], ephemeral: true });
      }
      giveawayId = giveaway.id;
    } else {
      giveawayId = interaction.options.getInteger('giveaway_id');
      giveaway = get.get(giveawayId);
    }

    if (!giveaway || giveaway.guild_id !== interaction.guild.id) {
      return interaction.reply({ embeds: [errorEmbed('Not Found')], ephemeral: true });
    }

    if (subcommand === 'lock') {
      const locked = interaction.options.getBoolean('locked');
      updateLocked.run(locked ? 1 : 0, giveawayId);
      return interaction.reply({ embeds: [successEmbed(locked ? 'Giveaway Locked' : 'Giveaway Unlocked')], ephemeral: true });
    }

    if (subcommand === 'end') {
      if (giveaway.ended) return interaction.reply({ embeds: [errorEmbed('Already Ended')], ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await endGiveaway(client, giveawayId);
      return interaction.editReply({ embeds: [successEmbed('Giveaway Ended')] });
    }

    if (subcommand === 'reroll') {
      if (!giveaway.ended) return interaction.reply({ embeds: [errorEmbed('Not Ended Yet')], ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await endGiveaway(client, giveawayId, { reroll: true });
      return interaction.editReply({ embeds: [successEmbed('Giveaway Rerolled')] });
    }
  }
};
