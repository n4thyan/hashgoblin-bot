'use strict';

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { openDatabase, getSettings } = require('./lib/db');
const { getUser, formatGlory, titleForUser, claimDaily, claimWork, transfer, createTrade, listPendingTrades, resolveTrade, applyGame, adminAdjustBalance, updateGuildSetting, vaultDeposit, vaultWithdraw } = require('./lib/economy');
const { createProofContext, verifyStoredGame } = require('./lib/proof');
const { getShopTitles, buyTitle, getInventory, equipTitle, clearTitle, achievementList } = require('./lib/shop');
const { getLottoPool, settleLottoPool, LOTTO_POOL_CONTRIBUTION_BPS, DEFAULT_LOTTO_JACKPOT } = require('./lib/jackpot');
const { updateGreeting, updateMemberRole, assignMemberRole, sendMemberGreeting, greetingSummary } = require('./lib/community');
const {
  playCoinflip,
  playWheel,
  playSlots,
  playLotto,
  playHashJackpot,
  parseLottoNumbers,
  LOTTO_TICKET_COST,
  LOTTO_TOTAL_COMBOS,
  lottoExpectedReturn,
  oddsSummaryFor
} = require('./lib/games');

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is required.');

const BOT_VERSION = '1.1.0';
const STARTED_AT = Date.now();
const db = openDatabase();
const locks = new Set();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

function newGameId() {
  return `HG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function baseEmbed(title) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x70ff9e)
    .setFooter({ text: 'HashGoblin • Glory has no real-world value • Every game has a SHA-256 receipt' })
    .setTimestamp(new Date());
}

function assertGuild(interaction) {
  if (!interaction.guildId) throw new Error('HashGoblin commands only work inside servers.');
}

function lockKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

async function withUserLock(interaction, fn) {
  const key = lockKey(interaction);
  if (locks.has(key)) {
    return interaction.reply({ content: 'The goblin is still processing your last command. Try again in a second.', ephemeral: true });
  }
  locks.add(key);
  try {
    return await fn();
  } finally {
    locks.delete(key);
  }
}

function makeGameRecord(interaction, gameType, betAmount) {
  const id = newGameId();
  const proof = createProofContext({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    gameType,
    gameId: id,
    nonce: Date.now()
  });
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


const LEADERBOARD_TYPES = {
  balance: { label: 'Wallet Balance', serverExpr: 'balance', globalExpr: 'SUM(balance)' },
  net_worth: { label: 'Net Worth', serverExpr: '(balance + COALESCE(bank_balance, 0))', globalExpr: 'SUM(balance + COALESCE(bank_balance, 0))' },
  biggest_win: { label: 'Biggest Win', serverExpr: 'biggest_win', globalExpr: 'MAX(biggest_win)' },
  lifetime_won: { label: 'Lifetime Won', serverExpr: 'lifetime_won', globalExpr: 'SUM(lifetime_won)' },
  lifetime_bet: { label: 'Lifetime Bet', serverExpr: 'lifetime_bet', globalExpr: 'SUM(lifetime_bet)' },
  net_profit: { label: 'Net Profit', serverExpr: '(lifetime_won - lifetime_lost)', globalExpr: 'SUM(lifetime_won - lifetime_lost)' }
};

function getLeaderboardRows(type, scope, guildId) {
  const cfg = LEADERBOARD_TYPES[type] || LEADERBOARD_TYPES.balance;
  if (scope === 'global') {
    return db.prepare(`
      SELECT user_id, ${cfg.globalExpr} AS score
      FROM users
      GROUP BY user_id
      HAVING score > 0
      ORDER BY score DESC, user_id ASC
      LIMIT 10
    `).all();
  }
  return db.prepare(`
    SELECT user_id, ${cfg.serverExpr} AS score
    FROM users
    WHERE guild_id = ?
    ORDER BY score DESC, user_id ASC
    LIMIT 10
  `).all(guildId);
}

function getServerBalanceRank(guildId, userId) {
  const user = getUser(db, guildId, userId);
  const above = db.prepare('SELECT COUNT(*) AS c FROM users WHERE guild_id = ? AND balance > ?').get(guildId, user.balance).c;
  const total = db.prepare('SELECT COUNT(*) AS c FROM users WHERE guild_id = ?').get(guildId).c;
  return { rank: above + 1, total, balance: user.balance };
}

function getGlobalBalanceRank(userId) {
  const row = db.prepare('SELECT COALESCE(SUM(balance + COALESCE(bank_balance, 0)), 0) AS balance FROM users WHERE user_id = ?').get(userId);
  const balance = Number(row.balance || 0);
  const above = db.prepare(`
    SELECT COUNT(*) AS c FROM (
      SELECT user_id, SUM(balance + COALESCE(bank_balance, 0)) AS score FROM users GROUP BY user_id HAVING score > ?
    )
  `).get(balance).c;
  const total = db.prepare('SELECT COUNT(*) AS c FROM (SELECT user_id FROM users GROUP BY user_id)').get().c;
  return { rank: above + 1, total, balance };
}


function getRecentGames(guildId, limit = 8) {
  return db.prepare(`
    SELECT id, user_id, game_type, bet_amount, payout_amount, profit, odds_text, created_at
    FROM games
    WHERE guild_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(guildId, limit);
}

function settingsSummary(settings) {
  return [
    `Currency: ${settings.currency_name}`,
    `Daily: ${settings.daily_amount}`,
    `Max bet: ${settings.max_bet_percent}% of balance, capped at ${settings.max_bet_absolute}`,
    `Min bet: ${settings.min_bet}`,
    `Transfer fee: ${(settings.transfer_fee_bps / 100).toFixed(2)}%`,
    `Lotto ticket: ${settings.lotto_ticket_cost}`,
    `Gambling: ${settings.gambling_enabled ? 'enabled' : 'disabled'}`,
    `Transfers: ${settings.transfers_enabled ? 'enabled' : 'disabled'}`,
    `Big wins: ${settings.big_win_enabled ? `enabled at ${settings.big_win_threshold}+` : 'disabled'}`
  ].join('\n');
}

