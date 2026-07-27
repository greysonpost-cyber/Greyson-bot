const db = require('../database/db');

const insertAction = db.prepare(
    `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const listActions = db.prepare(`SELECT * FROM mod_actions WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC`);

function logModAction(guildId, userId, moderatorId, actionType, reason, durationMs = null) {
    insertAction.run(guildId, userId, moderatorId, actionType, reason ?? null, durationMs, Date.now());
}

function getHistory(guildId, userId) {
    return listActions.all(guildId, userId);
}

module.exports = { logModAction, getHistory };
