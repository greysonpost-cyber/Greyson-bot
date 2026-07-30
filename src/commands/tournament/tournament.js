const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const handler = require('../../handlers/tournamentHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Create and manage a multi-round server tournament')
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create the tournament registration panel')
      .addStringOption(o => o.setName('name').setDescription('Tournament name').setRequired(true).setMaxLength(80))
      .addStringOption(o => o.setName('prize').setDescription('Main prize').setRequired(true).setMaxLength(150))
      .addIntegerOption(o => o.setName('max_players').setDescription('Maximum participants').setRequired(true).setMinValue(4).setMaxValue(128))
      .addChannelOption(o => o.setName('channel').setDescription('Channel for the live panel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption(o => o.setName('participant_role').setDescription('Role given when a player joins')))
    .addSubcommand(sub => sub.setName('start').setDescription('Close registration and begin Round 1'))
    .addSubcommand(sub => sub
      .setName('report-mm2')
      .setDescription('Manager-only: report an MM2 winner and loser')
      .addUserOption(o => o.setName('winner').setDescription('Match winner').setRequired(true))
      .addUserOption(o => o.setName('loser').setDescription('Match loser').setRequired(true))
      .addIntegerOption(o => o.setName('winner_points').setDescription('Points for winner').setMinValue(0).setMaxValue(25))
      .addIntegerOption(o => o.setName('loser_points').setDescription('Points for loser').setMinValue(0).setMaxValue(25))
      .addStringOption(o => o.setName('notes').setDescription('Optional match notes').setMaxLength(150)))
    .addSubcommand(sub => sub
      .setName('open-dti')
      .setDescription('Open Dress to Impress outfit submissions with a hard deadline')
      .addStringOption(o => o.setName('theme').setDescription('Outfit theme').setRequired(true).setMaxLength(80))
      .addIntegerOption(o => o.setName('minutes').setDescription('Minutes allowed to submit').setRequired(true).setMinValue(1).setMaxValue(10080)))
    .addSubcommand(sub => sub.setName('open-dti-voting').setDescription('Post anonymous DTI entries and open secret voting'))
    .addSubcommand(sub => sub
      .setName('vote-dti')
      .setDescription('Secretly vote for one DTI submission')
      .addIntegerOption(o => o.setName('submission').setDescription('Anonymous submission number').setRequired(true).setMinValue(1)))
    .addSubcommand(sub => sub
      .setName('close-dti-voting')
      .setDescription('Close DTI voting after every eligible participant has voted')
      .addBooleanOption(o => o.setName('force').setDescription('Manager override if some eligible players have not voted')))
    .addSubcommand(sub => sub
      .setName('award')
      .setDescription('Award round points to a participant')
      .addUserOption(o => o.setName('user').setDescription('Participant').setRequired(true))
      .addIntegerOption(o => o.setName('points').setDescription('Points for the current round').setRequired(true).setMinValue(0).setMaxValue(25))
      .addStringOption(o => o.setName('note').setDescription('Optional reason/result').setMaxLength(150)))
    .addSubcommand(sub => sub
      .setName('contribution')
      .setDescription('Set prize-contribution bonus points (0-5 maximum)')
      .addUserOption(o => o.setName('user').setDescription('Participant').setRequired(true))
      .addIntegerOption(o => o.setName('points').setDescription('Starting bonus points').setRequired(true).setMinValue(0).setMaxValue(5)))
    .addSubcommand(sub => sub.setName('next-round').setDescription('Advance to the next game/round'))
    .addSubcommand(sub => sub.setName('leaderboard').setDescription('Post the current leaderboard and custom picture'))
    .addSubcommand(sub => sub.setName('participants').setDescription('List registered participants'))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a participant')
      .addUserOption(o => o.setName('user').setDescription('Participant to remove').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('config')
      .setDescription('Configure tournament staff and channels')
      .addRoleOption(o => o.setName('manager_role').setDescription('Role allowed to manage tournament results'))
      .addChannelOption(o => o.setName('announcement_channel').setDescription('Tournament announcement channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption(o => o.setName('participant_role').setDescription('Default participant role')))
    .addSubcommand(sub => sub
      .setName('end')
      .setDescription('End the tournament and announce the champion')
      .addUserOption(o => o.setName('winner').setDescription('Grand Finale winner').setRequired(true)))
    .addSubcommand(sub => sub.setName('delete').setDescription('Delete the tournament data and panel')),

  async execute(interaction, client) {
    return handler.handleCommand(interaction, client);
  },
};
