'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Client
} = require('discord.js');
const { openDatabase, ensureUser, getSettings } = require('./lib/db');
const { formatGlory } = require('./lib/economy');
const {
  ensurePvpCoinflipSchema,
  pvpCoinflipEnabled,
  oppositeSide,
  getPvpCoinflipChallenge,
  createPvpCoinflipChallenge,
  acceptPvpCoinflipChallenge,
  declinePvpCoinflipChallenge
} = require('./lib/pvpCoinflip');
const {
  coinflipAnimationEnabled,
  buildCoinflipFrames
} = require('./lib/coinflipAnimation');

const PVP_WRAPPER_FLAG = Symbol.for('hashgoblin.pvpCoinflipWrapperInstalled');
const locks = new Set();
let db;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function animationDelayMs(env = process.env) {
  const raw = Number(env.HASHGOBLIN_COINFLIP_ANIMATION_DELAY_MS || 450);
  if (!Number.isFinite(raw)) return 450;
  return Math.max(250, Math.min(2000, Math.floor(raw)));
}

function baseEmbed(title) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x70ff9e)
    .setFooter({ text: 'HashGoblin • Glory has no real-world value • Every game has a SHA-256 receipt' })
    .setTimestamp(new Date());
}

function disabledComponents(components) {
  return components.map(row => ActionRowBuilder.from(row).setComponents(
    row.components.map(component => ButtonBuilder.from(component).setDisabled(true))
  ));
}

function pvpButtons(challengeId, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`hgpvp:accept:${challengeId}`)
        .setLabel('Accept flip')
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`hgpvp:decline:${challengeId}`)
        .setLabel('Decline / cancel')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    )
  ];
}

function challengeEmbed(challenge) {
  return baseEmbed('🪙 PvP Coinflip Challenge')
    .setDescription(`<@${challenge.challengerId}> challenged <@${challenge.opponentId}> to a fake Glory coinflip.`)
    .addFields(
      { name: 'Stake each', value: formatGlory(challenge.amount, challenge.currency), inline: true },
      { name: 'Pot', value: formatGlory(challenge.amount * 2, challenge.currency), inline: true },
      { name: 'Expires', value: `<t:${Math.floor(Date.parse(challenge.expiresAt) / 1000)}:R>`, inline: true },
      { name: 'Challenger side', value: `${challenge.challengerSide} — <@${challenge.challengerId}>`, inline: true },
      { name: 'Opponent side', value: `${challenge.opponentSide} — <@${challenge.opponentId}>`, inline: true },
      { name: 'Challenge ID', value: `\`${challenge.id}\``, inline: false },
      { name: 'How it works', value: 'The challenger stake is locked now. The opponent stake is taken only if they accept. No real money, crypto, prizes or cash-out.', inline: false }
    );
}

function expiredEmbed(challenge, currency, status = 'expired') {
  const title = status === 'declined' ? '❌ PvP Coinflip Declined' : '⌛ PvP Coinflip Expired';
  const text = status === 'declined'
    ? 'The challenge was cancelled and the locked stake was returned.'
    : 'The challenge timed out and the locked stake was returned.';
  return baseEmbed(title)
    .setDescription(text)
    .addFields(
      { name: 'Challenge ID', value: `\`${challenge.id}\``, inline: true },
      { name: 'Returned', value: formatGlory(challenge.amount, currency), inline: true }
    );
}

function finalEmbed(outcome) {
  const { challenge, result, currency, challengerBalance, opponentBalance } = outcome;
  const challengerWon = result.winnerId === challenge.challengerId;
  return baseEmbed('🪙 PvP Coinflip Result')
    .setDescription(`It landed on **${result.side}**. <@${result.winnerId}> wins the pot.`)
    .addFields(
      { name: 'Winner', value: `<@${result.winnerId}>`, inline: true },
      { name: 'Loser', value: `<@${result.loserId}>`, inline: true },
      { name: 'Pot', value: formatGlory(result.pot, currency), inline: true },
      { name: 'Challenger side', value: `${challenge.challengerSide} — <@${challenge.challengerId}>`, inline: true },
      { name: 'Opponent side', value: `${oppositeSide(challenge.challengerSide)} — <@${challenge.opponentId}>`, inline: true },
      { name: 'Roll', value: `${result.roll} / 9999`, inline: true },
      { name: 'Challenger balance', value: formatGlory(challengerBalance, currency), inline: true },
      { name: 'Opponent balance', value: formatGlory(opponentBalance, currency), inline: true },
      { name: 'Proof ID', value: `\`${challenge.gameId}\``, inline: false },
      { name: 'Receipt', value: `Use \`/proof game_id:${challenge.gameId}\` to view the SHA-256 receipt.`, inline: false },
      { name: 'Math note', value: challengerWon ? 'The challenger picked the landing side.' : 'The opponent held the opposite side and the coin landed there.', inline: false }
    );
}

