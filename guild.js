const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');
const { getConfig } = require('../../utils/config');

const insertMember = db.prepare(
    `INSERT INTO guild_members (guild_id, discord_id, roblox_username, roblox_id, join_date, recruiter_id, guild_rank, notes, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(guild_id, discord_id) DO UPDATE SET
        roblox_username = excluded.roblox_username,
        roblox_id = excluded.roblox_id,
        recruiter_id = excluded.recruiter_id,
        active = 1`
);
const getMember = db.prepare(`SELECT * FROM guild_members WHERE guild_id = ? AND discord_id = ?`);
const setRank = db.prepare(`UPDATE guild_members SET guild_rank = ? WHERE guild_id = ? AND discord_id = ?`);
const setActive = db.prepare(`UPDATE guild_members SET active = ? WHERE guild_id = ? AND discord_id = ?`);
const setNotes = db.prepare(`UPDATE guild_members SET notes = ? WHERE guild_id = ? AND discord_id = ?`);
const setRecruiter = db.prepare(`UPDATE guild_members SET recruiter_id = ? WHERE guild_id = ? AND discord_id = ?`);
const deleteMember = db.prepare(`DELETE FROM guild_members WHERE guild_id = ? AND discord_id = ?`);
const listByGuild = db.prepare(`SELECT * FROM guild_members WHERE guild_id = ? AND active = 1 ORDER BY join_date ASC`);
const listByRank = db.prepare(`SELECT * FROM guild_members WHERE guild_id = ? AND active = 1 AND guild_rank = ? ORDER BY join_date ASC`);

