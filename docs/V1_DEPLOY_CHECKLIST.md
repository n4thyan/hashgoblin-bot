# HashGoblin v1.0 deploy checklist

## Discord Developer Portal

1. Create a Discord application and bot.
2. Copy the bot token into `.env` as `DISCORD_TOKEN`.
3. Copy the application/client ID into `.env` as `DISCORD_CLIENT_ID`.
4. Enable **Server Members Intent** if you want welcome/goodbye messages and auto member roles.
5. Invite the bot with permissions for slash commands, Send Messages, Embed Links, Read Message History, Manage Roles if using auto-role.

## VPS

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
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

## Auto member role

Use:

```txt
/greetings autorole role:@Member enabled:true
```

Discord role rules matter: the bot's highest role must be above the member role, and the bot needs Manage Roles permission.
