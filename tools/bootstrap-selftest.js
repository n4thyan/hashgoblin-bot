'use strict';

const { EmbedBuilder } = require('discord.js');
const { buildSlotRevealFrames } = require('../src/lib/slotAnimation');

const finalEmbed = new EmbedBuilder()
  .setTitle('🎰 SHA Slots')
  .addFields(
    { name: 'Reels', value: '🍒 🍋 💎', inline: true },
    { name: 'Multiplier', value: '2x', inline: true }
  );

const data = finalEmbed.toJSON();
if (data.title !== '🎰 SHA Slots') throw new Error('Final slot title changed.');
const reelsField = data.fields.find(f => f.name === 'Reels');
if (!reelsField || !reelsField.value.includes('🍒')) throw new Error('Could not read reels from embed fixture.');

const frames = buildSlotRevealFrames({ details: { reels: ['🍒', '🍋', '💎'], multiplier: 2 } });
if (frames.length !== 4) throw new Error('Unexpected slot frame count.');
if (frames[frames.length - 1].join(' ') !== '🍒 🍋 💎') throw new Error('Final slot frame did not reveal expected reels.');

console.log('Bootstrap wrapper selftest passed.');
