# HashGoblin Admin Tools

v0.3 adds basic server moderation and economy controls. These commands require Discord's **Manage Server** permission.

## View settings

```txt
/admin settings
```

Shows the current server economy configuration.

## Change settings

```txt
/admin set setting:currency_name value:Glory
/admin set setting:daily_amount value:750
/admin set setting:max_bet_percent value:25
/admin set setting:transfer_fee_bps value:200
/admin set setting:min_bet value:10
/admin set setting:max_bet_absolute value:50000
/admin set setting:lotto_ticket_cost value:100
```

`transfer_fee_bps` uses basis points. `200` means 2%.

## Adjust balances

```txt
/admin balance user:@Nathan mode:add amount:1000 reason:event prize
/admin balance user:@Nathan mode:remove amount:500 reason:moderation
/admin balance user:@Nathan mode:set amount:1000 reason:economy reset
```

Every admin adjustment writes to the ledger and admin log.

## Safety notes

- Admin tools are intentionally ephemeral where possible.
- Do not use admin balance tools as normal gameplay rewards unless you want manual event prizes.
- Keep a copy of the SQLite database before major changes.
- Glory has no real-world value and should never be sold, exchanged, or redeemed.
