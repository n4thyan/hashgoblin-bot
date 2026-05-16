'use strict';

const crypto = require('crypto');
const { ensureUser, getSettings } = require('./db');
const { maxBetFor } = require('./economy');
const { createProofContext, uniformIntFromHash } = require('./proof');

const DEFAULT_TTL_MS = 2 * 60 * 1000;
const CHALLENGE_PREFIX = 'HCVS';

function pvpCoinflipEnabled(env = process.env) {
  const raw = String(env.HASHGOBLIN_VS_COINFLIP || 'true').trim().toLowerCase();
  return !['0', 'false', 'off', 'no', 'disabled'].includes(raw);
}

function normalisePvpSide(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'h' || raw === 'head' || raw === 'heads') return 'heads';
  if (raw === 't' || raw === 'tail' || raw === 'tails') return 'tails';
  throw new Error('Pick heads or tails.');
}

function oppositeSide(side) {
  return normalisePvpSide(side) === 'heads' ? 'tails' : 'heads';
}

function makeChallengeId() {
  return `${CHALLENGE_PREFIX}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function makeGameId() {
  return `HG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function ensurePvpCoinflipSchema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS pending_coinflip_challenges (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT,
  challenger_user_id TEXT NOT NULL,
  opponent_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  challenger_side TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  game_id TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  server_seed TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  result_hash TEXT NOT NULL,
  result_side TEXT,
  winner_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  resolved_at TEXT
);
  `);
}

function assertPositiveAmount(amount, min) {
  if (!Number.isInteger(amount) || amount < min) {
    throw new Error(`Amount must be at least ${min}.`);
  }
}

function assertPvpAllowed(settings) {
  if (!pvpCoinflipEnabled()) throw new Error('PvP coinflip is disabled in this bot config.');
  if (!Number(settings.gambling_enabled)) throw new Error('Gambling commands are disabled on this server.');
}

function sideFromHash(resultHash) {
  const roll = uniformIntFromHash(resultHash, 10000, 'coinflipvs');
  return { roll, side: roll < 5000 ? 'heads' : 'tails' };
}

function serialiseChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    challengerId: row.challenger_user_id,
    opponentId: row.opponent_user_id,
    amount: row.amount,
    challengerSide: row.challenger_side,
    opponentSide: oppositeSide(row.challenger_side),
    status: row.status,
    gameId: row.game_id,
    serverSeedHash: row.server_seed_hash,
    serverSeed: row.server_seed,
    clientSeed: row.client_seed,
    nonce: row.nonce,
    resultHash: row.result_hash,
    resultSide: row.result_side,
    winnerId: row.winner_user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at
  };
}

function getPvpCoinflipChallenge(db, guildId, challengeId) {
  ensurePvpCoinflipSchema(db);
  const row = db.prepare('SELECT * FROM pending_coinflip_challenges WHERE id = ? AND guild_id = ?').get(challengeId, guildId);
  return serialiseChallenge(row);
}

function refundLockedStake(db, row, reason) {
  const user = ensureUser(db, row.guild_id, row.challenger_user_id);
  const balanceAfter = user.balance + row.amount;
  db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
    .run(balanceAfter, row.guild_id, row.challenger_user_id);
  db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, game_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
    .run(row.guild_id, row.challenger_user_id, row.amount, reason, row.game_id, balanceAfter);
  return balanceAfter;
}

function expirePvpCoinflipChallenge(db, row) {
  const balanceAfter = refundLockedStake(db, row, 'coinflipvs_refund');
  db.prepare("UPDATE pending_coinflip_challenges SET status = 'expired', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
    .run(row.id);
  return { status: 'expired', challenge: serialiseChallenge({ ...row, status: 'expired' }), challengerBalance: balanceAfter };
}

function createPvpCoinflipChallenge(db, { guildId, channelId, challengerId, opponentId, amount, side }) {
  ensurePvpCoinflipSchema(db);
  const challengerSide = normalisePvpSide(side);
  if (challengerId === opponentId) throw new Error('You cannot challenge yourself.');

  return db.transaction(() => {
    const settings = getSettings(db, guildId);
    assertPvpAllowed(settings);
    assertPositiveAmount(amount, settings.min_bet);

    const challenger = ensureUser(db, guildId, challengerId);
    ensureUser(db, guildId, opponentId);
    const maxBet = maxBetFor(challenger, settings);
    if (amount > maxBet) throw new Error(`Max bet for your balance is ${amount.toLocaleString('en-GB')} / ${maxBet.toLocaleString('en-GB')} ${settings.currency_name}.`);
    if (challenger.balance < amount) throw new Error('You do not have enough Glory for that challenge.');

    const id = makeChallengeId();
    const gameId = makeGameId();
    const proof = createProofContext({
      guildId,
      userId: `${challengerId}:vs:${opponentId}`,
      gameType: 'coinflipvs',
      gameId,
      nonce: 0
    });
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS).toISOString();
    const afterLock = challenger.balance - amount;

    db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(afterLock, guildId, challengerId);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, game_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, challengerId, -amount, 'coinflipvs_stake_locked', gameId, afterLock);

    db.prepare(`INSERT INTO pending_coinflip_challenges
      (id, guild_id, channel_id, challenger_user_id, opponent_user_id, amount, challenger_side, game_id, server_seed_hash, server_seed, client_seed, nonce, result_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id,
        guildId,
        channelId || null,
        challengerId,
        opponentId,
        amount,
        challengerSide,
        gameId,
        proof.serverSeedHash,
        proof.serverSeed,
        proof.clientSeed,
        proof.nonce,
        proof.resultHash,
        expiresAt
      );

    return {
      id,
      gameId,
      guildId,
      channelId,
      challengerId,
      opponentId,
      amount,
      challengerSide,
      opponentSide: oppositeSide(challengerSide),
      expiresAt,
      challengerBalance: afterLock,
      currency: settings.currency_name
    };
  })();
}

