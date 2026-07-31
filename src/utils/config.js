const db = require('../database/db');

// Known config keys, purely for documentation / autocomplete in /config.
// Nothing stops you from storing extra keys too.
const CONFIG_KEYS = [
    'log_channel_message', 'log_channel_member', 'log_channel_mod', 'log_channel_role',
    'log_channel_voice', 'log_channel_ticket', 'log_channel_report', 'log_channel_channel',
    'ticket_category_id', 'ticket_transcript_channel', 'ticket_auto_delete_minutes',
    'report_channel', 'report_thread_enabled',
    'guild_accept_role', 'guild_roster_channel', 'guild_roster_message', 'giveaway_default_channel',
    'giveaway_ticket_category', 'giveaway_staff_role', 'giveaway_default_claim_minutes',
    'ai_enabled', 'ai_knowledge', 'ai_help_channel', 'ai_guild_channel', 'ai_giveaway_channel', 'ai_staff_role',
    'auto_role_on_join', 'auto_role_on_verify', 'auto_role_on_guild_accept', 'auto_role_on_ticket_accept',
    'tournament_manager_role', 'tournament_announcement_channel', 'tournament_participant_role',
    'token_drop_channel',
];

const getSet = db.prepare(
    `INSERT INTO guild_config (guild_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value`
);
const getGet = db.prepare(`SELECT value FROM guild_config WHERE guild_id = ? AND key = ?`);
const getAll = db.prepare(`SELECT key, value FROM guild_config WHERE guild_id = ?`);
const getDelete = db.prepare(`DELETE FROM guild_config WHERE guild_id = ? AND key = ?`);

function setConfig(guildId, key, value) {
    getSet.run(guildId, key, String(value));
}

function getConfig(guildId, key, fallback = null) {
    const row = getGet.get(guildId, key);
    return row ? row.value : fallback;
}

function getAllConfig(guildId) {
    const rows = getAll.all(guildId);
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
}

function deleteConfig(guildId, key) {
    getDelete.run(guildId, key);
}

module.exports = { CONFIG_KEYS, setConfig, getConfig, getAllConfig, deleteConfig };
