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
    require_clan_tag INTEGER NOT NULL DEFAULT 1,
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
  token_bonus_points INTEGER NOT NULL DEFAULT 0,
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

-- Tournament round operations (v2.3.1)
CREATE TABLE IF NOT EXISTS tournament_round_state (
  tournament_id INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  theme TEXT,
  submission_deadline INTEGER,
  voting_open INTEGER NOT NULL DEFAULT 0,
  voting_closed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, round_number)
);

CREATE TABLE IF NOT EXISTS tournament_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  submitted_at INTEGER NOT NULL,
  UNIQUE(tournament_id, round_number, user_id)
);

CREATE TABLE IF NOT EXISTS tournament_votes (
  tournament_id INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  voter_id TEXT NOT NULL,
  submission_id INTEGER NOT NULL,
  voted_at INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, round_number, voter_id)
);

CREATE TABLE IF NOT EXISTS tournament_mm2_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  winner_id TEXT NOT NULL,
  loser_id TEXT NOT NULL,
  winner_points INTEGER NOT NULL DEFAULT 10,
  loser_points INTEGER NOT NULL DEFAULT 1,
  reported_by TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL
);

-- DripCore v3 economy and collectible artifacts
CREATE TABLE IF NOT EXISTS token_balances (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS token_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,amount INTEGER NOT NULL,reason TEXT,actor_id TEXT,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS booster_rewards (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,boost_started_at INTEGER NOT NULL,last_weekly_at INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS daily_claims (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,claim_key TEXT NOT NULL,last_claim_at INTEGER NOT NULL,streak INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(guild_id,user_id,claim_key));
CREATE TABLE IF NOT EXISTS minigame_rewards (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,day_key TEXT NOT NULL,tokens_earned INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id,day_key));
CREATE TABLE IF NOT EXISTS artifact_types (id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,name TEXT NOT NULL,collection_name TEXT NOT NULL,discord_role_id TEXT,theme TEXT,passive TEXT,rarity TEXT NOT NULL DEFAULT 'Limited',max_copies INTEGER NOT NULL,base_price INTEGER NOT NULL,created_by TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(guild_id,name));
CREATE TABLE IF NOT EXISTS artifacts (id INTEGER PRIMARY KEY AUTOINCREMENT,type_id INTEGER NOT NULL,copy_number INTEGER NOT NULL,owner_id TEXT,obtained_at INTEGER,origin TEXT,trade_count INTEGER NOT NULL DEFAULT 0,locked_trade_id INTEGER,UNIQUE(type_id,copy_number));
CREATE TABLE IF NOT EXISTS artifact_history (id INTEGER PRIMARY KEY AUTOINCREMENT,artifact_id INTEGER NOT NULL,from_user_id TEXT,to_user_id TEXT,action TEXT NOT NULL,reason TEXT,transaction_id TEXT,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shop_stock (guild_id TEXT NOT NULL,artifact_type_id INTEGER NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL,channel_id TEXT,message_id TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(guild_id,artifact_type_id));
CREATE TABLE IF NOT EXISTS marketplace_listings (id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,artifact_id INTEGER NOT NULL,seller_id TEXT NOT NULL,price INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'active',channel_id TEXT,message_id TEXT,created_at INTEGER NOT NULL,sold_at INTEGER,buyer_id TEXT);
CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_a TEXT NOT NULL,user_b TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',ready_a INTEGER NOT NULL DEFAULT 0,ready_b INTEGER NOT NULL DEFAULT 0,confirm_a INTEGER NOT NULL DEFAULT 0,confirm_b INTEGER NOT NULL DEFAULT 0,locked_at INTEGER,channel_id TEXT,message_id TEXT,created_at INTEGER NOT NULL,completed_at INTEGER,transaction_id TEXT);
CREATE TABLE IF NOT EXISTS trade_items (trade_id INTEGER NOT NULL,side TEXT NOT NULL,item_type TEXT NOT NULL,item_id INTEGER NOT NULL DEFAULT 0,amount INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(trade_id,side,item_type,item_id));
CREATE TABLE IF NOT EXISTS collection_preferences (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,artifact_id INTEGER NOT NULL,accepting_offers INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id,artifact_id));
CREATE TABLE IF NOT EXISTS economy_config (guild_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT,PRIMARY KEY(guild_id,key));
CREATE INDEX IF NOT EXISTS idx_artifacts_owner ON artifacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_market_active ON marketplace_listings(guild_id,status);


-- Power Token boosts selected from tournament panels
CREATE TABLE IF NOT EXISTS tournament_token_boosts (
  tournament_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tokens_spent INTEGER NOT NULL,
  points_added INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(tournament_id,user_id)
);


-- Tournament round powers and automatic placement rewards
CREATE TABLE IF NOT EXISTS tournament_round_powers (
  tournament_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  power_key TEXT NOT NULL,
  tokens_spent INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0,
  selected_at INTEGER NOT NULL,
  PRIMARY KEY(tournament_id,round_number,user_id)
);
CREATE TABLE IF NOT EXISTS tournament_placement_rewards (
  tournament_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  place INTEGER NOT NULL,
  tokens_awarded INTEGER NOT NULL,
  awarded_at INTEGER NOT NULL,
  PRIMARY KEY(tournament_id,user_id),
  UNIQUE(tournament_id,place)
);

-- Automatic Power Token drops
CREATE TABLE IF NOT EXISTS token_drop_state (
    guild_id TEXT PRIMARY KEY,
    next_drop_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS token_drops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    winner_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_token_drops_active ON token_drops(status, expires_at);

-- Automatic Discord role rewards for completing artifact collections.
CREATE TABLE IF NOT EXISTS collection_rewards (
  guild_id TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  remove_if_incomplete INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(guild_id, collection_name)
);


-- Cosmetics, live token leaderboard, and paid auto-claim power.
CREATE TABLE IF NOT EXISTS giveaway_auto_claim_purchases (
  giveaway_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tokens_spent INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(giveaway_id,user_id)
);
CREATE TABLE IF NOT EXISTS token_leaderboard_messages (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Owner-only forced trade/balance audit log
CREATE TABLE IF NOT EXISTS owner_override_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_id TEXT,
  action TEXT NOT NULL,
  artifact_id INTEGER,
  tokens INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  before_balance INTEGER,
  after_balance INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_override_audit_guild ON owner_override_audit(guild_id,created_at DESC);
