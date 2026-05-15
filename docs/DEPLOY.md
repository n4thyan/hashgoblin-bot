# Deploy notes

## Local dev

```bash
npm install
cp .env.example .env
npm run deploy
npm start
```

## PM2 on VPS

```bash
pm2 start src/index.js --name hashgoblin
pm2 save
```

## Updating slash commands

Run this every time command definitions change:

```bash
npm run deploy
```

Use `DISCORD_GUILD_ID` for testing. Global command updates can take longer.

## Backups

Back up the SQLite database:

```bash
cp data/hashgoblin.sqlite data/hashgoblin.sqlite.backup-$(date +%F-%H%M)
```

The database contains balances, ledger rows, game proofs and transfers.