function assertManageGuild(interaction) {
  if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error('You need Manage Server permission to use HashGoblin admin tools.');
  }
}

function assertGamblingEnabled(guildId) {
  const settings = getSettings(db, guildId);
  if (!settings.gambling_enabled) throw new Error('Gambling games are currently disabled in this server by an admin.');
}

function assertTransfersEnabled(guildId) {
  const settings = getSettings(db, guildId);
  if (!settings.transfers_enabled) throw new Error('Transfers/trades are currently disabled in this server by an admin.');
}

async function maybeAnnounceBigWin(interaction, record, result, economy) {
  const settings = getSettings(db, interaction.guildId);
  if (!settings.big_win_enabled || !settings.big_win_channel_id) return;
  if (!economy || Number(economy.profit || 0) < Number(settings.big_win_threshold || 0)) return;
  const channel = client.channels.cache.get(settings.big_win_channel_id) || await client.channels.fetch(settings.big_win_channel_id).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const embed = baseEmbed('🚨 Big HashGoblin Win')
    .setDescription(`${interaction.user} just hit a big **${result.gameType}** win.`)
    .addFields(
      { name: 'Profit', value: formatGlory(economy.profit, settings.currency_name), inline: true },
      { name: 'Payout', value: formatGlory(result.payout, settings.currency_name), inline: true },
      { name: 'Odds', value: result.oddsText || 'n/a', inline: true },
      { name: 'Proof ID', value: `\`${record.id}\``, inline: false }
    );
  await channel.send({ embeds: [embed] }).catch(err => console.error('Big win announcement failed:', err));
}

function getAdminLogs(guildId, limit = 10) {
  return db.prepare(`SELECT * FROM admin_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`).all(guildId, limit);
}

function getUserLedger(guildId, userId, limit = 10) {
  return db.prepare(`SELECT * FROM ledger WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?`).all(guildId, userId, limit);
}

function getEconomyStats(guildId, scope = 'server') {
  if (scope === 'global') {
    return db.prepare(`
      SELECT
        COUNT(DISTINCT user_id) AS users,
        COUNT(DISTINCT guild_id) AS guilds,
        COALESCE(SUM(balance + COALESCE(bank_balance, 0)), 0) AS balance,
        COALESCE(SUM(lifetime_bet), 0) AS lifetime_bet,
        COALESCE(SUM(lifetime_won), 0) AS lifetime_won,
        COALESCE(SUM(lifetime_lost), 0) AS lifetime_lost,
        COALESCE(MAX(biggest_win), 0) AS biggest_win
      FROM users
    `).get();
  }
  return db.prepare(`
    SELECT
      COUNT(*) AS users,
      1 AS guilds,
      COALESCE(SUM(balance + COALESCE(bank_balance, 0)), 0) AS balance,
      COALESCE(SUM(lifetime_bet), 0) AS lifetime_bet,
      COALESCE(SUM(lifetime_won), 0) AS lifetime_won,
      COALESCE(SUM(lifetime_lost), 0) AS lifetime_lost,
      COALESCE(MAX(biggest_win), 0) AS biggest_win
    FROM users WHERE guild_id = ?
  `).get(guildId);
}

function gameEmbed({ title, interaction, record, result, economy }) {
  const settings = getSettings(db, interaction.guildId);
  return baseEmbed(title)
    .addFields(
      { name: 'Result', value: String(result.result), inline: true },
      { name: 'Odds', value: result.oddsText || 'n/a', inline: true },
      { name: 'Bot edge', value: result.edgeText || 'n/a', inline: true },
      { name: 'Bet', value: formatGlory(economy.bet, settings.currency_name), inline: true },
      { name: 'Payout', value: formatGlory(result.payout, settings.currency_name), inline: true },
      { name: 'Balance', value: formatGlory(economy.balance, settings.currency_name), inline: true },
      { name: 'Proof ID', value: `\`${record.id}\``, inline: false },
      { name: 'Receipt', value: `Use \`/proof game_id:${record.id}\` to view the SHA-256 receipt.`, inline: false }
    );
}

