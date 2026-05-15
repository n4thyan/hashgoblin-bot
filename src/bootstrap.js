'use strict';

// Keep src/index.js stable and wrap Discord interactions before the bot registers handlers.
// This lets animated slots be switched on with an env flag without changing game maths,
// proof creation, economy updates or the normal command flow.
require('dotenv').config();

const discord = require('discord.js');
const {
  animatedSlotsEnabled,
  buildSlotRevealFrames,
  buildSlotSpinEmbed,
  wait
} = require('./lib/slotAnimation');

const SLOT_TITLE = '🎰 SHA Slots';
const SLOT_ANIMATION_PATCHED = Symbol.for('hashgoblin.slotAnimationPatched');

function slotAnimationDelayMs(env = process.env) {
  const raw = Number(env.HASHGOBLIN_SLOT_ANIMATION_DELAY_MS || 650);
  if (!Number.isFinite(raw)) return 650;
  return Math.max(300, Math.min(2500, Math.floor(raw)));
}

function embedToData(embed) {
  if (!embed) return {};
  if (typeof embed.toJSON === 'function') return embed.toJSON();
  if (embed.data && typeof embed.data === 'object') return embed.data;
  return embed;
}

function findEmbedField(embed, fieldName) {
  const data = embedToData(embed);
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const wanted = String(fieldName).toLowerCase();
  return fields.find(field => String(field.name || '').toLowerCase() === wanted);
}

function parseReelsFromFinalEmbed(finalEmbed) {
  const reelsField = findEmbedField(finalEmbed, 'Reels');
  const raw = reelsField ? String(reelsField.value || '') : '';
  return raw
    .replace(/[\[\]]/g, ' ')
    .split(/\s+/g)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map(emoji => ({ emoji }));
}

function parseMultiplierFromFinalEmbed(finalEmbed) {
  const multiplierField = findEmbedField(finalEmbed, 'Multiplier');
  if (!multiplierField) return undefined;
  const match = String(multiplierField.value || '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

function resultFromFinalSlotEmbed(finalEmbed) {
  return {
    details: {
      reels: parseReelsFromFinalEmbed(finalEmbed),
      multiplier: parseMultiplierFromFinalEmbed(finalEmbed)
    }
  };
}

function makeBaseEmbed(title) {
  return new discord.EmbedBuilder()
    .setTitle(title)
    .setColor(0x70ff9e)
    .setFooter({ text: 'HashGoblin • Glory has no real-world value • Every game has a SHA-256 receipt' })
    .setTimestamp(new Date());
}

function isSlotFinalReply(interaction, payload) {
  if (!interaction || typeof interaction.isChatInputCommand !== 'function' || !interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== 'slots') return false;
  if (!payload || !Array.isArray(payload.embeds) || payload.embeds.length !== 1) return false;
  const data = embedToData(payload.embeds[0]);
  return String(data.title || '') === SLOT_TITLE;
}

function patchSlotInteraction(interaction) {
  if (!interaction || interaction[SLOT_ANIMATION_PATCHED]) return;
  interaction[SLOT_ANIMATION_PATCHED] = true;

  const originalReply = interaction.reply.bind(interaction);
  const originalEditReply = interaction.editReply ? interaction.editReply.bind(interaction) : null;
  let handledAnimatedSlot = false;

  interaction.reply = async function patchedReply(payload) {
    if (handledAnimatedSlot || !animatedSlotsEnabled() || !isSlotFinalReply(interaction, payload)) {
      return originalReply(payload);
    }

    handledAnimatedSlot = true;
    const finalEmbed = payload.embeds[0];
    const result = resultFromFinalSlotEmbed(finalEmbed);
    const frames = buildSlotRevealFrames(result);
    const delayMs = slotAnimationDelayMs();

    try {
      await originalReply({
        ...payload,
        embeds: [buildSlotSpinEmbed({
          baseEmbed: makeBaseEmbed,
          frame: frames[0],
          frameIndex: 0,
          frameCount: frames.length,
          result
        })]
      });

      for (let i = 1; i < frames.length; i += 1) {
        await wait(delayMs);
        await originalEditReply({
          embeds: [buildSlotSpinEmbed({
            baseEmbed: makeBaseEmbed,
            frame: frames[i],
            frameIndex: i,
            frameCount: frames.length,
            result
          })]
        });
      }

      await wait(delayMs);
      return originalEditReply({ embeds: [finalEmbed] });
    } catch (err) {
      console.error('Animated slots failed, falling back to final result:', err);
      if (interaction.replied && originalEditReply) {
        return originalEditReply({ embeds: [finalEmbed] }).catch(() => null);
      }
      return originalReply(payload);
    }
  };
}

function installSlotAnimationWrapper() {
  if (discord.Client.prototype.__hashGoblinSlotAnimationWrapper) return;
  const originalEmit = discord.Client.prototype.emit;

  discord.Client.prototype.emit = function wrappedEmit(eventName, ...args) {
    if (eventName === 'interactionCreate') {
      patchSlotInteraction(args[0]);
    }
    return originalEmit.call(this, eventName, ...args);
  };

  Object.defineProperty(discord.Client.prototype, '__hashGoblinSlotAnimationWrapper', {
    value: true,
    enumerable: false,
    configurable: false
  });
}

installSlotAnimationWrapper();
require('./index');
