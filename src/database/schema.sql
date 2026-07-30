CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    guild_id TEXT NOT NULL,
    granter_role_id TEXT NOT NULL,
    grantable_role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, granter_role_id, grantable_role_id)
);

CREATE TABLE IF NOT EXISTS command_permissions (
    guild_id TEXT NOT NULL,
    command_name TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, command_name, role_id)
);

CREATE TABLE IF NOT EXISTS mod_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    reason TEXT,
    duration_ms INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    panel_name TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    categories_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    panel_id INTEGER,
    category_value TEXT,
    channel_id TEXT NOT NULL,
    opener_id TEXT NOT NULL,
    claimed_by TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    answers_json TEXT,
    created_at INTEGER NOT NULL,
    closed_at INTEGER,
    closed_by TEXT,
    transcript_url TEXT
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reported_user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidence_url TEXT,
    comments TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    staff_message_id TEXT,
    thread_id TEXT,
    handled_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    roblox_username TEXT NOT NULL,
    join_date INTEGER NOT NULL,
    recruiter_id TEXT,
    guild_rank TEXT DEFAULT 'Member',
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    last_active_check INTEGER,
    UNIQUE(guild_id, discord_id)
);

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
    roblox_username TEXT,
    PRIMARY KEY (giveaway_id, user_id)
);

CREATE TABLE IF NOT EXISTS giveaway_bonus_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    extra_entries INTEGER NOT NULL,
    PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS giveaway_claim_time_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    extra_minutes INTEGER NOT NULL,
    PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS giveaway_auto_claim_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS giveaway_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    winner_id TEXT NOT NULL,
    host_id TEXT,
    ticket_channel_id TEXT,
    message_id TEXT,
    status_message_id TEXT,
    claim_prompt_message_id TEXT,
    fulfillment_prompt_message_id TEXT,
    deadline_at INTEGER NOT NULL,
    claimed INTEGER NOT NULL DEFAULT 0,
    auto_claimed INTEGER NOT NULL DEFAULT 0,
    resolved INTEGER NOT NULL DEFAULT 0,
    escalated INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'waiting',
    claimed_at INTEGER,
    fulfilled_at INTEGER,
    handled_by TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(giveaway_id, winner_id)
);

CREATE TABLE IF NOT EXISTS giveaway_ticket_votes (
    claim_id INTEGER PRIMARY KEY,
    winner_claimed INTEGER NOT NULL DEFAULT 0,
    winner_fulfilled INTEGER NOT NULL DEFAULT 0,
    host_fulfilled INTEGER NOT NULL DEFAULT 0,
    closed INTEGER NOT NULL DEFAULT 0,
    transcript_sent INTEGER NOT NULL DEFAULT 0
);

-- Automod tables are initialized before slash-command modules load. This also
-- keeps upgrades compatible with earlier DripCore/Greyson Bot automod files.
CREATE TABLE IF NOT EXISTS automod_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    rule_type TEXT NOT NULL DEFAULT 'blocked_phrase',
    pattern TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'delete',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_automod_rules_guild
ON automod_rules (guild_id, enabled);

-- Legacy compatibility tables. These allow older command files left in a
-- repository to load safely while users replace the project files.
CREATE TABLE IF NOT EXISTS saved_embeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    embed_json TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(guild_id, name)
);

CREATE TABLE IF NOT EXISTS giveaway_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(guild_id, name)
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

-- DripCore tournament system
CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prize TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 64,
  status TEXT NOT NULL DEFAULT 'registration',
  current_round INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  message_id TEXT,
  participant_role_id TEXT,
  finalist1_id TEXT,
  finalist2_id TEXT,
  champion_id TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  roblox_username TEXT,
  contribution_points INTEGER NOT NULL DEFAULT 0 CHECK(contribution_points BETWEEN 0 AND 5),
  round1_points INTEGER NOT NULL DEFAULT 0,
  round2_points INTEGER NOT NULL DEFAULT 0,
  round3_points INTEGER NOT NULL DEFAULT 0,
  round4_points INTEGER NOT NULL DEFAULT 0,
  seed_key TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS tournament_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  points INTEGER NOT NULL,
  note TEXT,
  awarded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
