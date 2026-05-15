'use strict';

const COIN_FRAMES = ['🪙', '🔄', '🌀', '🔄', '🪙'];

function coinflipAnimationEnabled(env = process.env) {
  const raw = String(env.HASHGOBLIN_ANIMATED_COINFLIP || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function normaliseSide(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('heads')) return 'heads';
  if (raw.includes('tails')) return 'tails';
  return raw || 'unknown';
}

function coinEmoji(side) {
  const normalised = normaliseSide(side);
  if (normalised === 'heads') return '🟡';
  if (normalised === 'tails') return '⚫';
  return '🪙';
}

function buildCoinflipFrames(result = {}) {
  const finalSide = normaliseSide(result.side || result.result);
  const pickedSide = normaliseSide(result.picked || result.choice);
  const won = pickedSide && finalSide && pickedSide === finalSide;

  const frames = COIN_FRAMES.map((coin, index) => ({
    coin,
    status: index < COIN_FRAMES.length - 1 ? 'Flipping...' : 'Almost there...',
    final: false
  }));

  frames.push({
    coin: coinEmoji(finalSide),
    status: `Landed on ${finalSide || 'unknown'}`,
    final: true,
    finalSide,
    pickedSide,
    won
  });

  return frames;
}

function buildCoinflipSpinEmbed({ baseEmbed, frame, frameIndex, frameCount, result = {} }) {
  const embed = baseEmbed('🪙 Coinflip');
  const progress = `${Math.min(frameIndex + 1, frameCount)}/${frameCount}`;
  const picked = normaliseSide(result.picked || result.choice);

  embed
    .setDescription(`${frame.coin} **${frame.status}**`)
    .addFields(
      { name: 'Animation', value: progress, inline: true },
      { name: 'You picked', value: picked || 'unknown', inline: true },
      { name: 'Proof', value: 'Result is already calculated. This is just the visual reveal.', inline: false }
    );

  if (frame.final) {
    embed.addFields(
      { name: 'Landing', value: frame.finalSide || 'unknown', inline: true },
      { name: 'Outcome', value: frame.won ? 'Hit' : 'Miss', inline: true }
    );
  }

  return embed;
}

module.exports = {
  coinflipAnimationEnabled,
  normaliseSide,
  buildCoinflipFrames,
  buildCoinflipSpinEmbed
};
