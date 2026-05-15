# HashGoblin logic

## Core rule

The bot does not just call `Math.random()` and say you won. Each game result comes from a SHA-256 proof flow.

```txt
serverSeed + clientSeed + nonce
↓
SHA-256
↓
resultHash
↓
uniform roll / game-specific mapping
↓
outcome + odds + proof ID
```

## Why SHA-256 works here

SHA-256 produces a 256-bit hash that looks random if the seed is unknown. The bot uses Node's cryptographic random generator for the server seed, then maps the hash to a game roll.

For wheel games, the hash is mapped to a number from `0` to `99,999`. That gives a clear 100,000-position probability table.

## Wheelspin odds

| Range | Outcome | Positions | Chance | Multiplier |
|---:|---|---:|---:|---:|
| 0-39,999 | Lose | 40,000 | 40% | 0x |
| 40,000-64,999 | Half back | 25,000 | 25% | 0.5x |
| 65,000-84,999 | Refund | 20,000 | 20% | 1x |
| 85,000-94,999 | Double | 10,000 | 10% | 2x |
| 95,000-98,999 | Fivefold | 4,000 | 4% | 5x |
| 99,000-99,899 | Tenfold | 900 | 0.9% | 10x |
| 99,900-99,989 | Fifty Goblins | 90 | 0.09% | 50x |
| 99,990-99,999 | Hundred Goblins | 10 | 0.01% | 100x |

Expected return is about 87%, so the bot edge is about 13%.

## Coinflip odds

Roll is `0-9999`:

```txt
0-4999 = heads
5000-9999 = tails
```

Odds are 50/50. The edge comes from payout: a win pays 1.95x total, not 2x. That gives 97.5% expected return and 2.5% bot edge.

## Lotto odds

HashGoblin Lotto uses pick 6 from 49.

```txt
C(49, 6) = 13,983,816 possible tickets
```

The odds of matching exactly `k` numbers are:

```txt
C(6, k) × C(43, 6-k) / C(49, 6)
```

The v0.1 instant lotto prize table is intentionally harsh, around 50 Glory expected return per 100 Glory ticket. This makes it feel like a lotto and keeps the fake economy from inflating too quickly.

## HashJackpot odds

A SHA-256 hash is shown in hex. Each hex character has 16 possible values.

```txt
P(h leading hex zeroes) = 1 / 16^h
```

Examples:

```txt
2 zeroes = 1 in 256
3 zeroes = 1 in 4,096
4 zeroes = 1 in 65,536
5 zeroes = 1 in 1,048,576
6 zeroes = 1 in 16,777,216
```
