const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'bot.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Safe migrations for existing Railway databases.
ensureColumn('giveaways', 'description', 'TEXT');
ensureColumn('giveaways', 'bonus_roles_json', "TEXT DEFAULT '[]'");
ensureColumn('giveaways', 'manual_entries_json', "TEXT DEFAULT '{}'");
ensureColumn('giveaways', 'claim_settings_json', "TEXT DEFAULT '{}'");
ensureColumn('giveaways', 'ticket_settings_json', "TEXT DEFAULT '{}'");
ensureColumn('giveaways', 'preset_name', 'TEXT');
ensureColumn('giveaways', 'reroll_count', 'INTEGER NOT NULL DEFAULT 0');

module.exports = db;