function chunkLines(lines, maxChars = 950) {
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length > maxChars) {
      if (cur) chunks.push(cur);
      cur = line;
    } else {
      cur = next;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

client.once('ready', () => {
  console.log(`HashGoblin online as ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
  try {
    await assignMemberRole(db, member);
    await sendMemberGreeting(db, member, 'welcome', baseEmbed);
  } catch (err) {
    console.error('Welcome greeting failed:', err);
  }
});

client.on('guildMemberRemove', async member => {
  try {
    await sendMemberGreeting(db, member, 'goodbye', baseEmbed);
  } catch (err) {
    console.error('Goodbye greeting failed:', err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    assertGuild(interaction);
    const name = interaction.commandName;


    if (name === 'help') {
      const settings = getSettings(db, interaction.guildId);
      const embed = baseEmbed('🧌 HashGoblin Help')
        .setDescription('HashGoblin is a fake Discord casino/economy bot using **Glory** and SHA-256 proof receipts. Glory has no real-world value.')
        .addFields(
          { name: 'Earn and manage Glory', value: '`/daily`, `/work`, `/balance`, `/vault`, `/give`, `/trade`, `/leaderboard`, `/rank`', inline: false },
          { name: 'Games', value: '`/coinflip`, `/wheelspin`, `/slots`, `/lotto`, `/hashjackpot`', inline: false },
          { name: 'Maths and receipts', value: '`/odds` shows the exact odds. `/proof` shows the SHA-256 receipt for a game.', inline: false },
          { name: 'Community/admin', value: '`/profile`, `/shop`, `/inventory`, `/title`, `/achievements`, `/greetings`, `/admin`', inline: false },
          { name: 'Current currency', value: settings.currency_name, inline: true },
          { name: 'Version', value: BOT_VERSION, inline: true }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (name === 'about') {
      const embed = baseEmbed('ℹ️ About HashGoblin')
        .setDescription('HashGoblin is a Discord economy bot where users gamble fake server currency called **Glory**. The twist is that every game result is generated from a SHA-256 hash and saved with a proof ID.')
        .addFields(
          { name: 'What SHA-256 does here', value: 'The bot mixes a server seed, your user/server/game IDs and a nonce, then hashes them. The hash is converted into a roll, which becomes the coinflip, wheel, slots, lotto or HashJackpot result.', inline: false },
          { name: 'Why receipts matter', value: 'Use `/proof game_id:<id>` to see the seed, hash and roll. The bot can recompute the same hash, so the result has receipts instead of just “trust me bro”.', inline: false },
          { name: 'Important', value: 'Glory is fake arcade currency. It cannot be bought, sold, withdrawn, cashed out or redeemed for anything real.', inline: false }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (name === 'botstatus') {
      const uptimeSec = Math.floor((Date.now() - STARTED_AT) / 1000);
      const stats = getEconomyStats(interaction.guildId, 'server');
      const global = getEconomyStats(interaction.guildId, 'global');
      const settings = getSettings(db, interaction.guildId);
      const embed = baseEmbed('✅ HashGoblin Bot Status')
        .setDescription('Deploy/test diagnostics for this running bot instance.')
        .addFields(
          { name: 'Version', value: BOT_VERSION, inline: true },
          { name: 'Node.js', value: process.version, inline: true },
          { name: 'Uptime', value: `${uptimeSec}s`, inline: true },
          { name: 'Server users in economy', value: Number(stats.users || 0).toLocaleString('en-GB'), inline: true },
          { name: 'Global users', value: Number(global.users || 0).toLocaleString('en-GB'), inline: true },
          { name: 'Currency', value: settings.currency_name, inline: true },
          { name: 'Gambling', value: settings.gambling_enabled ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Transfers', value: settings.transfers_enabled ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Database', value: process.env.HASHGOBLIN_DB || './data/hashgoblin.sqlite', inline: false },
          { name: 'Safety', value: 'Glory is fake score currency only. Game outcomes use SHA-256 receipts and the bot stores a ledger of currency changes.', inline: false }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (name === 'balance') {
      const target = interaction.options.getUser('user') || interaction.user;
      const settings = getSettings(db, interaction.guildId);
      const user = getUser(db, interaction.guildId, target.id);
      const embed = baseEmbed('👛 Glory Balance')
        .setDescription(`${target} has **${formatGlory(user.balance, settings.currency_name)}**.`)
        .addFields(
          { name: 'Wallet', value: formatGlory(user.balance, settings.currency_name), inline: true },
          { name: 'Vault', value: formatGlory(user.bank_balance || 0, settings.currency_name), inline: true },
          { name: 'Net worth', value: formatGlory(user.balance + Number(user.bank_balance || 0), settings.currency_name), inline: true },
          { name: 'Lifetime won', value: formatGlory(user.lifetime_won, settings.currency_name), inline: true },
          { name: 'Lifetime lost', value: formatGlory(user.lifetime_lost, settings.currency_name), inline: true },
          { name: 'Biggest win', value: formatGlory(user.biggest_win, settings.currency_name), inline: true },
          { name: 'Equipped title', value: user.equipped_title || 'Auto title', inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }


    if (name === 'vault') {
      const sub = interaction.options.getSubcommand();
      const settings = getSettings(db, interaction.guildId);
      if (sub === 'view') {
        const target = interaction.options.getUser('user') || interaction.user;
        const user = getUser(db, interaction.guildId, target.id);
        const embed = baseEmbed('🏦 Glory Vault')
          .setDescription(`${target}'s protected Glory storage.`)
          .addFields(
            { name: 'Wallet', value: formatGlory(user.balance, settings.currency_name), inline: true },
            { name: 'Vault', value: formatGlory(user.bank_balance || 0, settings.currency_name), inline: true },
            { name: 'Net worth', value: formatGlory(user.balance + Number(user.bank_balance || 0), settings.currency_name), inline: true },
            { name: 'How it works', value: 'Gambling commands use wallet Glory only. Vaulted Glory is safe from accidental bets, but still counts toward net-worth leaderboards.', inline: false }
          );
        return interaction.reply({ embeds: [embed], ephemeral: target.id === interaction.user.id });
      }
      return withUserLock(interaction, async () => {
        const amount = interaction.options.getInteger('amount', true);
        const res = sub === 'deposit'
          ? vaultDeposit(db, interaction.guildId, interaction.user.id, amount)
          : vaultWithdraw(db, interaction.guildId, interaction.user.id, amount);
        const embed = baseEmbed(sub === 'deposit' ? '🏦 Glory Vault Deposit' : '🏦 Glory Vault Withdraw')
          .setDescription(`${interaction.user} ${sub === 'deposit' ? 'vaulted' : 'withdrew'} **${formatGlory(res.amount, res.currency)}**.`)
          .addFields(
            { name: 'Wallet', value: formatGlory(res.wallet, res.currency), inline: true },
            { name: 'Vault', value: formatGlory(res.vault, res.currency), inline: true },
            { name: 'Net worth', value: formatGlory(res.netWorth, res.currency), inline: true }
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      });
    }


    if (name === 'profile') {
      const target = interaction.options.getUser('user') || interaction.user;
      const settings = getSettings(db, interaction.guildId);
      const user = getUser(db, interaction.guildId, target.id);
      const net = user.lifetime_won - user.lifetime_lost;
      const embed = baseEmbed('🧌 HashGoblin Profile')
        .setDescription(`${target}\n**${titleForUser(user)}**`)
        .addFields(
          { name: 'Wallet', value: formatGlory(user.balance, settings.currency_name), inline: true },
          { name: 'Vault', value: formatGlory(user.bank_balance || 0, settings.currency_name), inline: true },
          { name: 'Net worth', value: formatGlory(user.balance + Number(user.bank_balance || 0), settings.currency_name), inline: true },
          { name: 'Net profit', value: formatGlory(net, settings.currency_name), inline: true },
          { name: 'Daily streak', value: `${user.daily_streak || 0}`, inline: true },
          { name: 'Lifetime bet', value: formatGlory(user.lifetime_bet, settings.currency_name), inline: true },
          { name: 'Wallet', value: formatGlory(user.balance, settings.currency_name), inline: true },
          { name: 'Vault', value: formatGlory(user.bank_balance || 0, settings.currency_name), inline: true },
          { name: 'Net worth', value: formatGlory(user.balance + Number(user.bank_balance || 0), settings.currency_name), inline: true },
          { name: 'Lifetime won', value: formatGlory(user.lifetime_won, settings.currency_name), inline: true },
          { name: 'Lifetime lost', value: formatGlory(user.lifetime_lost, settings.currency_name), inline: true },
          { name: 'Biggest win', value: formatGlory(user.biggest_win, settings.currency_name), inline: true },
          { name: 'Equipped title', value: user.equipped_title || 'Auto title', inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (name === 'rank') {
      const target = interaction.options.getUser('user') || interaction.user;
      const settings = getSettings(db, interaction.guildId);
      const serverRank = getServerBalanceRank(interaction.guildId, target.id);
      const globalRank = getGlobalBalanceRank(target.id);
      const embed = baseEmbed('📈 HashGoblin Rank')
        .setDescription(`${target}'s Glory ranking.`)
        .addFields(
          { name: 'Server rank', value: `#${serverRank.rank} of ${serverRank.total}`, inline: true },
          { name: 'Server balance', value: formatGlory(serverRank.balance, settings.currency_name), inline: true },
          { name: 'Global rank', value: `#${globalRank.rank} of ${globalRank.total}`, inline: true },
          { name: 'Global Glory', value: formatGlory(globalRank.balance, settings.currency_name), inline: true },
          { name: 'Global board note', value: 'Global boards aggregate the same Discord user across every server running this bot. Glory is still fake server currency with no real-world value.', inline: false }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (name === 'stats') {
      const scope = interaction.options.getString('scope') || 'server';
      const settings = getSettings(db, interaction.guildId);
      const stats = getEconomyStats(interaction.guildId, scope);
      const embed = baseEmbed(scope === 'global' ? '🌍 Global HashGoblin Stats' : '🏰 Server HashGoblin Stats')
        .addFields(
          { name: 'Users', value: Number(stats.users || 0).toLocaleString('en-GB'), inline: true },
          { name: 'Servers', value: Number(stats.guilds || 0).toLocaleString('en-GB'), inline: true },
          { name: 'Total balance', value: formatGlory(stats.balance || 0, settings.currency_name), inline: true },
          { name: 'Lifetime bet', value: formatGlory(stats.lifetime_bet || 0, settings.currency_name), inline: true },
          { name: 'Lifetime won', value: formatGlory(stats.lifetime_won || 0, settings.currency_name), inline: true },
          { name: 'Lifetime lost', value: formatGlory(stats.lifetime_lost || 0, settings.currency_name), inline: true },
          { name: 'Biggest win', value: formatGlory(stats.biggest_win || 0, settings.currency_name), inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }


    if (name === 'recent') {
      const settings = getSettings(db, interaction.guildId);
      const rows = getRecentGames(interaction.guildId);
      const lines = rows.length ? rows.map(g => {
        const sign = g.profit >= 0 ? '+' : '';
        return `\`${g.id}\` <@${g.user_id}> **${g.game_type}** bet ${formatGlory(g.bet_amount, settings.currency_name)} → ${sign}${formatGlory(g.profit, settings.currency_name)} (${g.odds_text || 'n/a'})`;
      }) : ['No games yet.'];
      const embed = baseEmbed('🧾 Recent HashGoblin Games')
        .setDescription(lines.join('\n').slice(0, 3900))
        .addFields({ name: 'Proofs', value: 'Use `/proof game_id:<id>` to inspect any receipt from this server.', inline: false });
      return interaction.reply({ embeds: [embed] });
    }

    if (name === 'daily') {
      return withUserLock(interaction, async () => {
        const res = claimDaily(db, interaction.guildId, interaction.user.id);
        const embed = baseEmbed('🎁 Daily Glory')
          .setDescription(`${interaction.user} claimed **${formatGlory(res.amount, res.currency)}**.`)
          .addFields(
            { name: 'Streak', value: `${res.streak} day${res.streak === 1 ? '' : 's'}`, inline: true },
            { name: 'Streak bonus', value: formatGlory(res.streakBonus, res.currency), inline: true },
            { name: 'Balance', value: formatGlory(res.balance, res.currency), inline: true }
          );
        return interaction.reply({ embeds: [embed] });
      });
    }



    if (name === 'shop') {
      const sub = interaction.options.getSubcommand();
      const settings = getSettings(db, interaction.guildId);
      if (sub === 'view') {
        const titles = getShopTitles();
        const lines = titles.map(t => `\`${t.id}\` — **${t.name}** — ${formatGlory(t.price, settings.currency_name)}\n${t.description}`);
        const embed = baseEmbed('🛒 HashGoblin Title Shop')
          .setDescription(lines.join('\n\n').slice(0, 3900))
          .addFields({ name: 'Buy', value: 'Use `/shop buy title_id:<id>`. Titles are cosmetic only and have no gameplay value.', inline: false });
        return interaction.reply({ embeds: [embed] });
      }
      if (sub === 'buy') {
        return withUserLock(interaction, async () => {
          const titleId = interaction.options.getString('title_id', true);
          const res = buyTitle(db, interaction.guildId, interaction.user.id, titleId);
          const embed = baseEmbed('✅ Title Purchased')
            .setDescription(`${interaction.user} bought **${res.item.name}**.`)
            .addFields(
              { name: 'Cost', value: formatGlory(res.item.price, res.currency), inline: true },
              { name: 'Balance', value: formatGlory(res.balance, res.currency), inline: true },
              { name: 'Equip', value: `Use \`/title equip title_id:${res.item.id}\` to show it on your profile.`, inline: false }
            );
          return interaction.reply({ embeds: [embed] });
        });
      }
    }

    if (name === 'inventory') {
      const target = interaction.options.getUser('user') || interaction.user;
      const rows = getInventory(db, interaction.guildId, target.id);
      const user = getUser(db, interaction.guildId, target.id);
      const lines = rows.length ? rows.map(i => `\`${i.item_id}\` — **${i.item_name}**${user.equipped_title === i.item_name ? ' ✅ equipped' : ''}`) : ['No cosmetics owned yet.'];
      const embed = baseEmbed('🎒 HashGoblin Inventory')
        .setDescription(`${target}\n\n${lines.join('\n')}`)
        .addFields({ name: 'Titles', value: 'Cosmetic only. They do not improve odds, payouts or Glory earnings.', inline: false });
      return interaction.reply({ embeds: [embed], ephemeral: target.id === interaction.user.id });
    }

    if (name === 'title') {
      return withUserLock(interaction, async () => {
        const sub = interaction.options.getSubcommand();
        if (sub === 'clear') {
          clearTitle(db, interaction.guildId, interaction.user.id);
          return interaction.reply({ embeds: [baseEmbed('🧹 Title Cleared').setDescription('Your profile now uses the automatic title system again.')], ephemeral: true });
        }
        const titleId = interaction.options.getString('title_id', true);
        const item = equipTitle(db, interaction.guildId, interaction.user.id, titleId);
        return interaction.reply({ embeds: [baseEmbed('🏷️ Title Equipped').setDescription(`${interaction.user} equipped **${item.name}**.`)] });
      });
    }

    if (name === 'achievements') {
      const target = interaction.options.getUser('user') || interaction.user;
      const user = getUser(db, interaction.guildId, target.id);
      const list = achievementList(user);
      const unlocked = list.filter(a => a.unlocked).length;
      const lines = list.map(a => `${a.unlocked ? '✅' : '⬜'} **${a.name}** — ${a.unlocked ? 'unlocked' : a.hint}`);
      const embed = baseEmbed('🏅 HashGoblin Achievements')
        .setDescription(`${target}\n${unlocked}/${list.length} unlocked\n\n${lines.join('\n')}`.slice(0, 3900));
      return interaction.reply({ embeds: [embed] });
    }

    if (name === 'work') {
      return withUserLock(interaction, async () => {
        const res = claimWork(db, interaction.guildId, interaction.user.id);
        const embed = baseEmbed('🧹 Goblin Odd Job')
          .setDescription(`${interaction.user} did a miserable little job for the goblin.`)
          .addFields(
            { name: 'Earned', value: formatGlory(res.amount, res.currency), inline: true },
            { name: 'Balance', value: formatGlory(res.balance, res.currency), inline: true },
            { name: 'Math note', value: `Reward roll: ${res.roll}/9999. This income command is not a casino game and does not create a proof receipt.`, inline: false }
          );
        return interaction.reply({ embeds: [embed] });
      });
    }

    if (name === 'give') {
      assertTransfersEnabled(interaction.guildId);
      return withUserLock(interaction, async () => {
        const target = interaction.options.getUser('user', true);
        if (target.bot) throw new Error('You cannot give Glory to bots.');
        const amount = interaction.options.getInteger('amount', true);
        const res = transfer(db, interaction.guildId, interaction.user.id, target.id, amount);
        const embed = baseEmbed('💸 Glory Transfer')
          .setDescription(`${interaction.user} sent **${formatGlory(amount, res.currency)}** to ${target}.`)
          .addFields(
            { name: 'Received', value: formatGlory(res.received, res.currency), inline: true },
            { name: 'Goblin tax', value: formatGlory(res.fee, res.currency), inline: true }
          );
        return interaction.reply({ embeds: [embed] });
      });
    }


    if (name === 'trade') {
      assertTransfersEnabled(interaction.guildId);
      return withUserLock(interaction, async () => {
        const sub = interaction.options.getSubcommand();
        const settings = getSettings(db, interaction.guildId);
        if (sub === 'create') {
          const target = interaction.options.getUser('user', true);
          if (target.bot) throw new Error('You cannot trade with bots.');
          const amount = interaction.options.getInteger('amount', true);
          const note = interaction.options.getString('note') || '';
          const res = createTrade(db, interaction.guildId, interaction.user.id, target.id, amount, note);
          const embed = baseEmbed('🤝 Trade Offer Created')
            .setDescription(`${interaction.user} offered ${target} **${formatGlory(amount, res.currency)}**.`)
            .addFields(
              { name: 'Trade ID', value: `\`${res.id}\``, inline: true },
              { name: 'Expires', value: '<t:' + Math.floor(new Date(res.expiresAt).getTime() / 1000) + ':R>', inline: true },
              { name: 'Goblin tax', value: 'Applied only if accepted.', inline: true },
              { name: 'Note', value: res.note || 'No note.', inline: false },
              { name: 'Accept', value: `${target} can run \`/trade accept trade_id:${res.id}\`.`, inline: false }
            );
          return interaction.reply({ embeds: [embed] });
        }
        if (sub === 'list') {
          const rows = listPendingTrades(db, interaction.guildId, interaction.user.id);
          const lines = rows.length ? rows.map(t => {
            const direction = t.from_user_id === interaction.user.id ? `to <@${t.to_user_id}>` : `from <@${t.from_user_id}>`;
            return `\`${t.id}\` ${direction} — **${formatGlory(t.amount, settings.currency_name)}** — expires <t:${Math.floor(new Date(t.expires_at).getTime() / 1000)}:R>`;
          }) : ['No pending trades involving you.'];
          const embed = baseEmbed('📜 Pending Trades').setDescription(lines.join('\n'));
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (sub === 'accept' || sub === 'decline') {
          const tradeId = interaction.options.getString('trade_id', true).trim();
          const res = resolveTrade(db, interaction.guildId, tradeId, interaction.user.id, sub === 'accept');
          if (res.status === 'declined') {
            const embed = baseEmbed('❌ Trade Declined')
              .setDescription(`Trade \`${tradeId}\` was declined/cancelled.`);
            return interaction.reply({ embeds: [embed] });
          }
          const embed = baseEmbed('✅ Trade Accepted')
            .setDescription(`<@${res.trade.from_user_id}> sent <@${res.trade.to_user_id}> **${formatGlory(res.trade.amount, res.currency)}**.`)
            .addFields(
              { name: 'Received', value: formatGlory(res.received, res.currency), inline: true },
              { name: 'Goblin tax', value: formatGlory(res.fee, res.currency), inline: true }
            );
          return interaction.reply({ embeds: [embed] });
        }
      });
    }

    if (name === 'coinflip') {
      assertGamblingEnabled(interaction.guildId);
      return withUserLock(interaction, async () => {
        const amount = interaction.options.getInteger('amount', true);
        const side = interaction.options.getString('side', true);
        const record = makeGameRecord(interaction, 'coinflip', amount);
        const result = playCoinflip(record.resultHash, side, amount);
        const economy = applyGame(db, interaction.guildId, interaction.user.id, record, result);
        const embed = gameEmbed({ title: '🪙 Coinflip', interaction, record, result, economy })
          .addFields({ name: 'You picked', value: side, inline: true });
        await maybeAnnounceBigWin(interaction, record, result, economy);
        return interaction.reply({ embeds: [embed] });
      });
    }

    if (name === 'wheelspin') {
      assertGamblingEnabled(interaction.guildId);
      return withUserLock(interaction, async () => {
        const amount = interaction.options.getInteger('amount', true);
        const record = makeGameRecord(interaction, 'wheelspin', amount);
        const result = playWheel(record.resultHash, amount);
        const economy = applyGame(db, interaction.guildId, interaction.user.id, record, result);
        const embed = gameEmbed({ title: '🎡 Goblin Wheelspin', interaction, record, result, economy })
          .addFields({ name: 'Roll', value: `${result.roll} / ${result.rollMax}`, inline: true });
        await maybeAnnounceBigWin(interaction, record, result, economy);
        return interaction.reply({ embeds: [embed] });
      });
    }


    if (name === 'slots') {
      assertGamblingEnabled(interaction.guildId);
      return withUserLock(interaction, async () => {
        const amount = interaction.options.getInteger('amount', true);
        const record = makeGameRecord(interaction, 'slots', amount);
        const result = playSlots(record.resultHash, amount);
        const economy = applyGame(db, interaction.guildId, interaction.user.id, record, result);
        const embed = gameEmbed({ title: '🎰 SHA Slots', interaction, record, result, economy })
          .addFields(
            { name: 'Reels', value: result.details.reels.map(r => r.emoji).join(' '), inline: true },
            { name: 'Multiplier', value: `${result.details.multiplier}x`, inline: true },
            { name: 'Math note', value: 'Each reel is mapped from SHA-256 into weighted symbol ranges. The shown odds come from the exact symbol weights.', inline: false }
          );
        await maybeAnnounceBigWin(interaction, record, result, economy);
        return interaction.reply({ embeds: [embed] });
      });
    }

    if (name === 'lotto') {
      assertGamblingEnabled(interaction.guildId);
      return withUserLock(interaction, async () => {
        const input = interaction.options.getString('numbers');
        const userNumbers = parseLottoNumbers(input);
        const settings = getSettings(db, interaction.guildId);
        const pool = getLottoPool(db, interaction.guildId);
        const record = makeGameRecord(interaction, 'lotto', settings.lotto_ticket_cost);
        const result = playLotto(record.resultHash, userNumbers, { ticketCost: settings.lotto_ticket_cost, jackpot: pool.amount });
        const economy = applyGame(db, interaction.guildId, interaction.user.id, record, result);
        const poolUpdate = settleLottoPool(db, interaction.guildId, interaction.user.id, settings.lotto_ticket_cost, result.details.hitJackpot);
        const embed = gameEmbed({ title: '🎟 HashGoblin Lotto', interaction, record, result, economy })
          .addFields(
            { name: 'Your numbers', value: result.details.ticket.map(n => String(n).padStart(2, '0')).join(' '), inline: false },
            { name: 'Draw', value: result.details.draw.map(n => String(n).padStart(2, '0')).join(' '), inline: false },
            { name: 'Matched', value: result.details.matchedNumbers.length ? result.details.matchedNumbers.join(', ') : 'none', inline: true },
            { name: 'Rolling jackpot', value: result.details.hitJackpot ? `🎉 Jackpot hit for ${formatGlory(poolUpdate.wonAmount, settings.currency_name)}. Pool reset to ${formatGlory(poolUpdate.after, settings.currency_name)}.` : `${formatGlory(poolUpdate.before, settings.currency_name)} → ${formatGlory(poolUpdate.after, settings.currency_name)} (+${formatGlory(poolUpdate.contribution, settings.currency_name)} from this ticket)`, inline: false },
            { name: 'Lotto maths', value: `Pick 6 from 49 = ${Number(LOTTO_TOTAL_COMBOS).toLocaleString('en-GB')} combos. Expected return with this pool is about ${lottoExpectedReturn(pool.amount).toFixed(2)} Glory per ${settings.lotto_ticket_cost} Glory ticket.`, inline: false }
          );
        await maybeAnnounceBigWin(interaction, record, result, economy);
        return interaction.reply({ embeds: [embed] });
      });
    }

    if (name === 'jackpot') {
      const settings = getSettings(db, interaction.guildId);
      const pool = getLottoPool(db, interaction.guildId);
      const contributionPct = (LOTTO_POOL_CONTRIBUTION_BPS / 100).toFixed(0);
      const lastWin = pool.last_won_by
        ? `<@${pool.last_won_by}> won ${formatGlory(pool.last_won_amount, settings.currency_name)} ${pool.last_won_at ? `<t:${Math.floor(new Date(pool.last_won_at).getTime() / 1000)}:R>` : ''}`
        : 'No jackpot winner yet.';
      const embed = baseEmbed('🎟 Rolling Lotto Jackpot')
        .setDescription(`Current pool: **${formatGlory(pool.amount, settings.currency_name)}**`)
        .addFields(
          { name: 'Ticket cost', value: formatGlory(settings.lotto_ticket_cost, settings.currency_name), inline: true },
          { name: 'Pool growth', value: `${contributionPct}% of every ticket feeds the jackpot.`, inline: true },
          { name: 'Base reset', value: formatGlory(DEFAULT_LOTTO_JACKPOT, settings.currency_name), inline: true },
          { name: 'Last jackpot', value: lastWin, inline: false },
          { name: 'Odds', value: `Match 6 is 1 in ${Number(LOTTO_TOTAL_COMBOS).toLocaleString('en-GB')}. Use \`/odds game:lotto\` for the full tier table.`, inline: false }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (name === 'hashjackpot') {
      assertGamblingEnabled(interaction.guildId);
      return withUserLock(interaction, async () => {
        const amount = interaction.options.getInteger('amount', true);
        const record = makeGameRecord(interaction, 'hashjackpot', amount);
        const result = playHashJackpot(record.resultHash, amount);
        const economy = applyGame(db, interaction.guildId, interaction.user.id, record, result);
        const embed = gameEmbed({ title: '💀 HashJackpot', interaction, record, result, economy })
          .addFields(
            { name: 'Hash preview', value: `\`${record.resultHash.slice(0, 18)}...\``, inline: false },
            { name: 'Why this is rare', value: 'Each leading hex zero is a 1 in 16 hit. More zeroes = exponentially rarer.', inline: false }
          );
        await maybeAnnounceBigWin(interaction, record, result, economy);
        return interaction.reply({ embeds: [embed] });
      });
    }

    if (name === 'leaderboard') {
      const type = interaction.options.getString('type') || 'balance';
      const scope = interaction.options.getString('scope') || 'server';
      const cfg = LEADERBOARD_TYPES[type];
      if (!cfg) throw new Error('Invalid leaderboard type.');
      if (!['server', 'global'].includes(scope)) throw new Error('Invalid leaderboard scope.');
      const settings = getSettings(db, interaction.guildId);
      const rows = getLeaderboardRows(type, scope, interaction.guildId);
      const lines = rows.length
        ? rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${formatGlory(r.score, settings.currency_name)}`)
        : ['No goblins yet.'];
      const embed = baseEmbed(scope === 'global' ? '🌍 Global HashGoblin Leaderboard' : '🏆 Server HashGoblin Leaderboard')
        .setDescription(lines.join('\n'))
        .addFields(
          { name: 'Board', value: cfg.label, inline: true },
          { name: 'Scope', value: scope === 'global' ? 'Global across all servers' : 'This server only', inline: true },
          { name: 'Note', value: 'Global boards aggregate verified economy stats by Discord user ID. They do not expose server names.', inline: false }
        );
      return interaction.reply({ embeds: [embed] });
    }


    if (name === 'greetings') {
      assertManageGuild(interaction);
      const sub = interaction.options.getSubcommand();
      const settings = getSettings(db, interaction.guildId);
      if (sub === 'view') {
        const embed = baseEmbed('👋 HashGoblin Greetings')
          .setDescription('Welcome and goodbye messages for this server.')
          .addFields(
            { name: 'Status', value: greetingSummary(settings), inline: false },
            { name: 'Welcome message', value: settings.welcome_message || 'Default welcome template', inline: false },
            { name: 'Goodbye message', value: settings.goodbye_message || 'Default goodbye template', inline: false }
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      if (sub === 'autorole') {
        const role = interaction.options.getRole('role');
        const enabled = interaction.options.getBoolean('enabled');
        const next = updateMemberRole(db, interaction.guildId, interaction.user.id, {
          roleId: role ? role.id : undefined,
          enabled: enabled === null ? undefined : enabled
        });
        const embed = baseEmbed('✅ Member Auto-Role Updated')
          .addFields(
            { name: 'Status', value: greetingSummary(next), inline: false },
            { name: 'Role safety note', value: "HashGoblin needs Manage Roles, and the selected role must be below the bot's highest role in Discord role settings.", inline: false }
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      const kind = sub;
      const channel = interaction.options.getChannel('channel');
      const enabled = interaction.options.getBoolean('enabled');
      const message = interaction.options.getString('message');
      const next = updateGreeting(db, interaction.guildId, interaction.user.id, kind, {
        channelId: channel ? channel.id : undefined,
        enabled: enabled === null ? undefined : enabled,
        message: message === null ? undefined : message
      });
      const embed = baseEmbed(kind === 'welcome' ? '✅ Welcome Greeting Updated' : '✅ Goodbye Greeting Updated')
        .addFields(
          { name: 'Status', value: greetingSummary(next), inline: false },
          { name: 'Message', value: next[`${kind}_message`] || 'Default template', inline: false }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }


    if (name === 'admin') {
      assertManageGuild(interaction);
      const sub = interaction.options.getSubcommand();
      if (sub === 'settings') {
        const settings = getSettings(db, interaction.guildId);
        const embed = baseEmbed('⚙️ HashGoblin Settings')
          .setDescription('Current server economy settings.')
          .addFields({ name: 'Settings', value: `\`${settingsSummary(settings)}\``, inline: false });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      if (sub === 'logs') {
        const rows = getAdminLogs(interaction.guildId);
        const lines = rows.length ? rows.map(r => `#${r.id} <@${r.admin_user_id}> ${r.action}${r.target_user_id ? ` → <@${r.target_user_id}>` : ''}${r.amount !== null && r.amount !== undefined ? ` (${r.amount})` : ''} <t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>`) : ['No admin logs yet.'];
        const embed = baseEmbed('🛠️ Recent Admin Logs').setDescription(lines.join('\n'));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      if (sub === 'ledger') {
        const target = interaction.options.getUser('user', true);
        const rows = getUserLedger(interaction.guildId, target.id);
        const settings = getSettings(db, interaction.guildId);
        const lines = rows.length ? rows.map(r => `${r.change_amount >= 0 ? '+' : ''}${formatGlory(r.change_amount, settings.currency_name)} — ${r.reason}${r.game_id ? ` (${r.game_id})` : ''} <t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>`) : ['No ledger entries for this user yet.'];
        const embed = baseEmbed('📒 User Ledger')
          .setDescription(`${target}'s recent wallet ledger entries.`)
          .addFields({ name: 'Recent entries', value: lines.join('\n').slice(0, 3900), inline: false });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      if (sub === 'bigwin') {
        const channel = interaction.options.getChannel('channel');
        const enabled = interaction.options.getBoolean('enabled');
        const threshold = interaction.options.getInteger('threshold');
        getSettings(db, interaction.guildId);
        if (channel) db.prepare('UPDATE guild_settings SET big_win_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?').run(channel.id, interaction.guildId);
        if (enabled !== null) db.prepare('UPDATE guild_settings SET big_win_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?').run(enabled ? 1 : 0, interaction.guildId);
        if (threshold !== null) db.prepare('UPDATE guild_settings SET big_win_threshold = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?').run(threshold, interaction.guildId);
        db.prepare('INSERT INTO admin_logs (guild_id, admin_user_id, action, details) VALUES (?, ?, ?, ?)')
          .run(interaction.guildId, interaction.user.id, 'bigwin_update', JSON.stringify({ channel: channel ? channel.id : undefined, enabled, threshold }));
        const settings = getSettings(db, interaction.guildId);
        const embed = baseEmbed('🚨 Big Win Announcements')
          .addFields(
            { name: 'Enabled', value: settings.big_win_enabled ? 'Yes' : 'No', inline: true },
            { name: 'Channel', value: settings.big_win_channel_id ? `<#${settings.big_win_channel_id}>` : 'Not set', inline: true },
            { name: 'Threshold', value: formatGlory(settings.big_win_threshold, settings.currency_name), inline: true }
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      if (sub === 'set') {
        const setting = interaction.options.getString('setting', true);
        const value = interaction.options.getString('value', true);
        const settings = updateGuildSetting(db, interaction.guildId, interaction.user.id, setting, value);
        const embed = baseEmbed('✅ HashGoblin Setting Updated')
          .setDescription(`Updated \`${setting}\`.`)
          .addFields({ name: 'Current settings', value: `\`${settingsSummary(settings)}\``, inline: false });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      if (sub === 'balance') {
        const target = interaction.options.getUser('user', true);
        const mode = interaction.options.getString('mode', true);
        const amount = interaction.options.getInteger('amount', true);
        const reason = interaction.options.getString('reason') || '';
        const res = adminAdjustBalance(db, interaction.guildId, interaction.user.id, target.id, mode, amount, reason);
        const embed = baseEmbed('🛠️ Admin Balance Update')
          .setDescription(`${target}'s balance was updated.`)
          .addFields(
            { name: 'Mode', value: mode, inline: true },
            { name: 'Old balance', value: formatGlory(res.oldBalance, res.currency), inline: true },
            { name: 'New balance', value: formatGlory(res.balance, res.currency), inline: true },
            { name: 'Delta', value: formatGlory(res.delta, res.currency), inline: true },
            { name: 'Reason', value: reason || 'No reason provided.', inline: false }
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }


    if (name === 'odds') {
      const game = interaction.options.getString('game', true);
      const summary = oddsSummaryFor(game);
      const embed = baseEmbed(summary.title)
        .setDescription('Exact odds and edge notes for HashGoblin games. Results are mapped from SHA-256 hashes into these probability ranges.')
        .addFields(
          { name: 'Expected return', value: summary.expectedReturn, inline: false },
          { name: 'Bot edge', value: summary.edge, inline: true }
        );
      const chunks = chunkLines(summary.lines);
      chunks.forEach((chunk, i) => embed.addFields({ name: i === 0 ? 'Odds table' : `Odds table ${i + 1}`, value: chunk, inline: false }));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (name === 'proof') {
      const gameId = interaction.options.getString('game_id', true).trim();
      const game = db.prepare('SELECT * FROM games WHERE id = ? AND guild_id = ?').get(gameId, interaction.guildId);
      if (!game) throw new Error('No game found with that proof ID in this server.');
      const verified = verifyStoredGame(game);
      const result = JSON.parse(game.result_json);
      const embed = baseEmbed('🧾 SHA-256 Proof Receipt')
        .setDescription(`Proof for **${game.game_type}** by <@${game.user_id}>.`)
        .addFields(
          { name: 'Game ID', value: `\`${game.id}\``, inline: false },
          { name: 'Server seed hash', value: `\`${game.server_seed_hash}\``, inline: false },
          { name: 'Server seed', value: `\`${game.server_seed}\``, inline: false },
          { name: 'Client seed', value: `\`${game.client_seed}\``, inline: false },
          { name: 'Result hash', value: `\`${game.result_hash}\``, inline: false },
          { name: 'Roll / result', value: `${game.roll ?? 'n/a'} → ${JSON.stringify(result).slice(0, 900)}`, inline: false },
          { name: 'Verified', value: verified.seedHashOk && verified.resultHashOk ? '✅ yes' : '❌ failed', inline: true }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    const payload = { content: `⚠️ ${err.message || 'Something went wrong.'}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
  }
});

client.login(token);
