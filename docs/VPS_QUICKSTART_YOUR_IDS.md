# VPS quickstart with your Discord IDs

Upload and unzip the package, then run:

```bash
cd /root/hashgoblin-bot-v1.2
npm ci
cp .env.ready.example .env
nano .env
```

Paste your **new reset token** into `DISCORD_TOKEN`.

Then run:

```bash
npm run preflight
npm run deploy
npm start
```

If it works, start with PM2:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs hashgoblin
```

First Discord commands to test:

```txt
/botstatus
/about
/help
/daily
/balance
/coinflip amount:10 side:heads
/proof game_id:<the proof id from coinflip>
/greetings view
/greetings autorole role:@Member enabled:true
```
