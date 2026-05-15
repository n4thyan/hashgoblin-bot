'use strict';

const DEFAULT_DELAY_MS = 650;
const DEFAULT_UNKNOWN_SYMBOL = '❔';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function boolFromEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function animatedSlotsEnabled(env = process.env) {
  return boolFromEnv(env.HASHGOBLIN_ANIMATED_SLOTS, false);
}

function normaliseSlotReels(result) {
  const reels = result && result.details && Array.isArray(result.details.reels)
    ? result.details.reels
    : [];

  return reels.map(reel => {
    if (typeof reel === 'string') return reel;
    if (reel && typeof reel.emoji === 'string') return reel.emoji;
    if (reel && typeof reel.symbol === 'string') return reel.symbol;
    return String(reel || '?');
  });
}

function buildSlotRevealFrames(result, options = {}) {
  const unknown = options.unknownSymbol || DEFAULT_UNKNOWN_SYMBOL;
  const reels = normaliseSlotReels(result);
  const reelCount = Number(options.reelCount || Math.max(3, reels.length || 3));
  const padded = Array.from({ length: reelCount }, (_, i) => reels[i] || unknown);
  const frames = [];

  frames.push(Array.from({ length: reelCount }, () => unknown));

  for (let i = 0; i < reelCount; i += 1) {
    frames.push(padded.map((symbol, idx) => (idx <= i ? symbol : unknown)));
  }

  return frames;
}

function frameToReelLine(frame) {
  return frame.map(symbol => `[ ${symbol} ]`).join(' ');
}

function buildSlotSpinEmbed({ baseEmbed, frame, frameIndex, frameCount, result }) {
  const multiplier = result && result.details ? result.details.multiplier : undefined;
  const embed = baseEmbed('🎰 SHA Slots')
    .setDescription('Spinning the reels...')
    .addFields(
      { name: 'Reels', value: frameToReelLine(frame), inline: false },
      { name: 'Status', value: `${frameIndex + 1}/${frameCount}`, inline: true }
    );

  if (multiplier !== undefined) {
    embed.addFields({ name: 'Multiplier', value: frameIndex === frameCount - 1 ? `${multiplier}x` : 'Hidden until the reels stop', inline: true });
  }

  embed.addFields({ name: 'Proof', value: 'Result already calculated. This animation only reveals it.', inline: false });
  return embed;
}

async function replyWithAnimatedSlots({ interaction, baseEmbed, finalEmbed, result, enabled = animatedSlotsEnabled(), delayMs = DEFAULT_DELAY_MS }) {
  if (!enabled) {
    return interaction.reply({ embeds: [finalEmbed] });
  }

  const frames = buildSlotRevealFrames(result);
  const frameCount = frames.length;
  await interaction.reply({
    embeds: [buildSlotSpinEmbed({ baseEmbed, frame: frames[0], frameIndex: 0, frameCount, result })]
  });

  for (let i = 1; i < frames.length; i += 1) {
    await wait(delayMs);
    await interaction.editReply({
      embeds: [buildSlotSpinEmbed({ baseEmbed, frame: frames[i], frameIndex: i, frameCount, result })]
    });
  }

  await wait(delayMs);
  return interaction.editReply({ embeds: [finalEmbed] });
}

module.exports = {
  DEFAULT_DELAY_MS,
  DEFAULT_UNKNOWN_SYMBOL,
  animatedSlotsEnabled,
  boolFromEnv,
  buildSlotRevealFrames,
  buildSlotSpinEmbed,
  frameToReelLine,
  normaliseSlotReels,
  replyWithAnimatedSlots,
  wait
};
