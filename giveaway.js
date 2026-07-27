const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { entryButton, giveawayEmbed, endGiveaway, updateLocked } = require('../../handlers/giveawayHandler');

const insertGiveaway = db.prepare(
    `INSERT INTO giveaways (guild_id, channel_id, prize, hosted_by, winner_count, required_role_id, required_guild_rank, bonus_role_id, bonus_entries, ends_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const setMessageId = db.prepare(`UPDATE giveaways SET message_id = ? WHERE id = ?`);
const getGiveaway = db.prepare(`SELECT * FROM giveaways WHERE id = ?`);

function parseDuration(input) {
    const match = /^(\d+)\s*(s|m|h|d)$/i.exec(input.trim());
    if (!match) return null;
    const n = Number(match[1]);
    const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase()];
    return n * mult;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Run giveaways')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sc => sc.setName('start')
            .setDescription('Start a new giveaway')
            .addStringOption(o => o.setName('prize').setDescription('What are you giving away?').setRequired(true))
            .addStringOption(o => o.setName('duration').setDescription('e.g. 30m, 2h, 1d').setRequired(true))
            .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (default: here)').addChannelTypes(ChannelType.GuildText))
            .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(20))
            .addRoleOption(o => o.setName('required_role').setDescription('Role required to enter'))
            .addStringOption(o => o.setName('required_guild_rank').setDescription('Guild rank required to enter'))
            .addRoleOption(o => o.setName('bonus_role').setDescription('Role that grants bonus entries'))
            .addIntegerOption(o => o.setName('bonus_entries').setDescription('Extra entries granted by bonus_role').setMinValue(1)))
        .addSubcommand(sc => sc.setName('end')
            .setDescription('End a giveaway early and pick winners')
            .addIntegerOption(o => o.setName('giveaway_id').setDescription('Giveaway ID').setRequired(true)))
        .addSubcommand(sc => sc.setName('reroll')
            .setDescription('Reroll winners for an ended giveaway')
            .addIntegerOption(o => o.setName('giveaway_id').setDescription('Giveaway ID').setRequired(true)))
        .addSubcommand(sc => sc.setName('lock')
            .setDescription('Lock or unlock entries for an active giveaway')
            .addIntegerOption(o => o.setName('giveaway_id').setDescription('Giveaway ID').setRequired(true))
            .addBooleanOption(o => o.setName('locked').setDescription('true = lock, false = unlock').setRequired(true)))
        .addSubcommand(sc => sc.setName('forceend')
            .setDescription('Immediately end a giveaway regardless of time remaining')
            .addIntegerOption(o => o.setName('giveaway_id').setDescription('Giveaway ID').setRequired(true))),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'start') {
            const durationStr = interaction.options.getString('duration');
            const durationMs = parseDuration(durationStr);
            if (!durationMs) return interaction.reply({ embeds: [errorEmbed('Invalid Duration', 'Use a format like `30m`, `2h`, or `1d`.')], ephemeral: true });

            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const prize = interaction.options.getString('prize');
            const winnerCount = interaction.options.getInteger('winners') || 1;
            const requiredRole = interaction.options.getRole('required_role');
            const requiredRank = interaction.options.getString('required_guild_rank');
            const bonusRole = interaction.options.getRole('bonus_role');
            const bonusEntries = interaction.options.getInteger('bonus_entries') || 0;
            const endsAt = Date.now() + durationMs;

            const info = insertGiveaway.run(
                interaction.guild.id, channel.id, prize, interaction.user.id, winnerCount,
                requiredRole?.id ?? null, requiredRank ?? null, bonusRole?.id ?? null, bonusEntries, endsAt, Date.now()
            );
            const giveaway = getGiveaway.get(info.lastInsertRowid);
            const msg = await channel.send({ embeds: [giveawayEmbed(giveaway)], components: [entryButton(giveaway)] });
            setMessageId.run(msg.id, giveaway.id);

            return interaction.reply({ embeds: [successEmbed('Giveaway Started', `**#${giveaway.id}** posted in ${channel}.`)], ephemeral: true });
        }

        if (sub === 'end' || sub === 'forceend') {
            const id = interaction.options.getInteger('giveaway_id');
            const giveaway = getGiveaway.get(id);
            if (!giveaway || giveaway.guild_id !== interaction.guild.id) return interaction.reply({ embeds: [errorEmbed('Not Found')], ephemeral: true });
            if (giveaway.ended) return interaction.reply({ embeds: [errorEmbed('Already Ended')], ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            await endGiveaway(client, id);
            return interaction.editReply({ embeds: [successEmbed('Giveaway Ended')] });
        }

        if (sub === 'reroll') {
            const id = interaction.options.getInteger('giveaway_id');
            const giveaway = getGiveaway.get(id);
            if (!giveaway || giveaway.guild_id !== interaction.guild.id) return interaction.reply({ embeds: [errorEmbed('Not Found')], ephemeral: true });
            if (!giveaway.ended) return interaction.reply({ embeds: [errorEmbed('Not Ended Yet', 'Only ended giveaways can be rerolled.')], ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            // Re-run winner selection by flagging ended=0 momentarily is avoided; reuse endGiveaway's picker directly via a small trick:
            const db2 = require('../../database/db');
            db2.prepare('UPDATE giveaways SET ended = 0 WHERE id = ?').run(id);
            await endGiveaway(client, id, { reroll: true });
            return interaction.editReply({ embeds: [successEmbed('Giveaway Rerolled')] });
        }

        if (sub === 'lock') {
            const id = interaction.options.getInteger('giveaway_id');
            const locked = interaction.options.getBoolean('locked');
            const giveaway = getGiveaway.get(id);
            if (!giveaway || giveaway.guild_id !== interaction.guild.id) return interaction.reply({ embeds: [errorEmbed('Not Found')], ephemeral: true });
            updateLocked.run(locked ? 1 : 0, id);
            return interaction.reply({ embeds: [successEmbed(locked ? 'Giveaway Locked' : 'Giveaway Unlocked')], ephemeral: true });
        }
    },
};
