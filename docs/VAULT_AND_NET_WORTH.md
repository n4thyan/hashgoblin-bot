# Vault and Net Worth

HashGoblin v0.8 adds a **Glory Vault**.

The vault is not a second currency. It is protected storage for the same fake server currency, Glory.

## Why it exists

Casino/economy bots can feel rough if a user accidentally bets too much or keeps chasing losses. The vault gives users a simple way to protect part of their balance.

```txt
Wallet Glory = usable for gambling, giving, trading and shop purchases
Vault Glory  = protected storage
Net worth    = wallet + vault
```

Gambling commands only use wallet Glory. If a user wants to gamble vaulted Glory, they must intentionally withdraw it first.

## Commands

```txt
/vault view [user]
/vault deposit amount
/vault withdraw amount
```

## Leaderboards

v0.8 adds a `net_worth` leaderboard type.

```txt
/leaderboard type:net_worth scope:server
/leaderboard type:net_worth scope:global
```

The existing `balance` leaderboard now means **wallet balance**. Net worth includes both wallet and vaulted Glory.

## Safety notes

Vaulting is not real banking and has no real-world value. It is just a gameplay safety/progression feature for the fake Discord economy.
