'use strict';

const { ensureUser, getSettings } = require('./db');
const { hashToRoll } = require('./math');
const crypto = require('crypto');

function assertPositiveAmount(amount, min = 1) {
  if (!Number.isInteger(amount) || amount < min) throw new Error(`Amount must be at least ${min}.`);
}

function getUser(db, guildId, userId) {
  return ensureUser(db, guildId, userId);
}

function formatGlory(amount, currency = 'Glory') {
  return `${Number(amount).toLocaleString('en-GB')} ${currency}`;
}

function maxBetFor(user, settings) {
  const pct = Math.floor(user.balance * (settings.max_bet_percent / 100));
  return Math.max(settings.min_bet, Math.min(settings.max_bet_absolute, pct));
}

function titleForUser(user) {
  if (user.equipped_title) return user.equipped_title;
  const net = Number(user.lifetime_won || 0) - Number(user.lifetime_lost || 0);
  if (user.biggest_win >= 1000000) return 'Mythic Goblin';
  if (user.biggest_win >= 100000) return 'Jackpot Menace';
  if (net >= 50000) return 'Profit Gremlin';
  if (user.lifetime_bet >= 250000) return 'Degenerate Mathematician';
  if (user.balance >= 50000) return 'Glory Hoarder';
  if (user.lifetime_bet >= 10000) return 'Hash Gambler';
  return 'Fresh Goblin';
}

function claimDaily(db, guildId, userId) {
  return db.transaction(() => {
    const settings = getSettings(db, guildId);
    const user = ensureUser(db, guildId, userId);
    const today = new Date().toISOString().slice(0, 10);
    if (user.daily_last_claim === today) throw new Error('You already claimed your daily Glory today.');

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streak = user.daily_last_claim === yesterday ? user.daily_streak + 1 : 1;
    const streakBonus = Math.min(1500, Math.max(0, streak - 1) * 100);
    const amount = settings.daily_amount + streakBonus;
    const newBalance = user.balance + amount;

    db.prepare(`UPDATE users SET balance = ?, daily_last_claim = ?, daily_streak = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?`)
      .run(newBalance, today, streak, guildId, userId);
    db.prepare(`INSERT INTO ledger (guild_id, user_id, change_amount, reason, balance_after) VALUES (?, ?, ?, ?, ?)`)
      .run(guildId, userId, amount, 'daily', newBalance);
    return { amount, streak, streakBonus, balance: newBalance, currency: settings.currency_name };
  })();
}