function declinePvpCoinflipChallenge(db, guildId, challengeId, actorUserId) {
  ensurePvpCoinflipSchema(db);
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM pending_coinflip_challenges WHERE id = ? AND guild_id = ?').get(challengeId, guildId);
    if (!row) throw new Error('No PvP coinflip challenge found.');
    if (row.status !== 'pending') return { status: row.status, challenge: serialiseChallenge(row) };
    if (![row.challenger_user_id, row.opponent_user_id].includes(actorUserId)) {
      throw new Error('Only the challenger or the challenged user can cancel this.');
    }
    const balanceAfter = refundLockedStake(db, row, 'coinflipvs_refund');
    db.prepare("UPDATE pending_coinflip_challenges SET status = 'declined', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
      .run(challengeId);
    return { status: 'declined', challenge: serialiseChallenge({ ...row, status: 'declined' }), challengerBalance: balanceAfter };
  })();
}

function acceptPvpCoinflipChallenge(db, guildId, challengeId, actorUserId) {
  ensurePvpCoinflipSchema(db);
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM pending_coinflip_challenges WHERE id = ? AND guild_id = ?').get(challengeId, guildId);
    if (!row) throw new Error('No PvP coinflip challenge found.');
    if (row.status !== 'pending') return { status: row.status, challenge: serialiseChallenge(row) };
    if (actorUserId !== row.opponent_user_id) throw new Error('Only the challenged user can accept this coinflip.');
    if (Date.parse(row.expires_at) <= Date.now()) return expirePvpCoinflipChallenge(db, row);

    const settings = getSettings(db, guildId);
    assertPvpAllowed(settings);
    const opponent = ensureUser(db, guildId, row.opponent_user_id);
    const challenger = ensureUser(db, guildId, row.challenger_user_id);
    const maxBet = maxBetFor(opponent, settings);
    if (row.amount > maxBet) throw new Error(`Max bet for your balance is ${maxBet.toLocaleString('en-GB')} ${settings.currency_name}.`);
    if (opponent.balance < row.amount) throw new Error('You do not have enough Glory to accept this challenge.');

    const spin = sideFromHash(row.result_hash);
    const challengerWon = spin.side === row.challenger_side;
    const winnerId = challengerWon ? row.challenger_user_id : row.opponent_user_id;
    const loserId = challengerWon ? row.opponent_user_id : row.challenger_user_id;
    const pot = row.amount * 2;
    const challengerWinAmount = challengerWon ? row.amount : 0;
    const opponentWinAmount = challengerWon ? 0 : row.amount;
    const challengerLossAmount = challengerWon ? 0 : row.amount;
    const opponentLossAmount = challengerWon ? row.amount : 0;
    const opponentAfterStake = opponent.balance - row.amount;
    const challengerAfter = challenger.balance + (challengerWon ? pot : 0);
    const opponentAfter = opponentAfterStake + (challengerWon ? 0 : pot);

    db.prepare(`UPDATE users SET
      balance = ?,
      lifetime_won = lifetime_won + ?,
      lifetime_lost = lifetime_lost + ?,
      lifetime_bet = lifetime_bet + ?,
      biggest_win = MAX(biggest_win, ?),
      updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND user_id = ?`)
      .run(challengerAfter, challengerWinAmount, challengerLossAmount, row.amount, challengerWinAmount, guildId, row.challenger_user_id);

    db.prepare(`UPDATE users SET
      balance = ?,
      lifetime_won = lifetime_won + ?,
      lifetime_lost = lifetime_lost + ?,
      lifetime_bet = lifetime_bet + ?,
      biggest_win = MAX(biggest_win, ?),
      updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND user_id = ?`)
      .run(opponentAfter, opponentWinAmount, opponentLossAmount, row.amount, opponentWinAmount, guildId, row.opponent_user_id);

    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, game_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, row.opponent_user_id, -row.amount, 'coinflipvs_stake', row.game_id, opponentAfterStake);

    if (challengerWon) {
      db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, game_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, row.challenger_user_id, pot, 'coinflipvs_payout', row.game_id, challengerAfter);
    } else {
      db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, game_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, row.opponent_user_id, pot, 'coinflipvs_payout', row.game_id, opponentAfter);
    }

    db.prepare(`INSERT INTO games
      (id, guild_id, user_id, game_type, bet_amount, payout_amount, profit, server_seed_hash, server_seed, client_seed, nonce, result_hash, roll, odds_text, edge_text, result_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        row.game_id,
        guildId,
        row.challenger_user_id,
        'coinflipvs',
        row.amount,
        challengerWon ? pot : 0,
        challengerWon ? row.amount : -row.amount,
        row.server_seed_hash,
        row.server_seed,
        row.client_seed,
        row.nonce,
        row.result_hash,
        spin.roll,
        '50%',
        '0%',
        JSON.stringify({
          challengeId: row.id,
          challengerId: row.challenger_user_id,
          opponentId: row.opponent_user_id,
          challengerSide: row.challenger_side,
          opponentSide: oppositeSide(row.challenger_side),
          resultSide: spin.side,
          winnerId,
          loserId,
          pot,
          payoutMultiplier: 2
        })
      );

    db.prepare("UPDATE pending_coinflip_challenges SET status = 'accepted', result_side = ?, winner_user_id = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(spin.side, winnerId, row.id);

    return {
      status: 'accepted',
      challenge: serialiseChallenge({ ...row, status: 'accepted', result_side: spin.side, winner_user_id: winnerId }),
      result: {
        roll: spin.roll,
        side: spin.side,
        challengerWon,
        winnerId,
        loserId,
        pot
      },
      challengerBalance: challengerAfter,
      opponentBalance: opponentAfter,
      currency: settings.currency_name
    };
  })();
}

module.exports = {
  ensurePvpCoinflipSchema,
  pvpCoinflipEnabled,
  normalisePvpSide,
  oppositeSide,
  sideFromHash,
  getPvpCoinflipChallenge,
  createPvpCoinflipChallenge,
  acceptPvpCoinflipChallenge,
  declinePvpCoinflipChallenge
};
