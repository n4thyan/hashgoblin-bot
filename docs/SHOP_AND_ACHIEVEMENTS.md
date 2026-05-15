# Shop, Titles and Achievements

HashGoblin v0.5 adds a cosmetic progression layer on top of the Glory economy.

## Why cosmetics instead of paid boosts?

Titles are cosmetic only. They do not improve odds, reduce house edge, increase payouts, or change SHA-256 proofs.

That keeps HashGoblin fair: the maths stays the same for everyone.

## Commands

```txt
/shop view
/shop buy title_id:hash_goblin
/inventory
/title equip title_id:hash_goblin
/title clear
/achievements
```

## Shop titles

Current title IDs:

```txt
hash_goblin
zero_hunter
wheel_gremlin
lotto_menace
proof_lord
glory_hoarder
```

Titles are bought with Glory and stored per server.

## Achievement logic

Achievements are calculated from existing economy stats, such as:

```txt
lifetime_bet
biggest_win
daily_streak
balance
net_profit
```

They are intentionally lightweight in v0.5. A later version can store unlocked dates and announce new unlocks.

## Economy note

The shop acts as a Glory sink. This helps remove currency from the economy without making the casino games harsher.
