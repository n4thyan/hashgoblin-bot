# Profiles and Work

v0.3 adds light RPG/economy features that make HashGoblin feel more alive without turning it into a full shop system yet.

## /profile

Shows a user's:

- Balance
- Goblin title
- Net profit
- Daily streak
- Lifetime bet/won/lost
- Biggest win

Titles are derived from stats, for example:

- Fresh Goblin
- Hash Gambler
- Glory Hoarder
- Profit Gremlin
- Jackpot Menace
- Mythic Goblin

## /work

Hourly small income command. This gives players a non-gambling way to earn Glory if they go broke.

The reward is currently 150-500 Glory. It uses a SHA-256-derived roll internally, but it is not a casino game and does not create a public proof receipt.

## /recent

Shows recent games in the current server with proof IDs, bets, profit/loss and odds.

This helps the server feel active and makes `/proof` easier to discover.
