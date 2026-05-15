# Rolling Lotto Jackpot

HashGoblin v0.7 adds a server-specific rolling Lotto jackpot pool.

## Commands

```txt
/lotto [numbers]
/jackpot
/odds game:lotto
```

`/lotto` still works as an instant SHA-256 lotto ticket. Users can provide six unique numbers from 1-49, or leave the numbers blank for a quickpick.

`/jackpot` shows the current server pool, the ticket cost, the pool growth rule and the last jackpot winner.

## Pool rules

Default behaviour:

```txt
Base pool: 100,000 Glory
Ticket cost: server setting, default 100 Glory
Pool contribution: 30% of every non-jackpot ticket
Match 6 prize: current rolling pool
After jackpot hit: pool resets to 100,000 Glory
```

The jackpot is per Discord server. This keeps server economies separate while global leaderboards still aggregate user stats.

## Maths

HashGoblin Lotto uses 6 numbers from 1-49:

```txt
C(49, 6) = 13,983,816 combinations
```

The chance of matching exactly `k` numbers is:

```txt
C(6, k) * C(43, 6-k) / C(49, 6)
```

So match 6 is:

```txt
1 in 13,983,816
```

## Proof logic

The rolling pool does not change the randomness.

The draw still comes from:

```txt
server seed + client seed + nonce -> SHA-256 -> lotto draw
```

The pool only changes the prize paid when the SHA-256 draw produces a match 6.

## Why this is better than a flat prize

A fixed huge jackpot can inflate the economy from nowhere.

A rolling pool feels more like a real Discord economy event:

```txt
People buy tickets
Pool grows slowly
Someone eventually hits match 6
Server gets a big event
Pool resets
```

Glory is still fake arcade currency. It cannot be bought, sold, withdrawn or redeemed.
