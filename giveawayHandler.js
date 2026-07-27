const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { successEmbed, errorEmbed, baseEmbed } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');

const getGiveaway = db.prepare(`SELECT * FROM giveaways WHERE id = ?`);
const getGiveawayByMessage = db.prepare(`SELECT * FROM giveaways WHERE message_id = ?`);
const updateEnded = db.prepare(`UPDATE giveaways SET ended = 1, winners_json = ? WHERE id = ?`);
const updateLocked = db.prepare(`UPDATE giveaways SET locked = ? WHERE id = ?`);
const dueGiveaways = db.prepare(`SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?`);

const upsertEntry = db.prepare(
    `INSERT INTO giveaway_entries (giveaway_id, user_id, entries) VALUES (?, ?, ?)
     ON CONFLICT(giveaway_id, user_id) DO UPDATE SET entries = excluded.entries`
);
const getEntry = db.prepare(`SELECT * FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?`);
const allEntries = db.prepare(`SELECT * FROM giveaway_entries WHERE giveaway_id = ?`);
const countEntries = db.prepare(`SELECT COUNT(*) as c FROM giveaway_entries WHERE giveaway_id = ?`);

function entryButton(giveaway) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`giveaway_enter:${giveaway.id}`).setLabel('🎉 Enter Giveaway').setStyle(ButtonStyle.Success)
    );
}

function giveawayEmbed(giveaway) {
    const count = countEntries.get(giveaway.id).c;
    return baseEmbed()
        .setTitle(`🎉 ${giveaway.prize}`)
        .setDescription(
            `Click the button below to enter!\n\n` +
            `**Ends:** <t:${Math.floor(giveaway.ends_at / 1000)}:R>\n` +
            `**Winners:** ${giveaway.winner_count}\n` +
            `**Hosted by:** <@${giveaway.hosted_by}>\n` +
            (giveaway.required_role_id ? `**Required Role:** <@&${giveaway.required_role_id}>\n` : '') +
            (giveaway.required_guild_rank ? `**Required Guild Rank:** ${giveaway.required_guild_rank}\n` : '') +
            (giveaway.bonus_role_id ? `**Bonus Entries:** <@&${giveaway.bonus_role_id}> gets +${giveaway.bonus_entries}\n` : '') +
            `\n**Entries so far:** ${count}`
        );
}

async function pickWinners(guild, giveaway) {
    const entries = allEntries.all(giveaway.id);
    const pool = [];
    for (const e of entries) for (let i = 0; i < e.entries; i++) pool.push(e.user_id);
    if (!pool.length) return [];

    const winners = new Set();
    const uniqueUsers = [...new Set(pool)];
    while (winners.size < giveaway.winner_count && winners.size < uniqueUsers.length) {
        winners.add(pool[Math.floor(Math.random() * pool.length)]);
    }
    return [...winners];
}

async function endGiveaway(client, giveawayId, { reroll = false } = {}) {
    const giveaway = getGiveaway.get(giveawayId);
    if (!giveaway) return null;
    const guild = await client.guilds.fetch(giveaway.guild_id).catch(() => null);
    if (!guild) return null;
    const channel = await guild.channels.fetch(giveaway.channel_id).catch(() => null);

    const winners = await pickWinners(guild, giveaway);
    updateEnded.run(JSON.stringify(winners), giveawayId);

    const resultText = winners.length ? winners.map(w => `<@${w}>`).join(', ') : 'No valid entries.';
    if (channel) {
        await channel.send({ embeds: [successEmbed(reroll ? '🎉 Giveaway Rerolled!' : '🎉 Giveaway Ended!', `**${giveaway.prize}**\n**Winner(s):** ${resultText}`)] });
        if (giveaway.message_id) {
            const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
            if (msg) await msg.edit({ embeds: [giveawayEmbed(giveaway).setTitle(`🎉 [ENDED] ${giveaway.prize}`)], components: [] }).catch(() => {});
        }
    }
    await sendLog(guild, 'log_channel_mod', { title: reroll ? 'Giveaway Rerolled' : 'Giveaway Ended', description: `**${giveaway.prize}** - Winners: ${resultText}` });
    return winners;
}

async function handleInteraction(interaction, client) {
    const [action, idRaw] = interaction.customId.split(':');
    const giveawayId = Number(idRaw);
    const giveaway = getGiveaway.get(giveawayId);
    if (!giveaway) return interaction.reply({ embeds: [errorEmbed('Giveaway Not Found')], ephemeral: true });

    if (action === 'giveaway_enter') {
        if (giveaway.ended) return interaction.reply({ embeds: [errorEmbed('Giveaway Ended', 'This giveaway has already ended.')], ephemeral: true });
        if (giveaway.locked) return interaction.reply({ embeds: [errorEmbed('Giveaway Locked', 'Entries are currently locked for this giveaway.')], ephemeral: true });

        if (giveaway.required_role_id && !interaction.member.roles.cache.has(giveaway.required_role_id)) {
            return interaction.reply({ embeds: [errorEmbed('Not Eligible', `You need the <@&${giveaway.required_role_id}> role to enter.`)], ephemeral: true });
        }

        let entries = 1;
        if (giveaway.bonus_role_id && interaction.member.roles.cache.has(giveaway.bonus_role_id)) {
            entries += giveaway.bonus_entries || 0;
        }

        const existing = getEntry.get(giveawayId, interaction.user.id);
        if (existing) return interaction.reply({ embeds: [successEmbed("You're Already Entered!", `You have **${existing.entries}** entr${existing.entries === 1 ? 'y' : 'ies'}.`)], ephemeral: true });

        upsertEntry.run(giveawayId, interaction.user.id, entries);
        return interaction.reply({ embeds: [successEmbed('Entered!', `You're in! You have **${entries}** entr${entries === 1 ? 'y' : 'ies'}.`)], ephemeral: true });
    }
}

/** Polls every 15s for giveaways whose end time has passed and ends them automatically. */
function startScheduler(client) {
    setInterval(async () => {
        const due = dueGiveaways.all(Date.now());
        for (const g of due) {
            await endGiveaway(client, g.id).catch(err => console.error('[giveaway scheduler]', err));
        }
    }, 15_000);
}

module.exports = { handleInteraction, entryButton, giveawayEmbed, endGiveaway, startScheduler, updateLocked, getGiveawayByMessage };
