'use strict';

const assert = require('node:assert/strict');
const {
  animatedSlotsEnabled,
  boolFromEnv,
  buildSlotRevealFrames,
  frameToReelLine,
  normaliseSlotReels
} = require('../src/lib/slotAnimation');

const sampleResult = {
  details: {
    reels: [
      { emoji: '🍒', symbol: 'cherry' },
      { emoji: '🍋', symbol: 'lemon' },
      { emoji: '💎', symbol: 'gem' }
    ],
    multiplier: 2
  }
};

assert.equal(boolFromEnv(undefined, true), true);
assert.equal(boolFromEnv('true'), true);
assert.equal(boolFromEnv('1'), true);
assert.equal(boolFromEnv('yes'), true);
assert.equal(boolFromEnv('on'), true);
assert.equal(boolFromEnv('false'), false);
assert.equal(boolFromEnv('0'), false);
assert.equal(animatedSlotsEnabled({ HASHGOBLIN_ANIMATED_SLOTS: 'true' }), true);
assert.equal(animatedSlotsEnabled({ HASHGOBLIN_ANIMATED_SLOTS: 'false' }), false);

assert.deepEqual(normaliseSlotReels(sampleResult), ['🍒', '🍋', '💎']);
assert.deepEqual(normaliseSlotReels({ details: { reels: ['A', 'B', 'C'] } }), ['A', 'B', 'C']);

const frames = buildSlotRevealFrames(sampleResult, { unknownSymbol: '?' });
assert.deepEqual(frames, [
  ['?', '?', '?'],
  ['🍒', '?', '?'],
  ['🍒', '🍋', '?'],
  ['🍒', '🍋', '💎']
]);

assert.equal(frameToReelLine(frames[0]), '[ ? ] [ ? ] [ ? ]');
assert.equal(frameToReelLine(frames[3]), '[ 🍒 ] [ 🍋 ] [ 💎 ]');

const paddedFrames = buildSlotRevealFrames({ details: { reels: [{ emoji: '7️⃣' }] } }, { unknownSymbol: '?' });
assert.deepEqual(paddedFrames[paddedFrames.length - 1], ['7️⃣', '?', '?']);

console.log('Slot animation selftest passed.');
