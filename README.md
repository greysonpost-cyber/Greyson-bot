# DripCore Discord Bot

Railway-ready Discord.js v14 bot with moderation, reports, role delegation, Roblox guild management, live rosters, giveaways, automatic winner claim tickets, and optional AI mention replies.

## Required Railway variables

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID` — recommended so command updates appear immediately
- `OPENAI_API_KEY` — optional; enables full AI chat when the bot is mentioned
- `OPENAI_MODEL` — optional, defaults to `gpt-4.1-mini`

Enable **Server Members Intent** and **Message Content Intent** in the Discord Developer Portal.

Railway automatically runs `npm run deploy` before `npm start`.

## Main update commands

### Live guild roster

1. `/config set-channel` → choose **Live Guild Roster Channel**.
2. `/guild refresh-list` to create the live roster message.
3. Use `/guild add`, `/guild accept`, `/guild edit-user`, `/guild set-role`, `/guild remove`, or `/guild inactive`.

Guild records now contain only:
- Discord user
- Roblox username
- Guild role/rank

Roblox numeric IDs were removed.

### Command permissions

Use `/command-permissions add` with command names such as:
- `guild` for every guild command
- `guild.add` for only `/guild add`
- `guild.set-role` for only `/guild set-role`
- `giveaway` for all giveaway commands

Admins and the server owner always bypass these restrictions.

### Role-giving permissions

Use `/role-permissions add` to choose which staff role may give or remove a specific Discord role through `/giverole`.

### Giveaways

Use `/giveaway-config` to configure:
- Automatic bonus-entry roles
- Extra claim-time roles
- Auto-claim roles
- Default claim time (10 minutes unless changed)
- Winner-ticket category
- Giveaway staff role

Then use `/giveaway start`. There are no giveaway presets and no per-giveaway bonus-role options. Configured role bonuses apply automatically.

When a giveaway ends, each winner receives a private claim ticket automatically. Unclaimed prizes reroll after the winner's configured time expires.

### AI mention assistant

1. Add approved rules, requirements, FAQs, and instructions with `/ai set-info` or `/ai add-info`.
2. Set the help, guild, giveaway, and staff destinations using `/ai`.
3. Run `/ai enable`.
4. Members can mention DripCore and ask questions.

Without an OpenAI API key, the bot uses built-in safe guidance. With a key, it provides fuller responses while being instructed not to invent rules, expose private information, or make moderation decisions.

## Bot permissions

The bot should have Manage Roles, Manage Channels, Moderate Members, Kick Members, Ban Members, Manage Messages, View Channels, Send Messages, Read Message History, Embed Links, and Attach Files. Its role must be above any role it needs to assign.
