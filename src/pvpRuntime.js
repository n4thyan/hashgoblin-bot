'use strict';

const { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { openDatabase, getSettings } = require('./lib/db');
const { formatGlory } = require('./lib/economy');
const {
  ensurePvpCoinflipSchema,
  oppositeSide,
  createPvpCoinflipChallenge,
  acceptPvpCoinflipChallenge,
  declinePvpCoinflipChallenge
} = require('./lib/pvpCoinflip');
const { coinflipAnimationEnabled, buildCoinflipFrames } = require('./lib/coinflipAnimation');

const INSTALLED = Symbol.for('hashgoblin.pvpRuntimeInstalled');
let db;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const delayMs = () => Math.max(250, Math.min(2000, Number(process.env.HASHGOBLIN_COINFLIP_ANIMATION_DELAY_MS || 450) || 450));

function embed(title) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x70ff9e)
    .setFooter({ text: 'HashGoblin • Glory has no real-world value • Every game has a SHA-256 receipt' })
    .setTimestamp(new Date());
}

function buttons(id, disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hgpvp:accept:${id}`).setLabel('Accept flip').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`hgpvp:decline:${id}`).setLabel('Decline / cancel').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  )];
}

function disable(rows = []) {
  return rows.map(row => ActionRowBuilder.from(row).setComponents(
    row.components.map(component => ButtonBuilder.from(component).setDisabled(true))
  ));
}

function challengeCard(c) {
  return embed('🪙 PvP Coinflip Challenge')
    .setDescription(`<@${c.challengerId}> challenged <@${c.opponentId}> to a Glory coinflip.`)
    .addFields(
      { name: 'Stake each', value: formatGlory(c.amount, c.currency), inline: true },
      { name: 'Pot', value: formatGlory(c.amount * 2, c.currency), inline: true },
      { name: 'Expires', value: `<t:${Math.floor(Date.parse(c.expiresAt) / 1000)}:R>`, inline: true },
      { name: 'Challenger side', value: `${c.challengerSide} — <@${c.challengerId}>`, inline: true },
      { name: 'Opponent side', value: `${c.opponentSide} — <@${c.opponentId}>`, inline: true },
      { name: 'Challenge ID', value: `\`${c.id}\``, inline: false },
      { name: 'Note', value: 'The challenger stake is locked now. Opponent stake is only taken if they accept.', inline: false }
    );
}

function resultCard(o) {
  const c = o.challenge;
  return embed('🪙 PvP Coinflip Result')
    .setDescription(`It landed on **${o.result.side}**. <@${o.result.winnerId}> wins the pot.`)
    .addFields(
      { name: 'Winner', value: `<@${o.result.winnerId}>`, inline: true },
      { name: 'Loser', value: `<@${o.result.loserId}>`, inline: true },
      { name: 'Pot', value: formatGlory(o.result.pot, o.currency), inline: true },
      { name: 'Sides', value: `<@${c.challengerId}>: ${c.challengerSide}\n<@${c.opponentId}>: ${oppositeSide(c.challengerSide)}`, inline: false },
      { name: 'Roll', value: `${o.result.roll} / 9999`, inline: true },
      { name: 'Proof ID', value: `\`${c.gameId}\``, inline: true },
      { name: 'Receipt', value: `Use \`/proof game_id:${c.gameId}\` to view the SHA-256 receipt.`, inline: false }
    );
}

function stoppedCard(c, currency, status) {
  return embed(status === 'declined' ? '❌ PvP Coinflip Cancelled' : '⌛ PvP Coinflip Expired')
    .setDescription('The locked stake was returned.')
    .addFields(
      { name: 'Challenge ID', value: `\`${c.id}\``, inline: true },
      { name: 'Returned', value: formatGlory(c.amount, currency), inline: true }
    );
}

