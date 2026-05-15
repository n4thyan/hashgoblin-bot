# Welcome and goodbye messages

HashGoblin v0.9 can greet new members and say goodbye when members leave.

## Required Discord setting

Because Discord member join/leave events use member data, enable **Server Members Intent** in the Discord Developer Portal for the bot application.

The bot also now starts with this intent:

```js
GatewayIntentBits.GuildMembers
```

## Commands

View settings:

```txt
/greetings view
```

Enable welcome messages:

```txt
/greetings welcome channel:#welcome enabled:true message:Welcome {user} to {server}. You start with Glory. Try /balance and /daily.
```

Enable goodbye messages:

```txt
/greetings goodbye channel:#logs enabled:true message:{userTag} left {server}. The goblin remembers.
```

Disable either one:

```txt
/greetings welcome enabled:false
/greetings goodbye enabled:false
```

## Template variables

```txt
{user}        mention the user
{userTag}     user's Discord tag/name
{username}    username only
{server}      server name
{memberCount} server member count
{currency}    server currency name, usually Glory
```

## Economy behaviour

When a new member joins and welcome messages are enabled, HashGoblin also creates their economy account so their starter Glory is ready immediately.

Goodbye messages do not delete balances. If the user rejoins later, their Glory record is still in the database.
