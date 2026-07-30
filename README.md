# DripCore v3.0 — Power Token & Artifact Economy

Discord.js v14 bot for giveaways, tournaments, moderation, Power Tokens, limited collectible roles, secure trading, a live shop, and a player marketplace.

## New in v3.0

### Power Tokens
- `/tokens balance`, `/tokens daily`, and member-to-member transfers.
- Owner-only `/tokens give`, `/tokens remove`, and `/tokens set` with a permanent ledger.
- Server boosters automatically receive **5 PT when boosting starts** and **5 PT every seven consecutive days** while the boost remains active.
- Booster checks run automatically every hour and also react to boost-role changes.

### Token minigames
`/minigame` now includes trivia, word scramble, math rush, fast typing, number guessing, reaction speed, flag challenges, country challenges, and prize wheels. Winners receive PT up to the configured daily anti-farming cap (`MINIGAME_DAILY_CAP`, default 20).

### Limited artifacts
- Create serialized limited roles with `/artifact create`.
- Every copy has a unique number, owner, provenance, trade count, and history.
- `/artifact inspect`, `/artifact collection`, `/artifact find`, `/artifact offers`, and `/artifact museum`.
- Owners can use `/artifact transfer` to move any numbered limited role safely and update Discord roles automatically.

### Live shop
- `/shop setup` posts one permanent live shop embed.
- `/shop stock` adds stock and pricing.
- Buy buttons instantly deduct PT, transfer a numbered copy, update its history, grant the Discord role, and refresh stock.

### Marketplace
- `/market list` creates a public buyable listing.
- `/market browse` and `/market cancel`.
- Purchases transfer PT and ownership atomically and disable sold listings.

### Secure swaps
- `/trade start`, `/trade add-artifact`, `/trade add-tokens`, and `/trade remove-artifact`.
- Both users must mark ready.
- Any offer change resets both ready states.
- A 15-second review lock runs before final confirmation.
- Both users must confirm.
- Ownership and token balances are checked again before completion.
- Artifacts are locked while offered to prevent duplicate sales.
- `/trade history` records completed swaps.

## Environment variables

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
OWNER_IDS=123456789012345678,987654321098765432
MINIGAME_DAILY_CAP=20
```

`OWNER_IDS` is optional. The Discord server owner is always recognized as an owner.

## Install and deploy

```bash
npm install
npm run validate
npm run deploy
npm start
```

The SQLite schema upgrades automatically at startup. Keep `data/bot.sqlite` when updating so existing data remains intact.

## Required bot permissions
The bot needs Manage Roles for artifact-role transfers. Its highest bot role must be above every limited artifact role. It also needs Send Messages, Embed Links, Read Message History, and Use Application Commands in economy channels.
