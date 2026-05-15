'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DEFAULT_DB = path.resolve(process.cwd(), 'data/hashgoblin.sqlite');

function openDatabase(dbPath = process.env.HASHGOBLIN_DB || DEFAULT_DB) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  bank_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_won INTEGER NOT NULL DEFAULT 0,
  lifetime_lost INTEGER NOT NULL DEFAULT 0,
  lifetime_bet INTEGER NOT NULL DEFAULT 0,
  biggest_win INTEGER NOT NULL DEFAULT 0,
  daily_last_claim TEXT,
  daily_streak INTEGER NOT NULL DEFAULT 0,
  work_last_claim TEXT,
  equipped_title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  change_amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  related_user_id TEXT,
  game_id TEXT,
  balance_after INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  bet_amount INTEGER NOT NULL,
  payout_amount INTEGER NOT NULL,
  profit INTEGER NOT NULL,
  server_seed_hash TEXT NOT NULL,
  server_seed TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  result_hash TEXT NOT NULL,
  roll INTEGER,
  odds_text TEXT,
  edge_text TEXT,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  amount INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_trades (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  fee INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS user_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_name TEXT NOT NULL,
  price_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id, user_id, item_id)
);

CREATE TABLE IF NOT EXISTS jackpot_pools (
  guild_id TEXT NOT NULL,
  pool_type TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 100000,
  last_won_by TEXT,
  last_won_amount INTEGER NOT NULL DEFAULT 0,
  last_won_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, pool_type)
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  currency_name TEXT NOT NULL DEFAULT 'Glory',
  starting_balance INTEGER NOT NULL DEFAULT 1000,
  daily_amount INTEGER NOT NULL DEFAULT 750,
  max_bet_percent INTEGER NOT NULL DEFAULT 25,
  transfer_fee_bps INTEGER NOT NULL DEFAULT 200,
  min_bet INTEGER NOT NULL DEFAULT 10,
  max_bet_absolute INTEGER NOT NULL DEFAULT 50000,
  lotto_ticket_cost INTEGER NOT NULL DEFAULT 100,
  welcome_enabled INTEGER NOT NULL DEFAULT 0,
  welcome_channel_id TEXT,
  welcome_message TEXT,
  goodbye_enabled INTEGER NOT NULL DEFAULT 0,
  goodbye_channel_id TEXT,
  goodbye_message TEXT,
  member_role_enabled INTEGER NOT NULL DEFAULT 0,
  member_role_id TEXT,
  gambling_enabled INTEGER NOT NULL DEFAULT 1,
  transfers_enabled INTEGER NOT NULL DEFAULT 1,
  big_win_enabled INTEGER NOT NULL DEFAULT 0,
  big_win_channel_id TEXT,
  big_win_threshold INTEGER NOT NULL DEFAULT 100000,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
  `);

  const columns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!columns.includes('work_last_claim')) {
    db.prepare('ALTER TABLE users ADD COLUMN work_last_claim TEXT').run();
  }
  if (!columns.includes('equipped_title')) {
    db.prepare('ALTER TABLE users ADD COLUMN equipped_title TEXT').run();
  }
  if (!columns.includes('bank_balance')) {
    db.prepare('ALTER TABLE users ADD COLUMN bank_balance INTEGER NOT NULL DEFAULT 0').run();
  }

  const settingsColumns = db.prepare('PRAGMA table_info(guild_settings)').all().map(c => c.name);
  for (const [name, def] of [
    ['welcome_enabled', 'INTEGER NOT NULL DEFAULT 0'],
    ['welcome_channel_id', 'TEXT'],
    ['welcome_message', 'TEXT'],
    ['goodbye_enabled', 'INTEGER NOT NULL DEFAULT 0'],
    ['goodbye_channel_id', 'TEXT'],
    ['goodbye_message', 'TEXT'],
    ['member_role_enabled', 'INTEGER NOT NULL DEFAULT 0'],
    ['member_role_id', 'TEXT'],
    ['gambling_enabled', 'INTEGER NOT NULL DEFAULT 1'],
    ['transfers_enabled', 'INTEGER NOT NULL DEFAULT 1'],
    ['big_win_enabled', 'INTEGER NOT NULL DEFAULT 0'],
    ['big_win_channel_id', 'TEXT'],
    ['big_win_threshold', 'INTEGER NOT NULL DEFAULT 100000']
  ]) {
    if (!settingsColumns.includes(name)) db.prepare(`ALTER TABLE guild_settings ADD COLUMN ${name} ${def}`).run();
  }
}


function getSettings(db, guildId) {
  let row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO guild_settings (guild_id, currency_name) VALUES (?, ?)')
      .run(guildId, process.env.HASHGOBLIN_DEFAULT_CURRENCY || 'Glory');
    row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  }
  return row;
}

function ensureUser(db, guildId, userId) {
  const settings = getSettings(db, guildId);
  let user = db.prepare('SELECT * FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!user) {
    db.prepare('INSERT INTO users (guild_id, user_id, balance) VALUES (?, ?, ?)')
      .run(guildId, userId, settings.starting_balance);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, balance_after) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, userId, settings.starting_balance, 'starting_balance', settings.starting_balance);
    user = db.prepare('SELECT * FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  }
  return user;
}

module.exports = { openDatabase, getSettings, ensureUser };
