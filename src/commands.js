'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('balance').setDescription('Check your Glory balance.')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),

  new SlashCommandBuilder().setName('vault').setDescription('Protect Glory in your vault or withdraw it back to your wallet.')
    .addSubcommand(sc => sc.setName('view').setDescription('View your wallet, vault and net worth.')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(sc => sc.setName('deposit').setDescription('Move wallet Glory into your vault.')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to deposit').setRequired(true).setMinValue(1)))
    .addSubcommand(sc => sc.setName('withdraw').setDescription('Move vaulted Glory back into your wallet.')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to withdraw').setRequired(true).setMinValue(1))),

  new SlashCommandBuilder().setName('profile').setDescription('Show a HashGoblin profile card.')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),

  new SlashCommandBuilder().setName('rank').setDescription('Show your server and global HashGoblin rank.')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),

  new SlashCommandBuilder().setName('stats').setDescription('Show HashGoblin economy stats for this server or globally.')
    .addStringOption(o => o.setName('scope').setDescription('Stats scope').setRequired(false)
      .addChoices({ name: 'Server', value: 'server' }, { name: 'Global', value: 'global' })),

  new SlashCommandBuilder().setName('recent').setDescription('Show recent HashGoblin games in this server.'),

  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily Glory.'),


  new SlashCommandBuilder().setName('help').setDescription('Show the main HashGoblin commands and safety notes.'),

  new SlashCommandBuilder().setName('about').setDescription('Explain HashGoblin, Glory and SHA-256 receipts in simple terms.'),

  new SlashCommandBuilder().setName('botstatus').setDescription('Show deploy/test status for HashGoblin.'),

  new SlashCommandBuilder().setName('shop').setDescription('View or buy cosmetic HashGoblin titles.')
    .addSubcommand(sc => sc.setName('view').setDescription('View cosmetic titles available for Glory.'))
    .addSubcommand(sc => sc.setName('buy').setDescription('Buy a cosmetic title.')
      .addStringOption(o => o.setName('title_id').setDescription('Title ID from /shop view').setRequired(true))),

  new SlashCommandBuilder().setName('inventory').setDescription('View owned HashGoblin cosmetics.')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),

  new SlashCommandBuilder().setName('title').setDescription('Equip or clear your displayed HashGoblin title.')
    .addSubcommand(sc => sc.setName('equip').setDescription('Equip an owned title.')
      .addStringOption(o => o.setName('title_id').setDescription('Owned title ID').setRequired(true)))
    .addSubcommand(sc => sc.setName('clear').setDescription('Clear your equipped cosmetic title.')),

  new SlashCommandBuilder().setName('achievements').setDescription('Show HashGoblin achievement progress.')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),

  new SlashCommandBuilder().setName('work').setDescription('Do an hourly goblin odd job for a small amount of Glory.'),

  new SlashCommandBuilder().setName('give').setDescription('Give Glory to another server member. Goblin tax applies.')
    .addUserOption(o => o.setName('user').setDescription('Who to give Glory to').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount of Glory to send').setRequired(true).setMinValue(10)),

  new SlashCommandBuilder().setName('trade').setDescription('Create, accept or decline pending Glory trades.')
    .addSubcommand(sc => sc.setName('create').setDescription('Offer Glory to another member for manual acceptance.')
      .addUserOption(o => o.setName('user').setDescription('Who receives the trade offer').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount of Glory to offer').setRequired(true).setMinValue(10))
      .addStringOption(o => o.setName('note').setDescription('Optional note').setRequired(false)))
    .addSubcommand(sc => sc.setName('accept').setDescription('Accept a pending trade sent to you.')
      .addStringOption(o => o.setName('trade_id').setDescription('Trade ID').setRequired(true)))
    .addSubcommand(sc => sc.setName('decline').setDescription('Decline/cancel a pending trade you are part of.')
      .addStringOption(o => o.setName('trade_id').setDescription('Trade ID').setRequired(true)))
    .addSubcommand(sc => sc.setName('list').setDescription('List pending trades involving you.')),

  new SlashCommandBuilder().setName('coinflip').setDescription('Flip a SHA-256 coin with a 2.5% house edge.')
    .addIntegerOption(o => o.setName('amount').setDescription('Bet amount').setRequired(true).setMinValue(10))
    .addStringOption(o => o.setName('side').setDescription('Heads or tails').setRequired(true)
      .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),

  new SlashCommandBuilder().setName('wheelspin').setDescription('Spin the Goblin Wheel using SHA-256 odds.')
    .addIntegerOption(o => o.setName('amount').setDescription('Bet amount').setRequired(true).setMinValue(10)),

  new SlashCommandBuilder().setName('slots').setDescription('Spin SHA-256 slot reels with exact odds.')
    .addIntegerOption(o => o.setName('amount').setDescription('Bet amount').setRequired(true).setMinValue(10)),

  new SlashCommandBuilder().setName('lotto').setDescription('Buy an instant HashGoblin Lotto ticket. Pick 6 from 1-49 or quickpick.')
    .addStringOption(o => o.setName('numbers').setDescription('Optional 6 unique numbers, e.g. 4 12 19 31 44 48').setRequired(false)),

  new SlashCommandBuilder().setName('jackpot').setDescription('Show the current rolling HashGoblin Lotto jackpot pool.'),

  new SlashCommandBuilder().setName('hashjackpot').setDescription('High-variance leading-zero hash game.')
    .addIntegerOption(o => o.setName('amount').setDescription('Bet amount').setRequired(true).setMinValue(10)),

  new SlashCommandBuilder().setName('leaderboard').setDescription('Show the richest or luckiest Glory goblins.')
    .addStringOption(o => o.setName('type').setDescription('Leaderboard type').setRequired(false)
      .addChoices(
        { name: 'Wallet Balance', value: 'balance' },
        { name: 'Net Worth', value: 'net_worth' },
        { name: 'Biggest Win', value: 'biggest_win' },
        { name: 'Lifetime Won', value: 'lifetime_won' },
        { name: 'Lifetime Bet', value: 'lifetime_bet' },
        { name: 'Net Profit', value: 'net_profit' }
      ))
    .addStringOption(o => o.setName('scope').setDescription('Leaderboard scope').setRequired(false)
      .addChoices({ name: 'Server', value: 'server' }, { name: 'Global', value: 'global' })),



  new SlashCommandBuilder().setName('odds').setDescription('Show exact odds, expected return and bot edge for a HashGoblin game.')
    .addStringOption(o => o.setName('game').setDescription('Game to explain').setRequired(true)
      .addChoices(
        { name: 'Coinflip', value: 'coinflip' },
        { name: 'Wheelspin', value: 'wheelspin' },
        { name: 'Slots', value: 'slots' },
        { name: 'Lotto', value: 'lotto' },
        { name: 'HashJackpot', value: 'hashjackpot' }
      )),
  new SlashCommandBuilder().setName('proof').setDescription('Show the SHA-256 receipt for a game.')
    .addStringOption(o => o.setName('game_id').setDescription('Proof/game ID, e.g. HG-ABC123').setRequired(true)),

  new SlashCommandBuilder().setName('greetings').setDescription('Configure HashGoblin welcome and goodbye messages.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc.setName('view').setDescription('View current welcome/goodbye settings.'))
    .addSubcommand(sc => sc.setName('welcome').setDescription('Configure the welcome message.')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post welcomes in').setRequired(false))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable welcomes').setRequired(false))
      .addStringOption(o => o.setName('message').setDescription('Template. Supports {user}, {server}, {currency}, {memberCount}').setRequired(false).setMaxLength(900)))
    .addSubcommand(sc => sc.setName('goodbye').setDescription('Configure the goodbye message.')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post goodbyes in').setRequired(false))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable goodbyes').setRequired(false))
      .addStringOption(o => o.setName('message').setDescription('Template. Supports {userTag}, {server}, {currency}, {memberCount}').setRequired(false).setMaxLength(900)))
    .addSubcommand(sc => sc.setName('autorole').setDescription('Automatically give new members a selected role.')
      .addRoleOption(o => o.setName('role').setDescription('Role to give new members').setRequired(false))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable the member auto-role').setRequired(false))),

  new SlashCommandBuilder().setName('admin').setDescription('Admin economy tools for HashGoblin.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc.setName('balance').setDescription('Add, remove or set a user balance.')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption(o => o.setName('mode').setDescription('Adjustment mode').setRequired(true)
        .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }, { name: 'Set', value: 'set' }))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(0))
      .addStringOption(o => o.setName('reason').setDescription('Optional reason').setRequired(false)))
    .addSubcommand(sc => sc.setName('settings').setDescription('View current HashGoblin settings.'))
    .addSubcommand(sc => sc.setName('set').setDescription('Update an economy setting.')
      .addStringOption(o => o.setName('setting').setDescription('Setting to update').setRequired(true)
        .addChoices(
          { name: 'Currency name', value: 'currency_name' },
          { name: 'Daily amount', value: 'daily_amount' },
          { name: 'Max bet percent', value: 'max_bet_percent' },
          { name: 'Transfer fee bps', value: 'transfer_fee_bps' },
          { name: 'Min bet', value: 'min_bet' },
          { name: 'Max bet absolute', value: 'max_bet_absolute' },
          { name: 'Lotto ticket cost', value: 'lotto_ticket_cost' },
          { name: 'Gambling enabled', value: 'gambling_enabled' },
          { name: 'Transfers enabled', value: 'transfers_enabled' },
          { name: 'Big win enabled', value: 'big_win_enabled' },
          { name: 'Big win threshold', value: 'big_win_threshold' }
        ))
      .addStringOption(o => o.setName('value').setDescription('New value').setRequired(true)))
    .addSubcommand(sc => sc.setName('logs').setDescription('Show recent HashGoblin admin actions.'))
    .addSubcommand(sc => sc.setName('ledger').setDescription('Show recent ledger entries for a user.')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)))
    .addSubcommand(sc => sc.setName('bigwin').setDescription('Configure big-win announcement channel.')
      .addChannelOption(o => o.setName('channel').setDescription('Channel for big win posts').setRequired(false))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable big-win announcements').setRequired(false))
      .addIntegerOption(o => o.setName('threshold').setDescription('Minimum profit to announce').setRequired(false).setMinValue(1)))
];

module.exports = commands;