function memberInfoEmbed(row, user) {
    return infoEmbed(`Guild Profile - ${user?.tag ?? row.discord_id}`, null).addFields(
        { name: 'Discord', value: `<@${row.discord_id}>`, inline: true },
        { name: 'Roblox Username', value: row.roblox_username || 'N/A', inline: true },
        { name: 'Roblox ID', value: row.roblox_id || 'N/A', inline: true },
        { name: 'Rank', value: row.guild_rank, inline: true },
        { name: 'Recruiter', value: row.recruiter_id ? `<@${row.recruiter_id}>` : 'N/A', inline: true },
        { name: 'Status', value: row.active ? 'Active' : 'Inactive', inline: true },
        { name: 'Joined', value: `<t:${Math.floor(row.join_date / 1000)}:D>`, inline: true },
        { name: 'Notes', value: row.notes || 'None' },
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guild')
        .setDescription('Manage the in-game guild roster')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sc => sc.setName('accept')
            .setDescription('Accept a guild application: gives the Guild Member role and creates their roster entry')
            .addUserOption(o => o.setName('user').setDescription('Applicant').setRequired(true))
            .addStringOption(o => o.setName('roblox_username').setDescription('Roblox username').setRequired(true))
            .addStringOption(o => o.setName('roblox_id').setDescription('Roblox user ID').setRequired(true))
            .addUserOption(o => o.setName('recruiter').setDescription('Who recruited them')))
        .addSubcommand(sc => sc.setName('add')
            .setDescription('Manually add a member to the roster (does not touch roles)')
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addStringOption(o => o.setName('roblox_username').setDescription('Roblox username').setRequired(true))
            .addStringOption(o => o.setName('roblox_id').setDescription('Roblox user ID').setRequired(true))
            .addStringOption(o => o.setName('rank').setDescription('Starting rank').setRequired(false))
            .addUserOption(o => o.setName('recruiter').setDescription('Who recruited them')))
        .addSubcommand(sc => sc.setName('remove')
            .setDescription('Remove a member from the guild roster and take the Guild Member role')
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addStringOption(o => o.setName('reason').setDescription('Reason')))
        .addSubcommand(sc => sc.setName('promote')
            .setDescription("Change a member's guild rank upward")
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addStringOption(o => o.setName('new_rank').setDescription('New rank name').setRequired(true)))
        .addSubcommand(sc => sc.setName('demote')
            .setDescription("Change a member's guild rank downward")
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addStringOption(o => o.setName('new_rank').setDescription('New rank name').setRequired(true)))
        .addSubcommand(sc => sc.setName('info')
            .setDescription("View a member's guild profile")
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
        .addSubcommand(sc => sc.setName('list')
            .setDescription('List guild roster, optionally filtered by rank')
            .addStringOption(o => o.setName('rank').setDescription('Filter by rank')))
        .addSubcommand(sc => sc.setName('recruiter')
            .setDescription("Update a member's recorded recruiter")
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addUserOption(o => o.setName('recruiter').setDescription('Recruiter').setRequired(true)))
        .addSubcommand(sc => sc.setName('notes')
            .setDescription("Set a member's guild notes")
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addStringOption(o => o.setName('note').setDescription('Note content').setRequired(true)))
        .addSubcommand(sc => sc.setName('inactive')
            .setDescription('Toggle a member as inactive/active in the roster')
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addBooleanOption(o => o.setName('inactive').setDescription('true = mark inactive, false = mark active').setRequired(true))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'accept') {
            const user = interaction.options.getUser('user');
            const robloxUsername = interaction.options.getString('roblox_username');
            const robloxId = interaction.options.getString('roblox_id');
            const recruiter = interaction.options.getUser('recruiter');

            const roleId = getConfig(guildId, 'guild_accept_role');
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (roleId && member) await member.roles.add(roleId).catch(() => {});

            insertMember.run(guildId, user.id, robloxUsername, robloxId, Date.now(), recruiter?.id ?? null, 'Member', null);

            await sendLog(interaction.guild, 'log_channel_mod', { title: 'Guild Application Accepted', description: `<@${user.id}> accepted by <@${interaction.user.id}>${recruiter ? ` (recruited by <@${recruiter.id}>)` : ''}` });
            return interaction.reply({ embeds: [successEmbed('Guild Application Accepted', `<@${user.id}> is now a Guild Member.${roleId ? '' : '\n*(No `guild_accept_role` configured - no role was given. Set one with `/config set-role key:guild_accept_role`.)*'}`)] });
        }

        if (sub === 'add') {
            const user = interaction.options.getUser('user');
            const robloxUsername = interaction.options.getString('roblox_username');
            const robloxId = interaction.options.getString('roblox_id');
            const rank = interaction.options.getString('rank') || 'Member';
            const recruiter = interaction.options.getUser('recruiter');
            insertMember.run(guildId, user.id, robloxUsername, robloxId, Date.now(), recruiter?.id ?? null, rank, null);
            await sendLog(interaction.guild, 'log_channel_mod', { title: 'Guild Member Added', description: `<@${user.id}> added to roster by <@${interaction.user.id}>` });
            return interaction.reply({ embeds: [successEmbed('Added to Roster', `<@${user.id}> added as **${rank}**.`)] });
        }

        if (sub === 'remove') {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason given';
            const roleId = getConfig(guildId, 'guild_accept_role');
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (roleId && member) await member.roles.remove(roleId).catch(() => {});
            deleteMember.run(guildId, user.id);
            await sendLog(interaction.guild, 'log_channel_mod', { title: 'Guild Member Removed', description: `<@${user.id}> removed by <@${interaction.user.id}>`, fields: [{ name: 'Reason', value: reason }] });
            return interaction.reply({ embeds: [successEmbed('Removed From Guild', `<@${user.id}> has been removed.\n**Reason:** ${reason}`)] });
        }

        if (sub === 'promote' || sub === 'demote') {
            const user = interaction.options.getUser('user');
            const newRank = interaction.options.getString('new_rank');
            const row = getMember.get(guildId, user.id);
            if (!row) return interaction.reply({ embeds: [errorEmbed('Not In Roster', `<@${user.id}> is not on the guild roster.`)], ephemeral: true });
            setRank.run(newRank, guildId, user.id);
            await sendLog(interaction.guild, 'log_channel_mod', { title: `Guild Member ${sub === 'promote' ? 'Promoted' : 'Demoted'}`, description: `<@${user.id}>: ${row.guild_rank} → ${newRank} by <@${interaction.user.id}>` });
            return interaction.reply({ embeds: [successEmbed(sub === 'promote' ? 'Promoted' : 'Demoted', `<@${user.id}>: **${row.guild_rank}** → **${newRank}**`)] });
        }

        if (sub === 'info') {
            const user = interaction.options.getUser('user');
            const row = getMember.get(guildId, user.id);
            if (!row) return interaction.reply({ embeds: [errorEmbed('Not In Roster', `<@${user.id}> is not on the guild roster.`)], ephemeral: true });
            return interaction.reply({ embeds: [memberInfoEmbed(row, user)] });
        }

        if (sub === 'list') {
            const rank = interaction.options.getString('rank');
            const rows = rank ? listByRank.all(guildId, rank) : listByGuild.all(guildId);
            if (!rows.length) return interaction.reply({ embeds: [infoEmbed('Guild Roster', 'No members found.')] });
            const desc = rows.slice(0, 40).map(r => `<@${r.discord_id}> - **${r.guild_rank}** - ${r.roblox_username || 'N/A'}`).join('\n');
            return interaction.reply({ embeds: [infoEmbed(`Guild Roster${rank ? ` - ${rank}` : ''}`, desc).setFooter({ text: `${rows.length} member(s)${rows.length > 40 ? ' - showing first 40' : ''}` })] });
        }

        if (sub === 'recruiter') {
            const user = interaction.options.getUser('user');
            const recruiter = interaction.options.getUser('recruiter');
            const row = getMember.get(guildId, user.id);
            if (!row) return interaction.reply({ embeds: [errorEmbed('Not In Roster')], ephemeral: true });
            setRecruiter.run(recruiter.id, guildId, user.id);
            return interaction.reply({ embeds: [successEmbed('Recruiter Updated', `<@${user.id}>'s recruiter set to <@${recruiter.id}>.`)] });
        }

        if (sub === 'notes') {
            const user = interaction.options.getUser('user');
            const note = interaction.options.getString('note');
            const row = getMember.get(guildId, user.id);
            if (!row) return interaction.reply({ embeds: [errorEmbed('Not In Roster')], ephemeral: true });
            setNotes.run(note, guildId, user.id);
            return interaction.reply({ embeds: [successEmbed('Notes Updated')], ephemeral: true });
        }

        if (sub === 'inactive') {
            const user = interaction.options.getUser('user');
            const inactive = interaction.options.getBoolean('inactive');
            const row = getMember.get(guildId, user.id);
            if (!row) return interaction.reply({ embeds: [errorEmbed('Not In Roster')], ephemeral: true });
            setActive.run(inactive ? 0 : 1, guildId, user.id);
            return interaction.reply({ embeds: [successEmbed('Status Updated', `<@${user.id}> marked **${inactive ? 'inactive' : 'active'}**.`)] });
        }
    },
};
