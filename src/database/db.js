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


// Compatibility migrations for repositories that still contain command files
// from an older DripCore/Greyson Bot build. SQLite cannot add multiple columns
// with IF NOT EXISTS, so inspect each table before altering it.
function tableExists(table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}
function ensureColumn(table, name, definition) {
  if (!tableExists(table)) return;
  const names = columns(table);
  if (!names.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

// Older embed, preset, and wheel commands prepare statements as soon as the
// module loads, so their tables must exist before slash commands are imported.
db.exec(`
CREATE TABLE IF NOT EXISTS saved_embeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, name TEXT NOT NULL,
  embed_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE(guild_id, name)
);
CREATE TABLE IF NOT EXISTS giveaway_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, name TEXT NOT NULL,
  settings_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE(guild_id, name)
);
CREATE TABLE IF NOT EXISTS wheel_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
  host_id TEXT NOT NULL, message_id TEXT, entries_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL
);
`);

// Columns used by older command versions. Keeping them nullable/defaulted makes
// upgrades safe without restoring removed options in the current slash commands.
ensureColumn('automod_rules', 'threshold', 'INTEGER');
ensureColumn('automod_rules', 'duration_ms', 'INTEGER');
ensureColumn('automod_rules', 'ignored_roles_json', 'TEXT');
ensureColumn('automod_rules', 'ignored_channels_json', 'TEXT');
ensureColumn('automod_rules', 'custom_json', 'TEXT');
ensureColumn('giveaways', 'bonus_role_id', 'TEXT');
ensureColumn('giveaways', 'bonus_entries', 'INTEGER DEFAULT 0');
ensureColumn('giveaway_entries', 'roblox_username', 'TEXT');
ensureColumn('giveaway_claims', 'status', "TEXT NOT NULL DEFAULT 'waiting'");
ensureColumn('giveaway_claims', 'claim_deadline', 'INTEGER');
ensureColumn('giveaway_claims', 'reroll_number', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('giveaway_claims', 'claimed_at', 'INTEGER');
ensureColumn('giveaway_claims', 'fulfilled_at', 'INTEGER');
ensureColumn('giveaway_claims', 'handled_by', 'TEXT');

// v2.2 giveaway ticket confirmation compatibility.
ensureColumn('giveaway_claims', 'host_id', 'TEXT');
ensureColumn('giveaway_claims', 'message_id', 'TEXT');
// v2.2.3 giveaway channel claim status message.
ensureColumn('giveaway_claims', 'status_message_id', 'TEXT');
// v2.2.7 giveaway ticket prompt tracking.
ensureColumn('giveaway_claims', 'claim_prompt_message_id', 'TEXT');
ensureColumn('giveaway_claims', 'fulfillment_prompt_message_id', 'TEXT');

ensureColumn('giveaway_claims', 'escalated', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('giveaway_claims', 'resolved', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('giveaway_claims', 'ticket_channel_id', 'TEXT');
ensureColumn('giveaway_claims', 'deadline_at', 'INTEGER');
ensureColumn('giveaway_claims', 'claimed', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('giveaway_claims', 'auto_claimed', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('giveaway_claims', 'created_at', 'INTEGER');
ensureColumn('tournament_players', 'token_bonus_points', 'INTEGER NOT NULL DEFAULT 0');

db.exec(`CREATE TABLE IF NOT EXISTS giveaway_ticket_votes (
  claim_id INTEGER PRIMARY KEY,
  winner_claimed INTEGER NOT NULL DEFAULT 0,
  winner_fulfilled INTEGER NOT NULL DEFAULT 0,
  host_fulfilled INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  transcript_sent INTEGER NOT NULL DEFAULT 0
);`);


// Spider-Verse artifact passive tracking (safe for existing databases).
db.exec(`
CREATE TABLE IF NOT EXISTS artifact_passive_cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  passive_key TEXT NOT NULL,
  last_used_at INTEGER NOT NULL,
  PRIMARY KEY(guild_id,user_id,passive_key)
);
CREATE TABLE IF NOT EXISTS artifact_passive_daily_usage (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  passive_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(guild_id,user_id,passive_key,day_key)
);
CREATE TABLE IF NOT EXISTS giveaway_token_boosts (
  giveaway_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tokens_spent INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(giveaway_id,user_id)
);
CREATE TABLE IF NOT EXISTS artifact_passive_refunds (
  giveaway_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  artifact_name TEXT NOT NULL,
  refunded_at INTEGER NOT NULL,
  PRIMARY KEY(giveaway_id,user_id,artifact_name)
);

CREATE TABLE IF NOT EXISTS tournament_token_boosts (
  tournament_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tokens_spent INTEGER NOT NULL,
  points_added INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(tournament_id,user_id)
);
`);

module.exports = db;
