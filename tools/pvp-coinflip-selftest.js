'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { openDatabase } = require('../src/lib/db');
const {
  createPvpCoinflipChallenge,
  acceptPvpCoinflipChallenge,
  declinePvpCoinflipChallenge,
  getPvpCoinflipChallenge,
  sideFromHash
} = require('../src/lib/pvpCoinflip');
const { verifyStoredGame } = require('../src/lib/proof');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashgoblin-pvp-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
const db = openDatabase(dbPath);

try {
  const guildId = 'guild-test';
  const challenger = 'user-a';
  const opponent = 'user-b';

  const challenge = createPvpCoinflipChallenge(db, {
    guildId,
    channelId: 'channel-test',
    challengerId: challenger,
    opponentId: opponent,
    amount: 100,
    side: 'heads'
  });

  assert(challenge.id.startsWith('HCVS-'));
  assert.strictEqual(challenge.challengerSide, 'heads');
  assert.strictEqual(challenge.opponentSide, 'tails');

  const locked = db.prepare('SELECT balance FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, challenger);
  assert.strictEqual(locked.balance, 900);

  const accepted = acceptPvpCoinflipChallenge(db, guildId, challenge.id, opponent);
  assert.strictEqual(accepted.status, 'accepted');
  assert(['heads', 'tails'].includes(accepted.result.side));
  assert.strictEqual(accepted.result.pot, 200);

  const storedGame = db.prepare('SELECT * FROM games WHERE id = ? AND guild_id = ?').get(challenge.gameId, guildId);
  assert(storedGame);
  assert.strictEqual(storedGame.game_type, 'coinflipvs');
  const verified = verifyStoredGame(storedGame);
  assert(verified.seedHashOk);
  assert(verified.resultHashOk);

  const details = JSON.parse(storedGame.result_json);
  assert.strictEqual(details.challengeId, challenge.id);
  assert.strictEqual(details.resultSide, sideFromHash(storedGame.result_hash).side);
  assert.strictEqual(details.pot, 200);

  const challengerAfter = db.prepare('SELECT balance, lifetime_bet FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, challenger);
  const opponentAfter = db.prepare('SELECT balance, lifetime_bet FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, opponent);
  assert.strictEqual(challengerAfter.balance + opponentAfter.balance, 2000);
  assert.strictEqual(challengerAfter.lifetime_bet, 100);
  assert.strictEqual(opponentAfter.lifetime_bet, 100);

  const second = createPvpCoinflipChallenge(db, {
    guildId,
    channelId: 'channel-test',
    challengerId: challenger,
    opponentId: opponent,
    amount: 50,
    side: 'tails'
  });
  const declined = declinePvpCoinflipChallenge(db, guildId, second.id, opponent);
  assert.strictEqual(declined.status, 'declined');
  assert.strictEqual(getPvpCoinflipChallenge(db, guildId, second.id).status, 'declined');

  console.log('PvP coinflip selftest passed.');
} finally {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
