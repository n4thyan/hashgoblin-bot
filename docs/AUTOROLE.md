# Auto member role

HashGoblin can automatically give a role to new members when they join.

Command:

```txt
/greetings autorole role:@Member enabled:true
```

Disable it:

```txt
/greetings autorole enabled:false
```

Requirements:

- Server Members Intent enabled in the Discord Developer Portal.
- Bot has Manage Roles permission.
- Bot's highest role is above the target role.
- Target role is not a managed/integration role.

Auto-role runs before the welcome message. If the role fails, HashGoblin logs the reason to the console but still attempts the welcome message.
