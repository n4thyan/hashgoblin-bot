# Changelog

## v1.2.0

- Added deployment-safe `.env.ready.example` with the public Discord application/server IDs prefilled.
- Added Discord setup docs for the current HashGoblin application and test server.
- Added strong token-reset warnings after setup token exposure.
- No real bot token is included in the package.

# HashGoblin Bot Changelog

## v1.1.0

Post-v1 deploy polish and moderation update.

- Added server switches for gambling and transfers/trades.
- Added configurable big-win announcement channel and threshold.
- Added `/admin bigwin` for announcement setup.
- Added `/admin logs` for recent admin actions.
- Added `/admin ledger` for recent user currency ledger entries.
- Added big-win announcements for coinflip, wheelspin, slots, lotto and HashJackpot.
- Fixed duplicated fields in `/profile`.
- Expanded `/botstatus` and `/admin settings` output.
- Added database migrations for new server settings.
- Kept SHA-256 proof, odds and ledger logic intact.

## v1.0.0

Launch-ready base with Discord slash commands, Glory economy, SHA-256 proof games, Lotto, slots, leaderboards, vault, greetings, member auto-role, PM2/Docker support and test scripts.
