# Odds command

HashGoblin v0.6 adds:

```txt
/odds game:coinflip
/odds game:wheelspin
/odds game:slots
/odds game:lotto
/odds game:hashjackpot
```

The point of this command is transparency. HashGoblin is a fake Discord economy/casino bot, but the bot should still explain the maths instead of hiding it.

## How the games get results

Every game creates a SHA-256 proof:

```txt
server seed + client seed + nonce
↓
SHA-256 result hash
↓
converted into a roll
↓
mapped into a result range
```

For example, wheelspin rolls from 0 to 99,999. If a wheel segment owns 10,000 of those positions, it has a 10% chance.

## Expected return

Expected return is:

```txt
sum(probability × payout)
```

If a game returns 97.5 Glory per 100 Glory bet on average, the bot edge is 2.5%.

## Why this matters

HashGoblin has a bot edge so the server economy does not inflate forever, but users should be able to see the edge. The odds command turns each game into a visible maths table.

## Game notes

- Coinflip keeps the odds 50/50 and applies edge through the payout.
- Wheelspin maps SHA-256 rolls into fixed weighted ranges.
- Slots use weighted reels, so rare symbols are genuinely rarer.
- Lotto uses combination maths: C(49, 6).
- HashJackpot uses leading hex zeroes: each extra zero is another 1 in 16 condition.
