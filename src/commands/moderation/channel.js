const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { getConfig } = require('../../utils/config');

function allowed(interaction, action) {
  if (interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  const roles = JSON.parse(getConfig(interaction.guild.id, `${action}_roles_json`, '[]'));
  const channels = JSON.parse(getConfig(interaction.guild.id, `${action}_channels_json`, '[]'));
  const hasRole = roles.some(id => interaction.member.roles.cache.has(id));
  const channelAllowed = !channels.length || channels.includes(interaction.channel.id);
  return hasRole && channelAllowed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Lock, unlock, or set slowmode')
    .addSubcommand(s => s.setName('lock').setDescription('Lock a channel').addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('unlock').setDescription('Unlock a channel').addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('slowmode').setDescription('Set slowmode seconds').addIntegerOption(o => o.setName('seconds').setDescription('Slowmode delay in seconds').setRequired(true).setMinValue(0).setMaxValue(21600)).addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (!allowed(interaction, sub === 'slowmode' ? 'lock' : sub)) return interaction.reply({ embeds: [errorEmbed('No Permission', 'Your role is not configured for this action in this channel.')], ephemeral: true });
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (sub === 'slowmode') {
      const seconds = interaction.options.getInteger('seconds');
      await channel.setRateLimitPerUser(seconds, `Changed by ${interaction.user.tag}`);
      return interaction.reply({ embeds: [successEmbed('Slowmode Updated', `${channel} is now set to **${seconds}s**.`)] });
    }
    const lock = sub === 'lock';
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: lock ? false : null });
    return interaction.reply({ embeds: [successEmbed(lock ? 'Channel Locked' : 'Channel Unlocked', `${channel} was ${lock ? 'locked' : 'unlocked'} by ${interaction.user}.`)] });
  },
};
