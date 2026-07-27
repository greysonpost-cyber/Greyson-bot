# Grow a Garden - Custom Discord Bot

A working, all-in-one Discord bot built with **discord.js v14** and **SQLite** (via `better-sqlite3`), covering every system from your spec: tickets, reports, moderation, role permissions, guild/roster management, recruiter tracking, giveaways, auto roles, utility commands, and per-server configuration - no code edits needed after setup.

## 1. Setup

**Requirements:** Node.js 18+.

```bash
cd discord-bot
npm install
cp .env.example .env
```

Edit `.env`:
- `DISCORD_TOKEN` - from https://discord.com/developers/applications → your app → Bot → Reset Token
- `CLIENT_ID` - your app's Application ID (General Information page)
- `GUILD_ID` - your server's ID (enable Developer Mode in Discord, right-click your server icon → Copy Server ID). Leave this set while developing - guild commands update instantly. Remove it once you're ready to go global (global updates take up to 1 hour).

**Bot permissions needed when inviting it:** Manage Roles, Manage Channels, Kick Members, Ban Members, Moderate Members, Manage Messages, Read Message History, Send Messages, Embed Links, Attach Files, Create Private Threads.

**Privileged intents** (enable in the Discord Developer Portal → Bot page): Server Members Intent, Message Content Intent.

Deploy the slash commands, then start the bot:

```bash
npm run deploy
npm start
```

The SQLite database is created automatically at `data/bot.sqlite` on first run.

## 2. First-time configuration (all via `/config`, no code edits)

Run these as a server admin:

```
/config set-channel key:Moderation Logs channel:#mod-logs
/config set-channel key:Report Submissions Channel channel:#reports
/config set-channel key:Ticket Logs channel:#ticket-logs
/config set-channel key:Ticket Transcript Channel channel:#transcripts
/config set-category category:#Tickets            (a category channel)
/config set-role key:Guild Accept Role role:@Guild Member
/config set-role key:Muted Role role:@Muted        (only if you use /mute)
/config view                                        (see everything you've set)
```

Then set up role-grant permissions and tickets:

```
/role-permissions add granter_role:@Elder grantable_role:@Guild Member
/ticket-panel create name:"Open a Ticket" channel:#support
/ticket-panel add-category panel_id:1 label:"Guild Applications" value:guild-app staff_role:@Recruiter questions:"Roblox username? | Why do you want to join?"
/ticket-panel send panel_id:1
```

## 3. Feature map (spec → implementation)

| Spec item | Where it lives |
|---|---|
| 1. Ticket System | `commands/tickets/ticket-panel.js`, `handlers/ticketHandler.js` |
| 2. Report System | `commands/report/report.js`, `handlers/reportHandler.js` |
| 3. Moderation Logs | `events/*.js` (message, member, role, voice, channel events) + `/config set-channel` |
| 4. Warning & Moderation | `commands/moderation/*.js`, `handlers/modActionHelper.js` |
| 5. Role Commands | `commands/roles/giverole.js`, `commands/roles/role-permissions.js` |
| 6. Guild Management | `commands/guild/guild.js` |
| 7. Guild Recruit Tracking | `commands/recruiter/recruiter.js` |
| 8. Giveaway Tools | `commands/giveaway/giveaway.js`, `handlers/giveawayHandler.js` |
| 9. Auto Role System | `events/guildMemberAdd.js` (join) + config keys for verify/guild-accept/ticket-accept - see note below |
| 10. Utility Commands | `commands/utility/*.js` |
| 11-12. Config & Permissions | `commands/config/config.js`, `utils/config.js`, `utils/permissions.js` |
| 13. Extras | Ephemeral replies, buttons/modals/selects throughout, `utils/embeds.js` for consistent branding, this README doubles as the "no code edits" config guide |

**Auto role note:** `auto_role_on_join` is wired up and fires automatically. `auto_role_on_verify`, `auto_role_on_guild_accept`, and `auto_role_on_ticket_accept` are stored as config keys but you'll want to call them explicitly from wherever your verification flow lives (e.g. add one line in `guild.js`'s `accept` handler, or your verification command) - they're separated out because "verification" usually means something specific to your server (a captcha bot, a reaction role, etc.) that isn't specified yet.

## 4. Customizing branding

Edit `src/utils/embeds.js` - change `BRAND.color` and `BRAND.footer` to match your server.

## 5. Known limitations / good next steps

- **Ticket transcripts** pull the last 100 messages (Discord's per-request fetch limit). For very long tickets, extend `generateTranscript` in `ticketHandler.js` to paginate with multiple `fetch()` calls.
- **Polls** are in-memory (votes reset on restart) - fine for day-to-day polls; move to a DB table if you need them to survive restarts.
- **Statistics dashboard** (item 13) isn't built yet - the DB schema already has everything needed (tickets, reports, guild_members, mod_actions tables), so this would be a `/stats` command that runs a few `COUNT()` queries. Happy to add it.
- **Command permissions per role** (item 12, beyond role-granting) are supported by `utils/permissions.js` + the `command_permissions` table, but there's no slash command exposed yet to manage them - right now it defaults to "Administrator or unrestricted." Say the word and I'll add a `/command-permissions` command mirroring `/role-permissions`.
- Test everything in a dev server with `GUILD_ID` set before going live.

## 6. Project structure

```
src/
  index.js                 entry point - loads commands/events, logs in
  deploy-commands.js        registers slash commands with Discord
  database/                 schema.sql + db.js (SQLite connection)
  utils/                    config.js, permissions.js, embeds.js, logger.js
  handlers/                 ticketHandler, reportHandler, giveawayHandler, modActionHelper
  events/                   ready, interactionCreate, member/message/voice/channel logs
  commands/
    tickets/ report/ moderation/ roles/ guild/ recruiter/ giveaway/ utility/ config/
```