function claimWork(db, guildId, userId) {
  return db.transaction(() => {
    const settings = getSettings(db, guildId);
    const user = ensureUser(db, guildId, userId);
    const now = Date.now();
    const last = user.work_last_claim ? Date.parse(user.work_last_claim) : 0;
    const cooldownMs = 60 * 60 * 1000;
    if (last && now - last < cooldownMs) {
      const mins = Math.ceil((cooldownMs - (now - last)) / 60000);
      throw new Error(`The goblin has no more odd jobs for you yet. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    const seed = `${guildId}:${userId}:${now}:${crypto.randomBytes(16).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    const roll = hashToRoll(hash, 10000);
    const amount = 150 + Math.floor(roll / 10000 * 351); // 150-500
    const newBalance = user.balance + amount;
    db.prepare('UPDATE users SET balance = ?, work_last_claim = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(newBalance, new Date(now).toISOString(), guildId, userId);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, balance_after) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, userId, amount, 'work', newBalance);
    return { amount, balance: newBalance, currency: settings.currency_name, roll };
  })();
}

function transfer(db, guildId, fromUserId, toUserId, amount) {
  return db.transaction(() => {
    if (fromUserId === toUserId) throw new Error('You cannot give Glory to yourself.');
    const settings = getSettings(db, guildId);
    assertPositiveAmount(amount, 10);
    const from = ensureUser(db, guildId, fromUserId);
    const to = ensureUser(db, guildId, toUserId);
    if (from.balance < amount) throw new Error('You do not have enough Glory.');

    const fee = Math.floor(amount * settings.transfer_fee_bps / 10000);
    const received = amount - fee;
    const fromAfter = from.balance - amount;
    const toAfter = to.balance + received;

    db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(fromAfter, guildId, fromUserId);
    db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(toAfter, guildId, toUserId);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, related_user_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, fromUserId, -amount, 'transfer_sent', toUserId, fromAfter);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, related_user_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, toUserId, received, 'transfer_received', fromUserId, toAfter);
    db.prepare('INSERT INTO transfers (guild_id, from_user_id, to_user_id, amount, fee) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, fromUserId, toUserId, amount, fee);
    return { amount, fee, received, fromAfter, toAfter, currency: settings.currency_name };
  })();
}

function applyGame(db, guildId, userId, gameRecord, gameResult) {
  return db.transaction(() => {
    const settings = getSettings(db, guildId);
    const user = ensureUser(db, guildId, userId);
    const bet = gameResult.gameType === 'lotto' ? settings.lotto_ticket_cost : gameRecord.betAmount;
    assertPositiveAmount(bet, settings.min_bet);
    const maxBet = maxBetFor(user, settings);
    if (gameResult.gameType !== 'lotto' && bet > maxBet) {
      throw new Error(`Max bet for your balance is ${formatGlory(maxBet, settings.currency_name)}.`);
    }
    if (user.balance < bet) throw new Error('You do not have enough Glory.');

    const afterBet = user.balance - bet;
    const afterPayout = afterBet + gameResult.payout;
    const profit = gameResult.payout - bet;
    const won = Math.max(0, profit);
    const lost = profit < 0 ? Math.abs(profit) : 0;

    db.prepare(`UPDATE users SET
      balance = ?,
      lifetime_won = lifetime_won + ?,
      lifetime_lost = lifetime_lost + ?,
      lifetime_bet = lifetime_bet + ?,
      biggest_win = MAX(biggest_win, ?),
      updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND user_id = ?`)
      .run(afterPayout, won, lost, bet, won, guildId, userId);

    db.prepare(`INSERT INTO games
      (id, guild_id, user_id, game_type, bet_amount, payout_amount, profit, server_seed_hash, server_seed, client_seed, nonce, result_hash, roll, odds_text, edge_text, result_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(gameRecord.id, guildId, userId, gameResult.gameType, bet, gameResult.payout, profit,
        gameRecord.serverSeedHash, gameRecord.serverSeed, gameRecord.clientSeed, gameRecord.nonce,
        gameRecord.resultHash, Number(gameResult.roll || 0), gameResult.oddsText, gameResult.edgeText,
        JSON.stringify(gameResult.details));

    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, game_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, userId, -bet, `${gameResult.gameType}_bet`, gameRecord.id, afterBet);
    if (gameResult.payout > 0) {
      db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, game_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, gameResult.payout, `${gameResult.gameType}_payout`, gameRecord.id, afterPayout);
    }
    return { balance: afterPayout, profit, bet, currency: settings.currency_name };
  })();
}


function createTrade(db, guildId, fromUserId, toUserId, amount, note = '') {
  return db.transaction(() => {
    if (fromUserId === toUserId) throw new Error('You cannot trade with yourself.');
    const settings = getSettings(db, guildId);
    assertPositiveAmount(amount, 10);
    const from = ensureUser(db, guildId, fromUserId);
    ensureUser(db, guildId, toUserId);
    if (from.balance < amount) throw new Error('You do not have enough Glory to create that trade.');
    const id = `HT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const cleanNote = String(note || '').replace(/[\r\n]+/g, ' ').slice(0, 120);
    db.prepare(`INSERT INTO pending_trades (id, guild_id, from_user_id, to_user_id, amount, note, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, guildId, fromUserId, toUserId, amount, cleanNote || null, expiresAt);
    return { id, amount, note: cleanNote, expiresAt, currency: settings.currency_name };
  })();
}

function listPendingTrades(db, guildId, userId) {
  return db.prepare(`SELECT * FROM pending_trades
    WHERE guild_id = ? AND status = 'pending' AND expires_at > datetime('now') AND (from_user_id = ? OR to_user_id = ?)
    ORDER BY created_at DESC LIMIT 10`).all(guildId, userId, userId);
}

function resolveTrade(db, guildId, tradeId, actorUserId, accept) {
  return db.transaction(() => {
    const settings = getSettings(db, guildId);
    const trade = db.prepare('SELECT * FROM pending_trades WHERE id = ? AND guild_id = ?').get(tradeId, guildId);
    if (!trade) throw new Error('No trade found with that ID in this server.');
    if (trade.status !== 'pending') throw new Error(`That trade is already ${trade.status}.`);
    if (new Date(trade.expires_at).getTime() <= Date.now()) {
      db.prepare("UPDATE pending_trades SET status = 'expired', resolved_at = CURRENT_TIMESTAMP WHERE id = ?").run(tradeId);
      throw new Error('That trade has expired.');
    }
    if (accept && actorUserId !== trade.to_user_id) throw new Error('Only the receiving user can accept this trade.');
    if (!accept && ![trade.from_user_id, trade.to_user_id].includes(actorUserId)) throw new Error('Only users in this trade can decline it.');
    if (!accept) {
      db.prepare("UPDATE pending_trades SET status = 'declined', resolved_at = CURRENT_TIMESTAMP WHERE id = ?").run(tradeId);
      return { status: 'declined', trade, currency: settings.currency_name };
    }

    const from = ensureUser(db, guildId, trade.from_user_id);
    const to = ensureUser(db, guildId, trade.to_user_id);
    if (from.balance < trade.amount) throw new Error('The sender no longer has enough Glory for this trade.');
    const fee = Math.floor(trade.amount * settings.transfer_fee_bps / 10000);
    const received = trade.amount - fee;
    const fromAfter = from.balance - trade.amount;
    const toAfter = to.balance + received;

    db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(fromAfter, guildId, trade.from_user_id);
    db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(toAfter, guildId, trade.to_user_id);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, related_user_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, trade.from_user_id, -trade.amount, 'trade_sent', trade.to_user_id, fromAfter);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, related_user_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, trade.to_user_id, received, 'trade_received', trade.from_user_id, toAfter);
    db.prepare('INSERT INTO transfers (guild_id, from_user_id, to_user_id, amount, fee) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, trade.from_user_id, trade.to_user_id, trade.amount, fee);
    db.prepare("UPDATE pending_trades SET status = 'accepted', fee = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(fee, tradeId);
    return { status: 'accepted', trade, fee, received, fromAfter, toAfter, currency: settings.currency_name };
  })();
}


function vaultDeposit(db, guildId, userId, amount) {
  return db.transaction(() => {
    const settings = getSettings(db, guildId);
    const user = ensureUser(db, guildId, userId);
    assertPositiveAmount(amount, 1);
    if (user.balance < amount) throw new Error('You do not have enough wallet Glory to vault that amount.');
    const walletAfter = user.balance - amount;
    const bankAfter = Number(user.bank_balance || 0) + amount;
    db.prepare('UPDATE users SET balance = ?, bank_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(walletAfter, bankAfter, guildId, userId);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, balance_after) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, userId, 0, 'vault_deposit', walletAfter);
    return { amount, wallet: walletAfter, vault: bankAfter, netWorth: walletAfter + bankAfter, currency: settings.currency_name };
  })();
}

function vaultWithdraw(db, guildId, userId, amount) {
  return db.transaction(() => {
    const settings = getSettings(db, guildId);
    const user = ensureUser(db, guildId, userId);
    assertPositiveAmount(amount, 1);
    const currentVault = Number(user.bank_balance || 0);
    if (currentVault < amount) throw new Error('You do not have enough vaulted Glory to withdraw that amount.');
    const walletAfter = user.balance + amount;
    const bankAfter = currentVault - amount;
    db.prepare('UPDATE users SET balance = ?, bank_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(walletAfter, bankAfter, guildId, userId);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, balance_after) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, userId, 0, 'vault_withdraw', walletAfter);
    return { amount, wallet: walletAfter, vault: bankAfter, netWorth: walletAfter + bankAfter, currency: settings.currency_name };
  })();
}

function adminAdjustBalance(db, guildId, adminUserId, targetUserId, mode, amount, reason = '') {
  return db.transaction(() => {
    const settings = getSettings(db, guildId);
    const target = ensureUser(db, guildId, targetUserId);
    if (!['add', 'remove', 'set'].includes(mode)) throw new Error('Invalid admin balance mode.');
    if (!Number.isInteger(amount) || amount < 0) throw new Error('Amount must be 0 or higher.');
    let next = target.balance;
    if (mode === 'add') next += amount;
    if (mode === 'remove') next = Math.max(0, next - amount);
    if (mode === 'set') next = amount;
    const delta = next - target.balance;
    db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(next, guildId, targetUserId);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, balance_after) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, targetUserId, delta, `admin_${mode}`, next);
    db.prepare('INSERT INTO admin_logs (guild_id, admin_user_id, action, target_user_id, amount, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, adminUserId, `balance_${mode}`, targetUserId, amount, reason || null);
    return { oldBalance: target.balance, balance: next, delta, currency: settings.currency_name };
  })();
}

function updateGuildSetting(db, guildId, adminUserId, setting, value) {
  const allowed = {
    currency_name: { type: 'string' },
    daily_amount: { type: 'int', min: 0, max: 1000000 },
    max_bet_percent: { type: 'int', min: 1, max: 100 },
    transfer_fee_bps: { type: 'int', min: 0, max: 2500 },
    min_bet: { type: 'int', min: 1, max: 1000000 },
    max_bet_absolute: { type: 'int', min: 1, max: 100000000 },
    lotto_ticket_cost: { type: 'int', min: 1, max: 1000000 },
    gambling_enabled: { type: 'bool' },
    transfers_enabled: { type: 'bool' },
    big_win_enabled: { type: 'bool' },
    big_win_threshold: { type: 'int', min: 1, max: 1000000000 }
  };
  if (!allowed[setting]) throw new Error('Unsupported setting.');
  return db.transaction(() => {
    getSettings(db, guildId);
    const cfg = allowed[setting];
    let finalValue = value;
    if (cfg.type === 'int') {
      finalValue = Number(value);
      if (!Number.isInteger(finalValue) || finalValue < cfg.min || finalValue > cfg.max) {
        throw new Error(`Value must be an integer between ${cfg.min} and ${cfg.max}.`);
      }
    } else if (cfg.type === 'bool') {
      const lowered = String(value || '').trim().toLowerCase();
      if (!['true', 'false', 'on', 'off', '1', '0', 'yes', 'no', 'enabled', 'disabled'].includes(lowered)) {
        throw new Error('Boolean settings must be true/false, on/off, yes/no, or 1/0.');
      }
      finalValue = ['true', 'on', '1', 'yes', 'enabled'].includes(lowered) ? 1 : 0;
    } else {
      finalValue = String(value || '').trim().slice(0, 24);
      if (!finalValue) throw new Error('Currency name cannot be empty.');
    }
    db.prepare(`UPDATE guild_settings SET ${setting} = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`).run(finalValue, guildId);
    db.prepare('INSERT INTO admin_logs (guild_id, admin_user_id, action, details) VALUES (?, ?, ?, ?)')
      .run(guildId, adminUserId, 'setting_update', JSON.stringify({ setting, value: finalValue }));
    return getSettings(db, guildId);
  })();
}

module.exports = {
  getUser,
  formatGlory,
  maxBetFor,
  titleForUser,
  claimDaily,
  claimWork,
  transfer,
  createTrade,
  listPendingTrades,
  resolveTrade,
  applyGame,
  adminAdjustBalance,
  updateGuildSetting,
  vaultDeposit,
  vaultWithdraw
};
