# HashGoblin Bot v1.0

HashGoblin is a Discord economy bot where users gamble fake server currency called **Glory**. Every casino-style result is generated from SHA-256 proof logic, so games have receipts instead of “trust me bro” randomness.

Glory has **no real-world value**. It cannot be bought, sold, withdrawn, cashed out or redeemed.

## Commands

### Core economy

- `/balance`
- `/daily`
- `/work`
- `/vault view/deposit/withdraw`
- `/give`
- `/trade create/accept/decline/list`
- `/leaderboard scope:server/global`
- `/rank`
- `/stats`

### Games

- `/coinflip`
- `/wheelspin`
- `/slots`
- `/lotto`
- `/jackpot`
- `/hashjackpot`

### Maths and proof

- `/odds`
- `/proof`
- `/about`

### Community and admin

- `/profile`
- `/shop view/buy`
- `/inventory`
- `/title equip/clear`
- `/achievements`
- `/recent`
- `/greetings view/welcome/goodbye/autorole`
- `/admin settings/set/balance`
- `/botstatus`
- `/help`

## What makes it different

HashGoblin uses a commit-style proof record for each game:

```txt
server seed + guild ID + user ID + game ID + nonce
↓
SHA-256
↓
roll/result
↓
proof ID
```

Users can run `/proof` to inspect a saved game receipt. `/odds` explains the exact odds, expected return and bot edge for each game.

## v1.0 deploy

Requirements:

- Node.js 22.12.0 or newer for current discord.js v14 releases. The discord.js package docs list Node.js 22.12.0+ as the install requirement. See the official docs if your VPS is older.
- A Discord bot token.
- SQLite support through `better-sqlite3`.

Quick start:

```bash
npm ci
cp .env.example .env
nano .env
npm run preflight
npm run deploy
npm start
```

For PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

## Important Discord setup

For welcome/goodbye messages and auto-role, enable **Server Members Intent** in the Discord Developer Portal.

For auto-role:

```txt
/greetings autorole role:@Member enabled:true
```

The bot needs Manage Roles permission, and its highest role must be above the target member role.

## Local testing

```bash
npm run preflight
```

This runs syntax checks, game/proof selftests, a SQLite economy smoke test and release checks.

## Docs

- `docs/DEPLOY.md`
- `docs/V1_DEPLOY_CHECKLIST.md`
- `docs/TESTING.md`
- `docs/AUTOROLE.md`
- `docs/LOGIC.md`
- `docs/ECONOMY.md`
- `docs/ODDS_COMMAND.md`
- `docs/LOTTO_JACKPOT.md`

## v1.1 deployment notes

HashGoblin v1.1 adds deploy-friendly moderation controls:

```txt
/admin set setting:gambling_enabled value:false
/admin set setting:transfers_enabled value:false
/admin bigwin channel:#wins enabled:true threshold:100000
/admin logs
/admin ledger user:@user
```

These are useful while testing on a live server. You can let users claim `/daily`, check `/balance`, and test `/proof` while keeping games or transfers disabled until you are ready.

## v1.2 Discord setup note

This package includes `.env.ready.example` with the public Discord app/server IDs already filled in.

You still must reset your bot token in the Discord Developer Portal and paste the new token into `.env` on the VPS. No real token is included in this zip.

See:

- `docs/DISCORD_SETUP_WITH_YOUR_IDS.md`
- `docs/VPS_QUICKSTART_YOUR_IDS.md`
