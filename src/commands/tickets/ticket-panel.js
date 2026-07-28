const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { sendPanelMessage, getPanel, categoriesOf } = require('../../handlers/ticketHandler');

const insertPanel = db.prepare(
    `INSERT INTO ticket_panels (guild_id, panel_name, channel_id, categories_json, created_at) VALUES (?, ?, ?, ?, ?)`
);
const updatePanelCategories = db.prepare(`UPDATE ticket_panels SET categories_json = ? WHERE id = ?`);
const updatePanelMessage = db.prepare(`UPDATE ticket_panels SET message_id = ? WHERE id = ?`);
const listPanels = db.prepare(`SELECT * FROM ticket_panels WHERE guild_id = ?`);

// Default categories matching the spec (item 1) - easy starting point, fully editable after.
const DEFAULT_CATEGORIES = ['Support', 'Reports', 'Appeals', 'Guild Applications', 'Middleman', 'Giveaways', 'Other'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket-panel')
        .setDescription('Create and manage ticket panels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sc => sc.setName('create')
            .setDescription('Create a new ticket panel (starts with the 7 default categories, no staff roles set)')
            .addStringOption(o => o.setName('name').setDescription('Panel title, e.g. "Open a Ticket"').setRequired(true))
            .addChannelOption(o => o.setName('channel').setDescription('Channel to eventually post the panel in').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(sc => sc.setName('add-category')
            .setDescription('Add a custom ticket category to a panel')
            .addIntegerOption(o => o.setName('panel_id').setDescription('Panel ID (see /ticket-panel list)').setRequired(true))
            .addStringOption(o => o.setName('label').setDescription('Display label, e.g. "Guild Applications"').setRequired(true))
            .addStringOption(o => o.setName('value').setDescription('Short internal id, e.g. "guild-app" (no spaces)').setRequired(true))
            .addRoleOption(o => o.setName('staff_role').setDescription('Role to ping/allow access when this ticket opens'))
            .addBooleanOption(o => o.setName('one_ticket_only').setDescription('Limit each user to 1 open ticket in this category'))
            .addStringOption(o => o.setName('questions').setDescription('Up to 5 questions to ask, separated by " | "')))
        .addSubcommand(sc => sc.setName('remove-category')
            .setDescription('Remove a category from a panel')
            .addIntegerOption(o => o.setName('panel_id').setDescription('Panel ID').setRequired(true))
            .addStringOption(o => o.setName('value').setDescription('Category value to remove').setRequired(true)))
        .addSubcommand(sc => sc.setName('send')
            .setDescription('Post (or repost) the panel message with its category dropdown')
            .addIntegerOption(o => o.setName('panel_id').setDescription('Panel ID').setRequired(true)))
        .addSubcommand(sc => sc.setName('list').setDescription('List all ticket panels in this server')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'create') {
            const name = interaction.options.getString('name');
            const channel = interaction.options.getChannel('channel');
            const categories = DEFAULT_CATEGORIES.map(label => ({
                label, value: label.toLowerCase().replace(/\s+/g, '-'), staffRoleId: null, oneTicketOnly: false, questions: [],
            }));
            const info = insertPanel.run(guildId, name, channel.id, JSON.stringify(categories), Date.now());
            return interaction.reply({
                embeds: [successEmbed('Panel Created', `Panel **#${info.lastInsertRowid}** created with 7 default categories.\nUse \`/ticket-panel add-category\` to set staff roles/questions, then \`/ticket-panel send panel_id:${info.lastInsertRowid}\` to post it in ${channel}.`)],
                ephemeral: true,
            });
        }

        if (sub === 'add-category') {
            const panelId = interaction.options.getInteger('panel_id');
            const panel = getPanel.get(panelId);
            if (!panel || panel.guild_id !== guildId) return interaction.reply({ embeds: [errorEmbed('Panel not found')], ephemeral: true });

            const label = interaction.options.getString('label');
            const value = interaction.options.getString('value').toLowerCase().replace(/\s+/g, '-');
            const staffRole = interaction.options.getRole('staff_role');
            const oneTicketOnly = interaction.options.getBoolean('one_ticket_only') ?? false;
            const questionsRaw = interaction.options.getString('questions');
            const questions = questionsRaw ? questionsRaw.split('|').map(s => s.trim()).filter(Boolean).slice(0, 5) : [];

            const cats = categoriesOf(panel).filter(c => c.value !== value);
            cats.push({ label, value, staffRoleId: staffRole?.id ?? null, oneTicketOnly, questions });
            if (cats.length > 25) return interaction.reply({ embeds: [errorEmbed('Too Many Categories', 'A select menu supports a maximum of 25 options.')], ephemeral: true });

            updatePanelCategories.run(JSON.stringify(cats), panelId);
            return interaction.reply({ embeds: [successEmbed('Category Added', `**${label}** added to panel #${panelId}. Run \`/ticket-panel send\` again to update the live message.`)], ephemeral: true });
        }

        if (sub === 'remove-category') {
            const panelId = interaction.options.getInteger('panel_id');
            const panel = getPanel.get(panelId);
            if (!panel || panel.guild_id !== guildId) return interaction.reply({ embeds: [errorEmbed('Panel not found')], ephemeral: true });
            const value = interaction.options.getString('value');
            const cats = categoriesOf(panel).filter(c => c.value !== value);
            updatePanelCategories.run(JSON.stringify(cats), panelId);
            return interaction.reply({ embeds: [successEmbed('Category Removed')], ephemeral: true });
        }

        if (sub === 'send') {
            const panelId = interaction.options.getInteger('panel_id');
            const panel = getPanel.get(panelId);
            if (!panel || panel.guild_id !== guildId) return interaction.reply({ embeds: [errorEmbed('Panel not found')], ephemeral: true });
            const cats = categoriesOf(panel);
            if (!cats.length) return interaction.reply({ embeds: [errorEmbed('No Categories', 'Add at least one category first with /ticket-panel add-category.')], ephemeral: true });

            const channel = await interaction.guild.channels.fetch(panel.channel_id).catch(() => null);
            if (!channel) return interaction.reply({ embeds: [errorEmbed('Channel Missing', 'The panel\'s target channel no longer exists.')], ephemeral: true });

            const msg = await sendPanelMessage(channel, panel);
            updatePanelMessage.run(msg.id, panelId);
            return interaction.reply({ embeds: [successEmbed('Panel Sent', `Posted in ${channel}.`)], ephemeral: true });
        }

        if (sub === 'list') {
            const panels = listPanels.all(guildId);
            if (!panels.length) return interaction.reply({ embeds: [infoEmbed('No Panels', 'Create one with /ticket-panel create.')], ephemeral: true });
            const desc = panels.map(p => `**#${p.id}** ${p.panel_name} - <#${p.channel_id}> - ${categoriesOf(p).length} categories`).join('\n');
            return interaction.reply({ embeds: [infoEmbed('Ticket Panels', desc)], ephemeral: true });
        }
    },
};
