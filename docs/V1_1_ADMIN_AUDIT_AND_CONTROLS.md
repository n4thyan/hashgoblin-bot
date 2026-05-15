# v1.1 Admin Audit and Server Controls

HashGoblin v1.1 adds practical server controls for testing and public deployment.

## Disable gambling temporarily

```txt
/admin set setting:gambling_enabled value:false
/admin set setting:gambling_enabled value:true
```

When disabled, the casino-style game commands reject new plays:

- `/coinflip`
- `/wheelspin`
- `/slots`
- `/lotto`
- `/hashjackpot`

Economy/profile commands such as `/balance`, `/daily`, `/work`, `/vault`, `/leaderboard` and `/proof` still work.

## Disable transfers temporarily

```txt
/admin set setting:transfers_enabled value:false
/admin set setting:transfers_enabled value:true
```

This blocks:

- `/give`
- `/trade create`
- `/trade accept`
- `/trade decline`
- `/trade list`

Use this if alt farming or suspicious movement appears while you review the ledger.

## Big-win announcements

```txt
/admin bigwin channel:#casino-wins enabled:true threshold:100000
```

When a user hits a profit above the threshold, HashGoblin posts a public announcement with:

- game type
- profit
- payout
- odds
- proof ID

The result is still backed by the saved SHA-256 receipt.

## Admin logs

```txt
/admin logs
```

Shows recent admin changes, including economy setting edits, balance adjustments and big-win configuration.

## User ledger

```txt
/admin ledger user:@Nathan
```

Shows recent wallet ledger entries for a user. This is useful for tracing:

- daily claims
- game bets
- game payouts
- transfers
- trades
- admin balance edits
- vault movements

The ledger is not a full anti-abuse system by itself, but it gives moderators a quick paper trail without opening the database manually.
