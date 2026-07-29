const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'bot.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Safe migrations for users upgrading an existing database.
function columns(table) { return db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name); }
const gm = columns('guild_members');
if (gm.includes('roblox_id')) {
  db.exec(`CREATE TABLE IF NOT EXISTS guild_members_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, discord_id TEXT NOT NULL,
    roblox_username TEXT NOT NULL, join_date INTEGER NOT NULL, recruiter_id TEXT,
    guild_rank TEXT DEFAULT 'Member', notes TEXT, active INTEGER NOT NULL DEFAULT 1,
    last_active_check INTEGER, UNIQUE(guild_id, discord_id));
    INSERT OR IGNORE INTO guild_members_new (id,guild_id,discord_id,roblox_username,join_date,recruiter_id,guild_rank,notes,active,last_active_check)
    SELECT id,guild_id,discord_id,COALESCE(roblox_username,'Unknown'),join_date,recruiter_id,guild_rank,notes,active,last_active_check FROM guild_members;
    DROP TABLE guild_members;
    ALTER TABLE guild_members_new RENAME TO guild_members;`);
}

module.exports = db;