function spinEmbed({ frame, frameIndex, frameCount, challenge, currency }) {
  return baseEmbed('🪙 PvP Coinflip')
    .setDescription(`${frame.coin} **${frame.status}**`)
    .addFields(
      { name: 'Animation', value: `${Math.min(frameIndex + 1, frameCount)}/${frameCount}`, inline: true },
      { name: 'Pot', value: formatGlory(challenge.amount * 2, currency), inline: true },
      { name: 'Challenge', value: `<@${challenge.challengerId}> vs <@${challenge.opponentId}>`, inline: false },
      { name: 'Sides', value: `<@${challenge.challengerId}>: ${challenge.challengerSide}\n<@${challenge.opponentId}>: ${oppositeSide(challenge.challengerSide)}`, inline: false },
      { name: 'Proof', value: 'Result is already calculated. This is just the visual reveal.', inline: false }
    );
}

async function editWithResultAnimation(message, outcome) {
  if (!coinflipAnimationEnabled()) {
    return message.edit({ embeds: [finalEmbed(outcome)], components: [] });
  }

  const resultForAnimation = {
    side: outcome.result.side,
    picked: outcome.challenge.challengerSide
  };
  const frames = buildCoinflipFrames(resultForAnimation);
  const delayMs = animationDelayMs();

  for (let i = 0; i < frames.length; i += 1) {
    await message.edit({
      embeds: [spinEmbed({
        frame: frames[i],
        frameIndex: i,
        frameCount: frames.length,
        challenge: outcome.challenge,
        currency: outcome.currency
      })],
      components: disabledComponents(message.components || [])
    });
    await wait(delayMs);
  }

  return message.edit({ embeds: [finalEmbed(outcome)], components: [] });
}

function lockKeysFor(interaction, extra = []) {
  const keys = [`${interaction.guildId}:${interaction.user.id}`, ...extra];
  return keys;
}

async function withLocks(interaction, extraKeys, fn) {
  const keys = lockKeysFor(interaction, extraKeys);
  const busy = keys.find(key => locks.has(key));
  if (busy) {
    return interaction.reply({ content: 'The goblin is already processing that. Try again in a second.', ephemeral: true });
  }
  keys.forEach(key => locks.add(key));
  try {
    return await fn();
  } finally {
    keys.forEach(key => locks.delete(key));
  }
}

function expirePendingChallenge(dbConn, row) {
  const user = ensureUser(dbConn, row.guild_id, row.challenger_user_id);
  const balanceAfter = user.balance + row.amount;
  dbConn.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
    .run(balanceAfter, row.guild_id, row.challenger_user_id);
  dbConn.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, game_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)')
    .run(row.guild_id, row.challenger_user_id, row.amount, 'coinflipvs_refund', row.game_id, balanceAfter);
  dbConn.prepare("UPDATE pending_coinflip_challenges SET status = 'expired', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
    .run(row.id);
}

function cleanupExpiredChallenges(dbConn) {
  ensurePvpCoinflipSchema(dbConn);
  const now = new Date().toISOString();
  const rows = dbConn.prepare("SELECT * FROM pending_coinflip_challenges WHERE status = 'pending' AND expires_at <= ?").all(now);
  const tx = dbConn.transaction(() => {
    for (const row of rows) {
      const fresh = dbConn.prepare("SELECT * FROM pending_coinflip_challenges WHERE id = ? AND status = 'pending'").get(row.id);
      if (fresh) expirePendingChallenge(dbConn, fresh);
    }
  });
  tx();
  return rows.length;
}

function scheduleAutoExpire(message, challenge) {
  const delay = Math.max(1000, Date.parse(challenge.expiresAt) - Date.now() + 500);
  const timer = setTimeout(async () => {
    try {
      const current = getPvpCoinflipChallenge(db, challenge.guildId, challenge.id);
      if (!current || current.status !== 'pending') return;
      const row = db.prepare('SELECT * FROM pending_coinflip_challenges WHERE id = ? AND guild_id = ? AND status = ?').get(challenge.id, challenge.guildId, 'pending');
      if (!row || Date.parse(row.expires_at) > Date.now()) return;
      db.transaction(() => expirePendingChallenge(db, row))();
      await message.edit({ embeds: [expiredEmbed(current, challenge.currency, 'expired')], components: disabledComponents(message.components || []) });
    } catch (err) {
      console.error('PvP coinflip auto-expire failed:', err);
    }
  }, delay);
  if (typeof timer.unref === 'function') timer.unref();
}

