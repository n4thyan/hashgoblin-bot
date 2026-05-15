# Global Leaderboards

HashGoblin v0.2 adds global boards alongside normal server boards.

## What global means

A server board only ranks users inside the current Discord server.

A global board aggregates the same Discord user ID across every server that is running this bot instance.

Example:

```txt
Server A balance: 2,000 Glory
Server B balance: 5,000 Glory
Global balance: 7,000 Glory
```

Global boards do **not** expose server names. They only show Discord users and their aggregated score.

## Commands

```txt
/leaderboard scope:server type:balance
/leaderboard scope:global type:balance
/rank
/stats scope:global
```

## Supported boards

```txt
Balance       = sum of Glory balances
Biggest Win   = largest single profit
Lifetime Won  = total positive profit
Lifetime Bet  = total amount wagered
Net Profit    = lifetime won minus lifetime lost
```

For global boards:

```txt
balance      = SUM(balance)
biggest_win  = MAX(biggest_win)
lifetime_won = SUM(lifetime_won)
lifetime_bet = SUM(lifetime_bet)
net_profit   = SUM(lifetime_won - lifetime_lost)
```

## Privacy note

The bot stores Discord user IDs because it must track balances and game history. Global boards aggregate those IDs across servers. Server names are not shown on the global board.

If you later want server owners to opt out of global boards, add a `global_leaderboards_enabled` flag to `guild_settings` and filter global queries to opted-in guilds only.
