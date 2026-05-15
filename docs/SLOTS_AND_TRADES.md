# Slots and Trades

## `/slots`

`/slots` uses the same SHA-256 proof system as the other casino commands.

Flow:

```txt
serverSeed + clientSeed + nonce
↓
SHA-256 result hash
↓
three weighted reel rolls
↓
slot symbols + multiplier + exact odds
```

The reels use weighted symbols:

```txt
🍒 Cherry   300 / 1000
🍋 Lemon    240 / 1000
🔔 Bell     180 / 1000
💎 Diamond  120 / 1000
7️⃣ Seven     80 / 1000
🧌 Goblin    50 / 1000
0️⃣ Zero      30 / 1000
```

Payouts:

```txt
Any two matching: 0.75x
Triple Cherry:    5x
Triple Lemon:     10x
Triple Bell:      20x
Triple Diamond:   40x
Triple Seven:     100x
Triple Goblin:    250x
Triple Zero:      1000x
```

Expected return is calculated by enumerating every possible 3-reel symbol combination. In v0.4 it is around 91.75%, so the bot edge is around 8.25%.

## `/trade`

`/trade` is safer than instant giving when users want another member to confirm a transfer.

Commands:

```txt
/trade create user amount [note]
/trade accept trade_id
/trade decline trade_id
/trade list
```

Trade rules:

```txt
- Trades expire after 10 minutes.
- Only the receiving user can accept.
- Either participant can decline/cancel.
- Funds are not reserved when created.
- If the sender no longer has enough Glory when accepted, the trade fails.
- Goblin tax applies only when the trade is accepted.
```

For instant transfers, use `/give`.
