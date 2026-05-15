# Discord setup for this HashGoblin package

This package has your public Discord IDs prefilled in `.env.example` and `.env.ready.example`:

```env
DISCORD_CLIENT_ID=1504748842069786624
DISCORD_GUILD_ID=1504559888007954575
```

## Critical token warning

A bot token was pasted into chat during setup. Treat it as compromised.

Before deploying:

1. Open Discord Developer Portal.
2. Select the HashGoblin application.
3. Go to **Bot**.
4. Click **Reset Token**.
5. Copy the new token privately.
6. Put only the new token into the VPS `.env` file.

Do not paste the token into ChatGPT, Discord, GitHub, screenshots, or docs.

## Invite URL

The invite URL you generated was:

```txt
https://discord.com/oauth2/authorize?client_id=1504748842069786624&permissions=2416004096&integration_type=0&scope=bot+applications.commands
```

This is fine for testing, provided the bot has these permissions:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands
- Manage Roles

## Required Developer Portal setting

Enable **Server Members Intent** under:

```txt
Developer Portal → HashGoblin → Bot → Privileged Gateway Intents
```

This is required for:

- welcome messages
- goodbye messages
- auto member role

## Role hierarchy

For `/greetings autorole` to work:

```txt
HashGoblin role
Member role
```

The HashGoblin role must be above the Member role in Server Settings → Roles.

## VPS `.env` template

On the VPS:

```bash
cp .env.ready.example .env
nano .env
```

Then replace:

```env
DISCORD_TOKEN=PASTE_NEW_RESET_TOKEN_HERE
```

with your new reset token.
