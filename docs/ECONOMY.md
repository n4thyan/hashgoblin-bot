# Glory economy

Glory is the fake Discord currency used by HashGoblin.

## Defaults

```txt
Starting balance: 1,000 Glory
Daily claim: 750 Glory
Daily streak bonus: +100/day, capped at +1,500
Minimum transfer: 10 Glory
Transfer fee: 2%
Minimum bet: 10 Glory
Max bet: 25% of balance, capped at 50,000 Glory
```

## Why the bot has an edge

The bot has a house edge because otherwise a fake server economy inflates forever. Since Glory can be transferred, the economy needs sinks.

Sinks in v0.1:

- losing bets
- wheel/lotto edge
- 2% transfer Goblin tax

## Trading

v0.1 includes `/give`, not full item trading yet. A proper `/trade` command makes more sense once the bot has shop items, badges, titles or cosmetics.
