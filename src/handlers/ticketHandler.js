const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder,
    ChannelType, PermissionsBitField, AttachmentBuilder,
} = require('discord.js');
const db = require('../database/db');
const { successEmbed, errorEmbed, infoEmbed, baseEmbed } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');
const { getConfig } = require('../utils/config');

// ---------- DB helpers ----------
const getPanel = db.prepare(`SELECT * FROM ticket_panels WHERE id = ?`);
const getTicketByChannel = db.prepare(`SELECT * FROM tickets WHERE channel_id = ?`);
const getTicketById = db.prepare(`SELECT * FROM tickets WHERE id = ?`);
const insertTicket = db.prepare(
    `INSERT INTO tickets (guild_id, panel_id, category_value, channel_id, opener_id, status, answers_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
);
const updateTicketClaim = db.prepare(`UPDATE tickets SET claimed_by = ? WHERE id = ?`);
const updateTicketStatus = db.prepare(`UPDATE tickets SET status = ?, closed_at = ?, closed_by = ? WHERE id = ?`);
const countOpenTicketsForUser = db.prepare(
    `SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND panel_id = ? AND opener_id = ? AND status = 'open'`
);

function categoriesOf(panel) {
    return JSON.parse(panel.categories_json || '[]');
}

function ticketButtons(ticket) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_claim:${ticket.id}`).setLabel(ticket.claimed_by ? 'Unclaim' : 'Claim').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
        new ButtonBuilder().setCustomId(`ticket_close:${ticket.id}`).setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId(`ticket_rename:${ticket.id}`).setLabel('Rename').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_adduser:${ticket.id}`).setLabel('Add User').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
        new ButtonBuilder().setCustomId(`ticket_removeuser:${ticket.id}`).setLabel('Remove User').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
    );
    return [row1, row2];
}

function closedTicketButtons(ticket) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_reopen:${ticket.id}`).setLabel('Reopen').setStyle(ButtonStyle.Success).setEmoji('🔓'),
        new ButtonBuilder().setCustomId(`ticket_delete:${ticket.id}`).setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    )];
}

/** Build & send the panel message with its category select menu. Returns the sent message. */
async function sendPanelMessage(channel, panel) {
    const cats = categoriesOf(panel);
    const select = new StringSelectMenuBuilder()
        .setCustomId(`ticket_panel_select:${panel.id}`)
        .setPlaceholder('Select a category to open a ticket')
        .addOptions(cats.map(c => ({ label: c.label, value: c.value, emoji: c.emoji || undefined, description: c.description?.slice(0, 100) })));

    const embed = infoEmbed(panel.panel_name, 'Select a category below to open a ticket.');
    return channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
}

