'use strict';

const crypto = require('crypto');

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function canonicalPayload({ serverSeed, clientSeed, nonce }) {
  return `hashgoblin:v1|server=${serverSeed}|client=${clientSeed}|nonce=${nonce}`;
}

function createProofContext({ guildId, userId, gameType, gameId, nonce = 0 }) {
  const serverSeed = randomHex(32);
  const serverSeedHash = sha256(serverSeed);
  const clientSeed = `guild:${guildId}|user:${userId}|game:${gameType}|id:${gameId}`;
  const resultHash = sha256(canonicalPayload({ serverSeed, clientSeed, nonce }));
  return { serverSeed, serverSeedHash, clientSeed, nonce, resultHash };
}

// Deterministic uniform integer in [0, maxExclusive). Uses rejection sampling over
// 52-bit chunks so modulo bias is avoided for displayable game rolls.
function uniformIntFromHash(hash, maxExclusive, salt = '') {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('maxExclusive must be a positive safe integer');
  }
  const base = `${hash}|${salt}`;
  const space = 2 ** 52;
  const limit = Math.floor(space / maxExclusive) * maxExclusive;
  let stream = sha256(base);
  let counter = 0;
  while (true) {
    for (let i = 0; i + 13 <= stream.length; i += 13) {
      const chunk = parseInt(stream.slice(i, i + 13), 16);
      if (chunk < limit) return chunk % maxExclusive;
    }
    counter += 1;
    stream = sha256(`${base}|retry:${counter}`);
  }
}

function leadingHexZeroes(hash) {
  const match = String(hash).match(/^0*/);
  return match ? match[0].length : 0;
}

function leadingZeroBits(hash) {
  let bits = 0;
  for (const ch of String(hash)) {
    const n = parseInt(ch, 16);
    if (n === 0) {
      bits += 4;
      continue;
    }
    for (let i = 3; i >= 0; i--) {
      if ((n & (1 << i)) === 0) bits += 1;
      else return bits;
    }
  }
  return bits;
}

function verifyStoredGame(game) {
  const expectedSeedHash = sha256(game.server_seed);
  const expectedResultHash = sha256(canonicalPayload({
    serverSeed: game.server_seed,
    clientSeed: game.client_seed,
    nonce: game.nonce
  }));
  return {
    seedHashOk: expectedSeedHash === game.server_seed_hash,
    resultHashOk: expectedResultHash === game.result_hash,
    expectedSeedHash,
    expectedResultHash
  };
}

module.exports = {
  sha256,
  randomHex,
  canonicalPayload,
  createProofContext,
  uniformIntFromHash,
  leadingHexZeroes,
  leadingZeroBits,
  verifyStoredGame
};
