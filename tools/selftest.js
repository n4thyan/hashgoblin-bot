'use strict';

const assert = require('assert');
const {
  sha256,
  createProofContext,
  uniformIntFromHash,
  verifyStoredGame,
  leadingHexZeroes
} = require('../src/lib/proof');
const {
  playCoinflip,
  playWheel,
  playSlots,
  slotExpectedReturn,
  parseLottoNumbers,
  playLotto,
  lottoExpectedReturn,
  LOTTO_TOTAL_COMBOS
} = require('../src/lib/games');

assert.strictEqual(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

for (let i = 0; i < 100; i++) {
  const n = uniformIntFromHash(sha256(`test-${i}`), 100000, 'selftest');
  assert(Number.isInteger(n) && n >= 0 && n < 100000);
}

const proof = createProofContext({ guildId: 'g1', userId: 'u1', gameType: 'coinflip', gameId: 'HG-TEST', nonce: 123 });
const stored = {
  server_seed: proof.serverSeed,
  server_seed_hash: proof.serverSeedHash,
  client_seed: proof.clientSeed,
  nonce: proof.nonce,
  result_hash: proof.resultHash
};
const verified = verifyStoredGame(stored);
assert(verified.seedHashOk);
assert(verified.resultHashOk);

const cf = playCoinflip(proof.resultHash, 'heads', 100);
assert(['heads', 'tails'].includes(cf.result));
assert([0, 195].includes(cf.payout));
assert.strictEqual(cf.oddsText, '50%');

const wheel = playWheel(proof.resultHash, 100);
assert(wheel.roll >= 0 && wheel.roll <= 99999);
assert(wheel.payout >= 0);

const slots = playSlots(proof.resultHash, 100);
assert(slots.details.reels.length === 3);
assert(slots.payout >= 0);
assert(slotExpectedReturn() > 0.85 && slotExpectedReturn() < 0.95);

assert.deepStrictEqual(parseLottoNumbers('4 12 19 31 44 48'), [4, 12, 19, 31, 44, 48]);
assert.throws(() => parseLottoNumbers('1 1 2 3 4 5'));
const lotto = playLotto(proof.resultHash, [4, 12, 19, 31, 44, 48]);
assert(lotto.details.ticket.length === 6);
assert(lotto.details.draw.length === 6);
assert(Number(LOTTO_TOTAL_COMBOS) === 13983816);
assert(lottoExpectedReturn() > 45 && lottoExpectedReturn() < 55);

assert.strictEqual(leadingHexZeroes('000abc'), 3);
console.log('HashGoblin selftest passed.');
