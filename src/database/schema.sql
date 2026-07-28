-- =========================================================
-- Grow a Garden Bot - Database Schema (SQLite)
-- =========================================================

-- Generic per-guild key/value configuration store.
-- Lets /config commands change channels, roles, toggles, etc. at runtime
-- with zero code edits. Values are stored as text; JSON-encode when needed.
CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (guild_id, key)
);

-- Maps a "granter" role to the list of role IDs it is allowed to give/remove
-- via /giverole, without needing Manage Roles.
CREATE TABLE IF NOT EXISTS role_permissions (
    guild_id TEXT NOT NULL,
    granter_role_id TEXT NOT NULL,
    grantable_role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, granter_role_id, grantable_role_id)
);

-- Maps a command name to the role IDs allowed to run it (permission system, item 12).
CREATE TABLE IF NOT EXISTS command_permissions (
    guild_id TEXT NOT NULL,
    command_name TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, command_name, role_id)
);

-- Moderation actions: warn, mute, timeout, kick, ban, unban, notes.
CREATE TABLE IF NOT EXISTS mod_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- warn | mute | timeout | kick | ban | unban | note
    reason TEXT,
    duration_ms INTEGER,       -- for timeouts/mutes, null otherwise
    created_at INTEGER NOT NULL
);

-- Ticket panels (a message with a dropdown of ticket categories).
CREATE TABLE IF NOT EXISTS ticket_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    panel_name TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    categories_json TEXT NOT NULL, -- JSON array of {label, value, emoji, questions:[...], staffRoleId, oneTicketOnly}
    created_at INTEGER NOT NULL
);

-- Open/closed tickets.
CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    panel_id INTEGER,
    category_value TEXT,
    channel_id TEXT NOT NULL,
    opener_id TEXT NOT NULL,
    claimed_by TEXT,
    status TEXT NOT NULL DEFAULT 'open', -- open | closed
    answers_json TEXT,
    created_at INTEGER NOT NULL,
    closed_at INTEGER,
    closed_by TEXT,
    transcript_url TEXT
);

-- Reports submitted via /report.
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reported_user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidence_url TEXT,
    comments TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | denied | need_more_evidence | warned | muted | kicked | banned
    staff_message_id TEXT,
    thread_id TEXT,
    handled_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Guild (in-game clan) roster.
CREATE TABLE IF NOT EXISTS guild_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,        -- Discord server ID
    discord_id TEXT NOT NULL,
    roblox_username TEXT,
    roblox_id TEXT,
    join_date INTEGER NOT NULL,
    recruiter_id TEXT,
    guild_rank TEXT DEFAULT 'Member',
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    last_active_check INTEGER,
    UNIQUE(guild_id, discord_id)
);

-- Giveaways.
CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    prize TEXT NOT NULL,
    hosted_by TEXT NOT NULL,
    winner_count INTEGER NOT NULL DEFAULT 1,
    required_role_id TEXT,
    required_guild_rank TEXT,
    bonus_role_id TEXT,       -- role that grants bonus entries
    bonus_entries INTEGER DEFAULT 0,
    ends_at INTEGER NOT NULL,
    ended INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0,
    winners_json TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
    giveaway_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    entries INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (giveaway_id, user_id)
);

-- BIG UPDATE: giveaway presets, claim tickets, automod, embeds, minigames
CREATE TABLE IF NOT EXISTS giveaway_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id, name)
);

CREATE TABLE IF NOT EXISTS giveaway_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  giveaway_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  winner_id TEXT NOT NULL,
  ticket_channel_id TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  claim_deadline INTEGER,
  auto_claimed INTEGER NOT NULL DEFAULT 0,
  reroll_number INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  fulfilled_at INTEGER,
  handled_by TEXT
);

CREATE TABLE IF NOT EXISTS saved_embeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  embed_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id, name)
);

CREATE TABLE IF NOT EXISTS automod_rules (
  guild_id TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT 'delete',
  threshold INTEGER,
  duration_ms INTEGER,
  ignored_roles_json TEXT,
  ignored_channels_json TEXT,
  custom_json TEXT,
  PRIMARY KEY(guild_id, rule_type)
);

CREATE TABLE IF NOT EXISTS wheel_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  message_id TEXT,
  entries_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