function spinCard(frame, i, total, outcome) {
  const c = outcome.challenge;
  return embed('🪙 PvP Coinflip')
    .setDescription(`${frame.coin} **${frame.status}**`)
    .addFields(
      { name: 'Animation', value: `${i + 1}/${total}`, inline: true },
      { name: 'Pot', value: formatGlory(outcome.result.pot, outcome.currency), inline: true },
      { name: 'Players', value: `<@${c.challengerId}> vs <@${c.opponentId}>`, inline: false },
      { name: 'Proof', value: 'Result is already calculated. This is just the visual reveal.', inline: false }
    );
}

async function animate(message, outcome) {
  if (!coinflipAnimationEnabled()) return message.edit({ embeds: [resultCard(outcome)], components: [] });
  const frames = buildCoinflipFrames({ side: outcome.result.side, picked: outcome.challenge.challengerSide });
  for (let i = 0; i < frames.length; i += 1) {
    await message.edit({ embeds: [spinCard(frames[i], i, frames.length, outcome)], components: disable(message.components || []) });
    await sleep(delayMs());
  }
  return message.edit({ embeds: [resultCard(outcome)], components: [] });
}

async function safeReply(interaction, err) {
  const body = { content: `⚠️ ${err.message || 'Something went wrong.'}`, ephemeral: true };
  if (interaction.deferred || interaction.replied) return interaction.followUp(body).catch(() => null);
  return interaction.reply(body).catch(() => null);
}

async function handleCommand(interaction) {
  const opponent = interaction.options.getUser('user', true);
  if (opponent.bot) throw new Error('You cannot challenge bots.');
  const c = createPvpCoinflipChallenge(db, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    challengerId: interaction.user.id,
    opponentId: opponent.id,
    amount: interaction.options.getInteger('amount', true),
    side: interaction.options.getString('side', true)
  });
  await interaction.reply({
    content: `${opponent}, <@${interaction.user.id}> has challenged you to a PvP coinflip.`,
    embeds: [challengeCard(c)],
    components: buttons(c.id)
  });
}

async function handleButton(interaction) {
  const [, action, id] = interaction.customId.split(':');
  await interaction.deferUpdate();
  if (action === 'accept') {
    const outcome = acceptPvpCoinflipChallenge(db, interaction.guildId, id, interaction.user.id);
    if (outcome.status !== 'accepted') {
      const currency = getSettings(db, interaction.guildId).currency_name;
      return interaction.message.edit({ embeds: [stoppedCard(outcome.challenge, currency, outcome.status)], components: disable(interaction.message.components || []) });
    }
    return animate(interaction.message, outcome);
  }
  const outcome = declinePvpCoinflipChallenge(db, interaction.guildId, id, interaction.user.id);
  const currency = getSettings(db, interaction.guildId).currency_name;
  return interaction.message.edit({ embeds: [stoppedCard(outcome.challenge, currency, 'declined')], components: disable(interaction.message.components || []) });
}

function isPvp(interaction) {
  if (!interaction) return false;
  if (interaction.isChatInputCommand?.() && interaction.commandName === 'coinflipvs') return true;
  if (interaction.isButton?.() && String(interaction.customId || '').startsWith('hgpvp:')) return true;
  return false;
}

function installPvpRuntime() {
  if (Client.prototype[INSTALLED]) return;
  db = openDatabase();
  ensurePvpCoinflipSchema(db);
  const originalEmit = Client.prototype.emit;
  Client.prototype.emit = function pvpEmit(eventName, ...args) {
    const interaction = args[0];
    if (eventName === 'interactionCreate' && isPvp(interaction)) {
      const task = interaction.isButton?.() ? handleButton(interaction) : handleCommand(interaction);
      task.catch(err => {
        console.error('PvP coinflip failed:', err);
        safeReply(interaction, err);
      });
      return true;
    }
    return originalEmit.call(this, eventName, ...args);
  };
  Object.defineProperty(Client.prototype, INSTALLED, { value: true });
}

module.exports = { installPvpRuntime };
