# Testing HashGoblin

Run all local checks:

```bash
npm run preflight
```

This runs:

- JS syntax checks
- SHA-256/game maths selftest
- SQLite economy smoke test
- release packaging checks

Register slash commands in a test server first by setting `DISCORD_GUILD_ID` in `.env`, then:

```bash
npm run deploy
npm start
```

Good first Discord tests:

```txt
/botstatus
/help
/about
/balance
/daily
/odds game:lotto
/coinflip amount:10 side:heads
/proof game_id:<the returned proof id>
/greetings autorole role:@Member enabled:true
```
