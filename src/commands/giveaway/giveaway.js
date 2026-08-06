const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { getConfig } = require('../../utils/config');
const { entryComponents, giveawayEmbed, endGiveaway, updateLocked, getGiveawayByMessage } = require('../../handlers/giveawayHandler');

const insert = db.prepare(`INSERT INTO giveaways
  (guild_id,channel_id,prize,hosted_by,winner_count,required_role_id,required_guild_rank,require_clan_tag,ends_at,created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
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

function isGiveawayManager(interaction) {
  const managerRole = getConfig(interaction.guild.id, 'giveaway_manager_role');
  const staffRole = getConfig(interaction.guild.id, 'giveaway_staff_role');
  return interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
    || Boolean(managerRole && interaction.member.roles.cache.has(managerRole))
    || Boolean(staffRole && interaction.member.roles.cache.has(staffRole));
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
      .addUserOption(option => option.setName('host').setDescription('Person hosting and fulfilling the giveaway'))
      .addBooleanOption(option => option.setName('require_drip_tag').setDescription('Require the DRIP server clan tag from winners?'))
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
      .addBooleanOption(option => option.setName('locked').setDescription('Locked?').setRequired(true)))
    .addSubcommand(subcommand => subcommand
      .setName('edit')
      .setDescription('Edit an active giveaway without clearing its entrants')
      .addStringOption(option => option.setName('message_link').setDescription('Discord message link for the giveaway').setRequired(true))
      .addStringOption(option => option.setName('prize').setDescription('New prize name'))
      .addUserOption(option => option.setName('host').setDescription('New giveaway host'))
      .addStringOption(option => option.setName('duration').setDescription('Reset remaining time: 30m, 2h, or 1d'))
      .addIntegerOption(option => option.setName('winners').setDescription('New winner count').setMinValue(1).setMaxValue(20))
      .addChannelOption(option => option.setName('channel').setDescription('Move the giveaway to another channel').addChannelTypes(ChannelType.GuildText))
      .addBooleanOption(option => option.setName('require_drip_tag').setDescription('Require the DRIP clan tag?'))
      .addRoleOption(option => option.setName('required_role').setDescription('Set a required Discord role'))
      .addBooleanOption(option => option.setName('clear_required_role').setDescription('Remove the required Discord role'))
      .addStringOption(option => option.setName('required_guild_role').setDescription('Set a required guild role/rank'))
      .addBooleanOption(option => option.setName('clear_required_guild_role').setDescription('Remove the required guild role/rank'))
      .addBooleanOption(option => option.setName('locked').setDescription('Lock or unlock entries')))
    .addSubcommand(subcommand => subcommand
      .setName('remove-entry')
      .setDescription('Giveaway managers can remove a participant from a giveaway')
      .addIntegerOption(option => option.setName('giveaway_id').setDescription('Giveaway ID').setRequired(true))
      .addUserOption(option => option.setName('user').setDescription('Participant to remove').setRequired(true))),

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
      const selectedHost = interaction.options.getUser('host') || interaction.user;
      const requireDripTag = interaction.options.getBoolean('require_drip_tag') ?? false;
      const requiredRole = interaction.options.getRole('required_role');
      const requiredGuildRole = interaction.options.getString('required_guild_role');
      const info = insert.run(
        interaction.guild.id,
        channel.id,
        prize,
        selectedHost.id,
        winnerCount,
        requiredRole?.id || null,
        requiredGuildRole || null,
        requireDripTag ? 1 : 0,
        Date.now() + milliseconds,
        Date.now()
      );
      const giveaway = get.get(info.lastInsertRowid);
      const message = await channel.send({ embeds: [giveawayEmbed(giveaway)], components: entryComponents(giveaway) });
      db.prepare('UPDATE giveaways SET message_id=? WHERE id=?').run(message.id, giveaway.id);
      return interaction.reply({
        embeds: [successEmbed('Giveaway Started', `**#${giveaway.id}** posted in ${channel}. Host: ${selectedHost}. DRIP tag: **${requireDripTag ? 'Required' : 'Not required'}**. Entrants must provide their Roblox username.`)],
        ephemeral: true
      });
    }

    if (subcommand === 'edit') {
      const parsed = parseDiscordMessageLink(interaction.options.getString('message_link'));
      if (!parsed || parsed.guildId !== interaction.guild.id) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Message Link', 'Paste the giveaway message link from this server.')], ephemeral: true });
      }

      const giveaway = getGiveawayByMessage.get(parsed.messageId);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id || giveaway.channel_id !== parsed.channelId) {
        return interaction.reply({ embeds: [errorEmbed('Giveaway Not Found', 'That message is not an active DripCore giveaway.')], ephemeral: true });
      }
      if (giveaway.ended) {
        return interaction.reply({ embeds: [errorEmbed('Giveaway Ended', 'Ended giveaways cannot be edited.')], ephemeral: true });
      }
      if (giveaway.hosted_by !== interaction.user.id && !isGiveawayManager(interaction)) {
        return interaction.reply({ embeds: [errorEmbed('No Permission', 'Only the giveaway host, Giveaway Managers, Staff, or administrators can edit it.')], ephemeral: true });
      }

      const updates = [];
      const values = [];
      const changes = [];
      const set = (column, value, label) => { updates.push(`${column}=?`); values.push(value); changes.push(label); };

      const prize = interaction.options.getString('prize');
      const host = interaction.options.getUser('host');
      const durationText = interaction.options.getString('duration');
      const winners = interaction.options.getInteger('winners');
      const requireDrip = interaction.options.getBoolean('require_drip_tag');
      const requiredRole = interaction.options.getRole('required_role');
      const clearRequiredRole = interaction.options.getBoolean('clear_required_role');
      const requiredGuildRole = interaction.options.getString('required_guild_role');
      const clearRequiredGuildRole = interaction.options.getBoolean('clear_required_guild_role');
      const locked = interaction.options.getBoolean('locked');
      const newChannel = interaction.options.getChannel('channel');

      if (prize !== null) set('prize', prize, `Prize → **${prize}**`);
      if (host) set('hosted_by', host.id, `Host → ${host}`);
      if (durationText !== null) {
        const milliseconds = duration(durationText);
        if (!milliseconds) return interaction.reply({ embeds: [errorEmbed('Invalid Duration', 'Use `30m`, `2h`, or `1d`.')], ephemeral: true });
        set('ends_at', Date.now() + milliseconds, `End time → **${durationText} from now**`);
      }
      if (winners !== null) set('winner_count', winners, `Winners → **${winners}**`);
      if (requireDrip !== null) set('require_clan_tag', requireDrip ? 1 : 0, `DRIP tag → **${requireDrip ? 'Required' : 'Not required'}**`);
      if (clearRequiredRole) set('required_role_id', null, 'Required Discord role → **Removed**');
      else if (requiredRole) set('required_role_id', requiredRole.id, `Required Discord role → ${requiredRole}`);
      if (clearRequiredGuildRole) set('required_guild_rank', null, 'Required guild rank → **Removed**');
      else if (requiredGuildRole !== null) set('required_guild_rank', requiredGuildRole, `Required guild rank → **${requiredGuildRole}**`);
      if (locked !== null) set('locked', locked ? 1 : 0, `Entries → **${locked ? 'Locked' : 'Unlocked'}**`);

      if (!updates.length && !newChannel) {
        return interaction.reply({ embeds: [errorEmbed('Nothing to Change', 'Choose at least one setting to edit.')], ephemeral: true });
      }

      if (updates.length) {
        values.push(giveaway.id);
        db.prepare(`UPDATE giveaways SET ${updates.join(', ')} WHERE id=?`).run(...values);
      }

      let updated = get.get(giveaway.id);
      let message;
      if (newChannel && newChannel.id !== updated.channel_id) {
        const oldChannel = await interaction.guild.channels.fetch(updated.channel_id).catch(() => null);
        const oldMessage = oldChannel?.isTextBased() && updated.message_id
          ? await oldChannel.messages.fetch(updated.message_id).catch(() => null)
          : null;
        message = await newChannel.send({ embeds: [giveawayEmbed({ ...updated, channel_id: newChannel.id })], components: entryComponents(updated) });
        db.prepare('UPDATE giveaways SET channel_id=?,message_id=? WHERE id=?').run(newChannel.id, message.id, updated.id);
        if (oldMessage) await oldMessage.delete().catch(() => {});
        changes.push(`Channel → ${newChannel}`);
        updated = get.get(updated.id);
      } else {
        const channel = await interaction.guild.channels.fetch(updated.channel_id).catch(() => null);
        message = channel?.isTextBased() && updated.message_id
          ? await channel.messages.fetch(updated.message_id).catch(() => null)
          : null;
        if (message) await message.edit({ embeds: [giveawayEmbed(updated)], components: entryComponents(updated) });
      }

      return interaction.reply({
        embeds: [successEmbed('Giveaway Updated', `${changes.join('\n')}\n\nCurrent entrants were **not reset**.`)],
        ephemeral: true
      });
    }

    if (subcommand === 'remove-entry') {
      if (!isGiveawayManager(interaction)) {
        return interaction.reply({ embeds: [errorEmbed('No Permission', 'Only the configured Giveaway Manager, Staff role, or an administrator can remove participants.')], ephemeral: true });
      }
      const giveawayId = interaction.options.getInteger('giveaway_id');
      const user = interaction.options.getUser('user');
      const giveaway = get.get(giveawayId);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id) {
        return interaction.reply({ embeds: [errorEmbed('Giveaway Not Found')], ephemeral: true });
      }
      const result = db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id=? AND user_id=?').run(giveawayId, user.id);
      if (!result.changes) {
        return interaction.reply({ embeds: [errorEmbed('Not Entered', `${user} is not entered in giveaway #${giveawayId}.`)], ephemeral: true });
      }
      const channel = await interaction.guild.channels.fetch(giveaway.channel_id).catch(() => null);
      const message = channel?.isTextBased() && giveaway.message_id
        ? await channel.messages.fetch(giveaway.message_id).catch(() => null)
        : null;
      if (message) await message.edit({ embeds: [giveawayEmbed(giveaway)], components: entryComponents(giveaway) }).catch(() => {});
      return interaction.reply({ embeds: [successEmbed('Participant Removed', `${user} was removed from giveaway #${giveawayId}.`)], ephemeral: true });
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
