'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hashgoblin-v1-'));
process.env.HASHGOBLIN_DB = path.join(tmp, 'smoke.sqlite');
process.env.HASHGOBLIN_DEFAULT_CURRENCY = 'Glory';

const { openDatabase, getSettings } = require('../src/lib/db');
const { createProofContext, verifyStoredGame } = require('../src/lib/proof');
const { getUser, claimWork, transfer, applyGame, vaultDeposit, vaultWithdraw } = require('../src/lib/economy');
const { playCoinflip, playWheel, playSlots, playLotto, playHashJackpot, parseLottoNumbers } = require('../src/lib/games');
const { getLottoPool } = require('../src/lib/jackpot');
const { updateGreeting, updateMemberRole } = require('../src/lib/community');

const db = openDatabase();
const guildId = 'guild-smoke';
const userA = 'user-a';
const userB = 'user-b';
const settings = getSettings(db, guildId);
assert.strictEqual(settings.currency_name, 'Glory');

const a = getUser(db, guildId, userA);
const b = getUser(db, guildId, userB);
assert.strictEqual(a.balance, 1000);
assert.strictEqual(b.balance, 1000);

claimWork(db, guildId, userA);
const afterWork = getUser(db, guildId, userA);
assert(afterWork.balance > 1000, 'work should add Glory');

const sent = transfer(db, guildId, userA, userB, 100);
assert.strictEqual(sent.received, 98);

const vault = vaultDeposit(db, guildId, userB, 50);
assert.strictEqual(vault.vault, 50);
const unvault = vaultWithdraw(db, guildId, userB, 25);
assert.strictEqual(unvault.vault, 25);

function proofRecord(gameType, betAmount) {
  const id = `HG-SMOKE-${gameType}`;
  const proof = createProofContext({ guildId, userId: userA, gameType, gameId: id, nonce: 12345 });
  return {
    id,
    betAmount,
    serverSeed: proof.serverSeed,
    serverSeedHash: proof.serverSeedHash,
    clientSeed: proof.clientSeed,
    nonce: proof.nonce,
    resultHash: proof.resultHash
  };
}

for (const [type, fn] of [
  ['coinflip', hash => playCoinflip(hash, 'heads', 10)],
  ['wheelspin', hash => playWheel(hash, 10)],
  ['slots', hash => playSlots(hash, 10)],
  ['hashjackpot', hash => playHashJackpot(hash, 10)]
]) {
  const rec = proofRecord(type, 10);
  const result = fn(rec.resultHash);
  result.gameType = type;
  applyGame(db, guildId, userA, rec, result);
  const stored = db.prepare('SELECT * FROM games WHERE id = ?').get(rec.id);
  const verified = verifyStoredGame(stored);
  assert(verified.seedHashOk && verified.resultHashOk, `${type} proof should verify`);
}

const lottoRec = proofRecord('lotto', 100);
const lotto = playLotto(lottoRec.resultHash, parseLottoNumbers('1 2 3 4 5 6'));
lotto.gameType = 'lotto';
applyGame(db, guildId, userA, lottoRec, lotto);
assert(getLottoPool(db, guildId).amount >= 100000, 'lotto pool should exist');

const nextGreeting = updateGreeting(db, guildId, 'admin', 'welcome', { enabled: true, channelId: '123', message: 'Welcome {user} to {server}' });
assert.strictEqual(Number(nextGreeting.welcome_enabled), 1);
const nextRole = updateMemberRole(db, guildId, 'admin', { enabled: true, roleId: 'role-member' });
assert.strictEqual(Number(nextRole.member_role_enabled), 1);
assert.strictEqual(nextRole.member_role_id, 'role-member');

const ledgerRows = db.prepare('SELECT COUNT(*) AS c FROM ledger').get().c;
const gameRows = db.prepare('SELECT COUNT(*) AS c FROM games').get().c;
assert(ledgerRows > 0, 'ledger should have rows');
assert(gameRows >= 5, 'games should have rows');

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('HashGoblin smoke test passed.');
