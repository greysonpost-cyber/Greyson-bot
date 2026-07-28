const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { successEmbed, infoEmbed } = require('../../utils/embeds');
const { setConfig, getAllConfig, deleteConfig } = require('../../utils/config');

const CHANNEL_KEYS = [
    { name: 'Message Logs', value: 'log_channel_message' },
    { name: 'Member Join/Leave Logs', value: 'log_channel_member' },
    { name: 'Moderation Logs', value: 'log_channel_mod' },
    { name: 'Role Change Logs', value: 'log_channel_role' },
    { name: 'Voice Logs', value: 'log_channel_voice' },
    { name: 'Ticket Logs', value: 'log_channel_ticket' },
    { name: 'Report Logs', value: 'log_channel_report' },
    { name: 'Channel Create/Delete Logs', value: 'log_channel_channel' },
    { name: 'Report Submissions Channel', value: 'report_channel' },
    { name: 'Ticket Transcript Channel', value: 'ticket_transcript_channel' },
    { name: 'Giveaway Log Channel', value: 'giveaway_log_channel' },
];

const ROLE_KEYS = [
    { name: 'Guild Accept Role (given via /guild accept)', value: 'guild_accept_role' },
        { name: 'Auto Role on Join', value: 'auto_role_on_join' },
    { name: 'Auto Role on Verify', value: 'auto_role_on_verify' },
    { name: 'Auto Role on Guild Accept', value: 'auto_role_on_guild_accept' },
    { name: 'Auto Role on Ticket Accept', value: 'auto_role_on_ticket_accept' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configure bot settings for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sc => sc.setName('set-channel')
            .setDescription('Set a log/feature channel')
            .addStringOption(o => o.setName('key').setDescription('Which setting').setRequired(true).addChoices(...CHANNEL_KEYS))
            .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sc => sc.setName('set-role')
            .setDescription('Set a role-based setting')
            .addStringOption(o => o.setName('key').setDescription('Which setting').setRequired(true).addChoices(...ROLE_KEYS))
            .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
        .addSubcommand(sc => sc.setName('set-category')
            .setDescription('Set the category new tickets are created under')
            .addChannelOption(o => o.setName('category').setDescription('Category channel').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
        .addSubcommand(sc => sc.setName('set-value')
            .setDescription('Set a raw config value (advanced)')
            .addStringOption(o => o.setName('key').setDescription('Config key, e.g. ticket_auto_delete_minutes, report_thread_enabled').setRequired(true))
            .addStringOption(o => o.setName('value').setDescription('Value').setRequired(true)))
        .addSubcommand(sc => sc.setName('set-giveaway-role')
            .setDescription('Add a giveaway staff, auto-claim, claim-time, or bonus role')
            .addStringOption(o => o.setName('type').setRequired(true).setDescription('Type').addChoices({name:'Giveaway Staff',value:'giveaway_staff_roles_json'},{name:'Auto Claim',value:'giveaway_auto_claim_roles_json'},{name:'Host Role',value:'host_roles_json'},{name:'Lock Role',value:'lock_roles_json'},{name:'Unlock Role',value:'unlock_roles_json'}))
            .addRoleOption(o => o.setName('role').setRequired(true).setDescription('Role')))
        .addSubcommand(sc => sc.setName('view').setDescription('View all current configuration for this server'))
        .addSubcommand(sc => sc.setName('reset')
            .setDescription('Clear a configuration key')
            .addStringOption(o => o.setName('key').setDescription('Key to reset').setRequired(true))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'set-channel') {
            const key = interaction.options.getString('key');
            const channel = interaction.options.getChannel('channel');
            setConfig(guildId, key, channel.id);
            return interaction.reply({ embeds: [successEmbed('Config Updated', `**${key}** set to ${channel}`)], ephemeral: true });
        }

        if (sub === 'set-role') {
            const key = interaction.options.getString('key');
            const role = interaction.options.getRole('role');
            setConfig(guildId, key, role.id);
            return interaction.reply({ embeds: [successEmbed('Config Updated', `**${key}** set to ${role}`)], ephemeral: true });
        }

        if (sub === 'set-category') {
            const category = interaction.options.getChannel('category');
            setConfig(guildId, 'ticket_category_id', category.id);
            return interaction.reply({ embeds: [successEmbed('Config Updated', `Tickets will now be created under **${category.name}**`)], ephemeral: true });
        }

        if (sub === 'set-value') {
            const key = interaction.options.getString('key');
            const value = interaction.options.getString('value');
            setConfig(guildId, key, value);
            return interaction.reply({ embeds: [successEmbed('Config Updated', `**${key}** = \`${value}\``)], ephemeral: true });
        }

        if (sub === 'reset') {
            const key = interaction.options.getString('key');
            deleteConfig(guildId, key);
            return interaction.reply({ embeds: [successEmbed('Config Reset', `**${key}** cleared.`)], ephemeral: true });
        }

        if (sub === 'set-giveaway-role') {
            const key = interaction.options.getString('type');
            const role = interaction.options.getRole('role');
            const current = JSON.parse(require('../../utils/config').getConfig(guildId, key, '[]'));
            if (!current.includes(role.id)) current.push(role.id);
            setConfig(guildId, key, JSON.stringify(current));
            return interaction.reply({ embeds: [successEmbed('Role Added', `${role} added to **${key}**.`)], ephemeral: true });
        }

        if (sub === 'view') {
            const all = getAllConfig(guildId);
            const entries = Object.entries(all);
            if (!entries.length) return interaction.reply({ embeds: [infoEmbed('No Configuration Set', 'Use `/config set-channel`, `/config set-role`, etc. to get started.')], ephemeral: true });
            const desc = entries.map(([k, v]) => `**${k}:** \`${v}\``).join('\n');
            return interaction.reply({ embeds: [infoEmbed('Current Configuration', desc)], ephemeral: true });
        }
    },
};
