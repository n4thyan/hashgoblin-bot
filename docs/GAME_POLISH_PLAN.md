# HashGoblin v1.3 game polish plan

This branch is for adding game polish safely without touching the live VPS bot until it has been tested.

## Goals

- Make existing games feel more alive instead of adding loads of noisy commands.
- Keep all existing balances, proof receipts, odds and ledger behaviour intact.
- Keep the no real money, no prizes, no crypto framing everywhere.
- Build and test on this branch before merging into `main` or restarting PM2.

## Current branch status

Done so far:

- Added `src/lib/slotAnimation.js`.
- Added `tools/slot-animation-selftest.js`.
- Added `npm run test:slot-animation`.
- Added the slot animation selftest to `npm run preflight`.

Not wired into the live `/slots` handler yet. That is deliberate so the helper can be tested first before changing command behaviour.

## Phase 1: animated slots

Discord cannot do real animation inside a slash command, so the safe version is message-edit animation.

The result must be calculated before the animation starts:

1. Check gambling is enabled.
2. Check and apply the user lock.
3. Read the bet amount.
4. Create the SHA-256 proof record.
5. Run the existing `playSlots(...)` logic.
6. Apply the game using the existing `applyGame(...)` economy path.
7. Reply with a short spinning embed.
8. Edit the same reply a few times to reveal reel 1, reel 2 and reel 3.
9. Final edit shows the existing receipt/proof embed.

Important rule: the animation must never decide the result. It only reveals the result that was already created by the existing proof/economy logic.

Suggested reveal frames:

```text
[ ? ] [ ? ] [ ? ]
[ 🍒 ] [ ? ] [ ? ]
[ 🍒 ] [ 🍋 ] [ ? ]
[ 🍒 ] [ 🍋 ] [ 💎 ]
```

The helper currently uses `❔` by default, but the selftest also checks plain `?` output so the display can be toned down later.

## Integration patch for `/slots`

After `npm run test:slot-animation` passes, wire the helper into `src/index.js`.

Add near the other imports:

```js
const { animatedSlotsEnabled, replyWithAnimatedSlots } = require('./lib/slotAnimation');
```

Then replace only the final line of the existing `/slots` handler:

```js
return interaction.reply({ embeds: [embed] });
```

with:

```js
return replyWithAnimatedSlots({
  interaction,
  baseEmbed,
  finalEmbed: embed,
  result,
  enabled: animatedSlotsEnabled()
});
```

Do not move the proof generation, `playSlots(...)`, `applyGame(...)`, or big-win announcement logic into the animation helper. The helper should only reveal an already-settled result.

## Phase 2: PvP coinflip

Add a challenge command after animated slots is stable.

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

Later versions can add a persistent escrow table if needed.

## Feature flags

Useful env flags for safe rollout:

```env
HASHGOBLIN_ANIMATED_SLOTS=true
HASHGOBLIN_VS_COINFLIP=false
```

Animated slots can default on once tested. PvP coinflip should default off until the command has been tested in a private channel.

## Tests to add

- Existing `npm run selftest` must still pass.
- Slots still produce the same result/payout shape.
- Animated slots final embed still contains the proof ID.
- PvP challenge rejects bots/self-challenges.
- PvP challenge expires without moving Glory.
- PvP accept pays exactly one pot to the winner.
- PvP accept fails cleanly if one user lacks enough Glory.

## Deployment checklist

Before touching the live PM2 bot:

```bash
git checkout feature/animated-games-vs
npm ci
npm run selftest
npm run test:slot-animation
npm run deploy:guild
pm2 restart hashgoblin-bot
pm2 logs hashgoblin-bot --lines 80
```

Only merge to `main` after testing in Discord.