/** Create the private ticket channel + DB row, post the intro embed with answers, and buttons. */
async function createTicket(interaction, panel, category, answers) {
    const guild = interaction.guild;
    const opener = interaction.user;

    if (category.oneTicketOnly) {
        const { c } = countOpenTicketsForUser.get(guild.id, panel.id, opener.id);
        if (c > 0) {
            return interaction.editReply({ embeds: [errorEmbed('Ticket Limit Reached', 'You already have an open ticket for this panel.')] });
        }
    }

    const parentId = getConfig(guild.id, 'ticket_category_id') || null;
    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: opener.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
        { id: guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
    ];
    if (category.staffRoleId) {
        overwrites.push({ id: category.staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
    }

    const channel = await guild.channels.create({
        name: `${category.value}-${opener.username}`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: parentId || undefined,
        permissionOverwrites: overwrites,
    });

    const info = insertTicket.run(guild.id, panel.id, category.value, channel.id, opener.id, JSON.stringify(answers || {}), Date.now());
    const ticket = getTicketById.get(info.lastInsertRowid);

    const embed = infoEmbed(`🎫 ${category.label} Ticket`, `Opened by <@${opener.id}>. Staff will be with you shortly.`);
    if (answers && Object.keys(answers).length) {
        embed.addFields(Object.entries(answers).map(([q, a]) => ({ name: q, value: String(a).slice(0, 1000) || 'N/A' })));
    }
    const pingRole = category.staffRoleId ? `<@&${category.staffRoleId}>` : '';
    await channel.send({ content: `<@${opener.id}> ${pingRole}`.trim(), embeds: [embed], components: ticketButtons(ticket) });

    await sendLog(guild, 'log_channel_ticket', { title: 'Ticket Opened', description: `${category.label} ticket by <@${opener.id}> - ${channel}` });

    return interaction.editReply({ embeds: [successEmbed('Ticket Created', `Your ticket has been created: ${channel}`)] });
}

/** Generate a plain-text transcript of the ticket channel. */
async function generateTranscript(channel) {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].reverse();
    const lines = sorted.map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}${m.attachments.size ? ' ' + [...m.attachments.values()].map(a => a.url).join(' ') : ''}`);
    return Buffer.from(lines.join('\n') || '(no messages)', 'utf8');
}

async function handleInteraction(interaction, client) {
    const [action, idRaw] = interaction.customId.split(':');
    const id = Number(idRaw);

    // ---- Category select on a panel ----
    if (action === 'ticket_panel_select') {
        const panel = getPanel.get(id);
        if (!panel) return interaction.reply({ embeds: [errorEmbed('Panel Not Found')], ephemeral: true });
        const cats = categoriesOf(panel);
        const category = cats.find(c => c.value === interaction.values[0]);
        if (!category) return interaction.reply({ embeds: [errorEmbed('Category Not Found')], ephemeral: true });

        if (category.questions?.length) {
            const modal = new ModalBuilder()
                .setCustomId(`ticket_modal:${panel.id}:${category.value}`)
                .setTitle(`${category.label} Ticket`.slice(0, 45));
            category.questions.slice(0, 5).forEach((q, i) => {
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId(`q${i}`).setLabel(q.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true)
                ));
            });
            return interaction.showModal(modal);
        }

        await interaction.deferReply({ ephemeral: true });
        return createTicket(interaction, panel, category, {});
    }

    // ---- Modal submit with pre-ticket questions ----
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal:')) {
        const [, panelId, categoryValue] = interaction.customId.split(':');
        const panel = getPanel.get(Number(panelId));
        const category = categoriesOf(panel).find(c => c.value === categoryValue);
        await interaction.deferReply({ ephemeral: true });
        const answers = {};
        category.questions.slice(0, 5).forEach((q, i) => { answers[q] = interaction.fields.getTextInputValue(`q${i}`); });
        return createTicket(interaction, panel, category, answers);
    }

    // ---- Rename modal submit ----
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_rename_modal:')) {
        const ticketId = Number(interaction.customId.split(':')[1]);
        const newName = interaction.fields.getTextInputValue('new_name');
        await interaction.channel.setName(newName.slice(0, 90)).catch(() => {});
        return interaction.reply({ embeds: [successEmbed('Renamed', `Channel renamed to **${newName}**.`)], ephemeral: true });
    }

    const ticket = getTicketById.get(id);
    if (!ticket && action !== 'ticket_rename_modal') return interaction.reply({ embeds: [errorEmbed('Ticket Not Found')], ephemeral: true });

    switch (action) {
        case 'ticket_claim': {
            if (ticket.claimed_by) {
                updateTicketClaim.run(null, id);
                await interaction.update({ components: ticketButtons({ ...ticket, claimed_by: null }) });
            } else {
                updateTicketClaim.run(interaction.user.id, id);
                await interaction.update({ components: ticketButtons({ ...ticket, claimed_by: interaction.user.id }) });
                await interaction.followUp({ embeds: [infoEmbed('Ticket Claimed', `Claimed by <@${interaction.user.id}>`)] });
            }
            return;
        }

        case 'ticket_rename': {
            const modal = new ModalBuilder().setCustomId(`ticket_rename_modal:${id}`).setTitle('Rename Ticket')
                .addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('new_name').setLabel('New channel name').setStyle(TextInputStyle.Short).setRequired(true)
                ));
            return interaction.showModal(modal);
        }

        case 'ticket_adduser':
        case 'ticket_removeuser': {
            const isAdd = action === 'ticket_adduser';
            const select = new UserSelectMenuBuilder().setCustomId(`${action}_select:${id}`).setPlaceholder(`Select a user to ${isAdd ? 'add' : 'remove'}`);
            return interaction.reply({ content: `Select a user to ${isAdd ? 'add to' : 'remove from'} this ticket:`, components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        }

        case 'ticket_adduser_select': {
            const userId = interaction.values[0];
            await interaction.channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
            return interaction.update({ content: `<@${userId}> added to the ticket.`, components: [] });
        }

        case 'ticket_removeuser_select': {
            const userId = interaction.values[0];
            await interaction.channel.permissionOverwrites.delete(userId).catch(() => {});
            return interaction.update({ content: `<@${userId}> removed from the ticket.`, components: [] });
        }

        case 'ticket_close': {
            await interaction.deferReply();
            const transcript = await generateTranscript(interaction.channel);
            const file = new AttachmentBuilder(transcript, { name: `transcript-ticket-${id}.txt` });

            const transcriptChannelId = getConfig(interaction.guild.id, 'ticket_transcript_channel');
            if (transcriptChannelId) {
                const tc = await interaction.guild.channels.fetch(transcriptChannelId).catch(() => null);
                if (tc) await tc.send({ embeds: [infoEmbed('Ticket Transcript', `Ticket #${id} - <#${ticket.channel_id}> - opened by <@${ticket.opener_id}>`)], files: [file] });
            }

            updateTicketStatus.run('closed', Date.now(), interaction.user.id, id);
            await interaction.channel.permissionOverwrites.edit(ticket.opener_id, { SendMessages: false }).catch(() => {});
            await interaction.editReply({ embeds: [infoEmbed('Ticket Closed', `Closed by <@${interaction.user.id}>. Transcript saved.`)], components: closedTicketButtons(ticket) });
            await sendLog(interaction.guild, 'log_channel_ticket', { title: 'Ticket Closed', description: `Ticket #${id} closed by <@${interaction.user.id}>` });

            const autoDeleteMin = Number(getConfig(interaction.guild.id, 'ticket_auto_delete_minutes') || 0);
            if (autoDeleteMin > 0) {
                setTimeout(() => interaction.channel.delete().catch(() => {}), autoDeleteMin * 60_000);
            }
            return;
        }

        case 'ticket_reopen': {
            updateTicketStatus.run('open', null, null, id);
            await interaction.channel.permissionOverwrites.edit(ticket.opener_id, { SendMessages: true }).catch(() => {});
            return interaction.update({ embeds: [successEmbed('Ticket Reopened', `Reopened by <@${interaction.user.id}>`)], components: ticketButtons(ticket) });
        }

        case 'ticket_delete': {
            await interaction.reply({ embeds: [infoEmbed('Deleting…', 'This channel will be deleted shortly.')] });
            await sendLog(interaction.guild, 'log_channel_ticket', { title: 'Ticket Deleted', description: `Ticket #${id} deleted by <@${interaction.user.id}>` });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            return;
        }
    }
}

module.exports = { handleInteraction, sendPanelMessage, getPanel, categoriesOf };
