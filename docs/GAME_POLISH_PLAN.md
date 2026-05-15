# HashGoblin v1.3 game polish plan

This branch is for adding game polish safely without risking the live VPS bot.

## Goals

- Make existing games feel more alive instead of adding loads of noisy commands.
- Keep all existing balances, proof receipts, odds and ledger behaviour intact.
- Keep the no real money, no prizes, no crypto framing everywhere.
- Build and test on this branch before merging into `main` or restarting PM2.

## Current branch status

Done so far:

- Added `src/lib/slotAnimation.js`.
- Added `src/bootstrap.js` as the safe production entrypoint.
- Added `tools/slot-animation-selftest.js`.
- Added `tools/bootstrap-selftest.js`.
- Added `npm run test:slot-animation` and `npm run test:bootstrap`.
- Added both animation checks to `npm run preflight`.
- Updated `package.json` and `ecosystem.config.cjs` to use `src/bootstrap.js`.
- Added `.env` flags so animation can be switched on or off without code changes.
- Fixed the v1.3 release check so `npm run preflight` accepts `1.3.0-rc.1`.
- VPS live test confirmed the bootstrap entrypoint runs under PM2 and animated slot reveals work when enabled.

The live `/slots` maths path is still handled by `src/index.js`. The bootstrap wrapper only changes how the final slot result is revealed in Discord when `HASHGOBLIN_ANIMATED_SLOTS=true`.

## Phase 1: animated slots

Discord cannot do real animation inside a slash command, so the safe version is message-edit animation.

The result is still calculated before the animation starts:

1. Check gambling is enabled.
2. Check and apply the user lock.
3. Read the bet amount.
4. Create the SHA-256 proof record.
5. Run the existing `playSlots(...)` logic.
6. Apply the game using the existing `applyGame(...)` economy path.
7. The bootstrap wrapper sees the final `/slots` reply.
8. It posts a short spinning embed and edits it to reveal the reels.
9. Final edit shows the original receipt/proof embed.

Important rule: the animation never decides the result. It only reveals the result that was already created by the existing proof/economy logic.

Suggested reveal frames:

```text
[ ? ] [ ? ] [ ? ]
[ 🍒 ] [ ? ] [ ? ]
[ 🍒 ] [ 🍋 ] [ ? ]
[ 🍒 ] [ 🍋 ] [ 💎 ]
```

## Feature flags

```env
HASHGOBLIN_ANIMATED_SLOTS=false
HASHGOBLIN_SLOT_ANIMATION_DELAY_MS=650
HASHGOBLIN_VS_COINFLIP=false
```

`HASHGOBLIN_ANIMATED_SLOTS=true` has now been tested on the VPS. If anything acts weird, switch it back to `false` and restart with `pm2 restart hashgoblin-bot --update-env`.

## Discord permission note

Animated slots use the command channel, so they need the normal slash command reply/edit permissions.

Big-win announcements are separate. If the log shows `DiscordAPIError[50013]: Missing Permissions`, the configured big-win channel is blocking HashGoblin from posting. Fix this in Discord by checking the channel permissions for the HashGoblin role:

- View Channel: allowed
- Send Messages: allowed
- Embed Links: allowed
- Read Message History: allowed

If it is an announcement channel, also check any channel-specific overrides. The bot can still play games while this is broken, but big-win announcements will fail until that channel allows posts.

## Phase 2: PvP coinflip

Do this after animated slots is stable.

Suggested command shape:

```text
/coinflipvs user:@target amount:100 side:heads
```

Rules:

- No challenging yourself.
- No challenging bots.
- No zero/negative bets.
- Bet must respect the same server min/max bet settings.
- Challenger chooses heads or tails.
- Opponent gets the other side.
- Opponent must click Accept or Decline.
- Challenge expires after 60 seconds.
- If declined or expired, no Glory moves.
- When accepted, both balances are checked again.
- Winner receives the pot.
- A normal proof receipt is saved.

## Escrow design

For v1.3, keep it simple and safe:

- Do not deduct the challenge creator immediately.
- Store the pending challenge in memory with an expiry.
- On accept, take both bets in one locked section.
- If either user cannot pay at accept time, cancel cleanly.

This avoids stuck escrow balances if the bot restarts during an open challenge.

## Deployment checklist

Before touching the live PM2 bot:

```bash
git checkout feature/animated-games-vs
npm ci
npm run preflight
npm run deploy:guild
pm2 restart hashgoblin-bot --update-env
pm2 logs hashgoblin-bot --lines 80
```

After Discord testing, merge to `main` and deploy from `main`.