async function handleChallengeCommand(interaction) {
  if (!pvpCoinflipEnabled()) throw new Error('PvP coinflip is disabled in this bot config.');
  if (!interaction.guildId) throw new Error('HashGoblin commands only work inside servers.');

  return withLocks(interaction, [], async () => {
    const opponent = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const side = interaction.options.getString('side', true);
    if (opponent.bot) throw new Error('You cannot challenge bots.');

    const challenge = createPvpCoinflipChallenge(db, {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      challengerId: interaction.user.id,
      opponentId: opponent.id,
      amount,
      side
    });

    const message = await interaction.reply({
      content: `${opponent}, <@${interaction.user.id}> has challenged you to a PvP coinflip.`,
      embeds: [challengeEmbed(challenge)],
      components: pvpButtons(challenge.id),
      fetchReply: true
    });
    scheduleAutoExpire(message, challenge);
  });
}

async function handlePvpButton(interaction) {
  if (!interaction.guildId) throw new Error('HashGoblin buttons only work inside servers.');
  const [, action, challengeId] = interaction.customId.split(':');
  if (!['accept', 'decline'].includes(action) || !challengeId) throw new Error('That PvP button is malformed.');

  return withLocks(interaction, [`challenge:${interaction.guildId}:${challengeId}`], async () => {
    if (action === 'accept') {
      await interaction.deferUpdate();
      const outcome = acceptPvpCoinflipChallenge(db, interaction.guildId, challengeId, interaction.user.id);
      if (outcome.status === 'expired') {
        return interaction.message.edit({ embeds: [expiredEmbed(outcome.challenge, getSettings(db, interaction.guildId).currency_name, 'expired')], components: disabledComponents(interaction.message.components || []) });
      }
      if (outcome.status !== 'accepted') {
        return interaction.followUp({ content: `That challenge is already ${outcome.status}.`, ephemeral: true });
      }
      return editWithResultAnimation(interaction.message, outcome);
    }

    await interaction.deferUpdate();
    const outcome = declinePvpCoinflipChallenge(db, interaction.guildId, challengeId, interaction.user.id);
    const currency = getSettings(db, interaction.guildId).currency_name;
    return interaction.message.edit({
      embeds: [expiredEmbed(outcome.challenge, currency, 'declined')],
      components: disabledComponents(interaction.message.components || [])
    });
  });
}

async function handlePvpInteraction(interaction) {
  if (!interaction) return;
  if (typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand() && interaction.commandName === 'coinflipvs') {
    return handleChallengeCommand(interaction);
  }
  if (typeof interaction.isButton === 'function' && interaction.isButton() && String(interaction.customId || '').startsWith('hgpvp:')) {
    return handlePvpButton(interaction);
  }
}

async function replyWithError(interaction, err) {
  const payload = { content: `⚠️ ${err.message || 'Something went wrong.'}`, ephemeral: true };
  if (!interaction) return;
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

function installPvpCoinflipFeature() {
  if (Client.prototype[PVP_WRAPPER_FLAG]) return;
  db = openDatabase();
  ensurePvpCoinflipSchema(db);
  const expiredCount = cleanupExpiredChallenges(db);
  if (expiredCount) console.log(`Expired ${expiredCount} stale PvP coinflip challenge(s).`);

  const originalEmit = Client.prototype.emit;
  Client.prototype.emit = function hashGoblinPvpEmit(eventName, ...args) {
    if (eventName === 'interactionCreate') {
      const interaction = args[0];
      handlePvpInteraction(interaction).catch(err => {
        console.error('PvP coinflip interaction failed:', err);
        replyWithError(interaction, err);
      });
    }
    return originalEmit.call(this, eventName, ...args);
  };

  Object.defineProperty(Client.prototype, PVP_WRAPPER_FLAG, {
    value: true,
    enumerable: false,
    configurable: false
  });
}

module.exports = {
  installPvpCoinflipFeature,
  cleanupExpiredChallenges,
  pvpButtons,
  challengeEmbed,
  finalEmbed
};
