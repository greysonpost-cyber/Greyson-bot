const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { infoEmbed, errorEmbed } = require('../../utils/embeds');

const leaderboardQuery = db.prepare(
    `SELECT recruiter_id, COUNT(*) as count FROM guild_members
     WHERE guild_id = ? AND recruiter_id IS NOT NULL AND active = 1
     GROUP BY recruiter_id ORDER BY count DESC LIMIT ?`
);
const statsQuery = db.prepare(
    `SELECT COUNT(*) as count FROM guild_members WHERE guild_id = ? AND recruiter_id = ? AND active = 1`
);
const recentRecruits = db.prepare(
    `SELECT discord_id, join_date FROM guild_members WHERE guild_id = ? AND recruiter_id = ? AND active = 1 ORDER BY join_date DESC LIMIT 5`
);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('recruiter')
        .setDescription('Recruiter tracking and leaderboards')
        .addSubcommand(sc => sc.setName('leaderboard')
            .setDescription('Top recruiters by number of active recruits')
            .addIntegerOption(o => o.setName('limit').setDescription('How many to show (default 10)').setMinValue(1).setMaxValue(25)))
        .addSubcommand(sc => sc.setName('stats')
            .setDescription("View a recruiter's stats")
            .addUserOption(o => o.setName('user').setDescription('Recruiter (defaults to you)'))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'leaderboard') {
            const limit = interaction.options.getInteger('limit') || 10;
            const rows = leaderboardQuery.all(guildId, limit);
            if (!rows.length) return interaction.reply({ embeds: [infoEmbed('Recruiter Leaderboard', 'No recruits recorded yet.')] });
            const medals = ['🥇', '🥈', '🥉'];
            const desc = rows.map((r, i) => `${medals[i] || `**${i + 1}.**`} <@${r.recruiter_id}> - **${r.count}** recruit(s)`).join('\n');
            return interaction.reply({ embeds: [infoEmbed('🏆 Recruiter Leaderboard', desc)] });
        }

        if (sub === 'stats') {
            const user = interaction.options.getUser('user') || interaction.user;
            const { count } = statsQuery.get(guildId, user.id);
            const recent = recentRecruits.all(guildId, user.id);
            const embed = infoEmbed(`Recruiter Stats - ${user.tag}`, `**Total active recruits:** ${count}`);
            if (recent.length) embed.addFields({ name: 'Most Recent Recruits', value: recent.map(r => `<@${r.discord_id}> - <t:${Math.floor(r.join_date / 1000)}:R>`).join('\n') });
            return interaction.reply({ embeds: [embed] });
        }
    },
};
