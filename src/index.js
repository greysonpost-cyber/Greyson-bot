require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// ---- Load slash commands from every subfolder of src/commands ----
client.commands = new Collection();
const commandsRoot = path.join(__dirname, 'commands');
// These command groups are intentionally disabled. Their files may remain in the
// repository, but they are not loaded or available to users.
const disabledCommandFolders = new Set(['ai', 'moderation']);
for (const folder of fs.readdirSync(commandsRoot)) {
    if (disabledCommandFolders.has(folder)) continue;
    const folderPath = path.join(commandsRoot, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.js'))) {
        const command = require(path.join(folderPath, file));
        if (!command?.data || !command?.execute) {
            console.warn(`[warn] Skipping ${folder}/${file} - missing "data" or "execute" export.`);
            continue;
        }
        client.commands.set(command.data.name, command);
    }
}
console.log(`[commands] Loaded ${client.commands.size} slash commands.`);

// ---- Load event handlers from src/events ----
const eventsPath = path.join(__dirname, 'events');
const disabledEventFiles = new Set(['messageCreate.js']); // Removes mention-based AI replies.
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js') && !disabledEventFiles.has(f))) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}
console.log(`[events] Loaded ${fs.readdirSync(eventsPath).filter(f => f.endsWith('.js') && !disabledEventFiles.has(f)).length} events.`);

// ---- In-memory giveaway scheduler check (runs every 15s) ----
require('./handlers/giveawayHandler').startScheduler(client);
require('./services/boosterRewards').start(client);
require('./services/tokenDrops').start(client);

client.login(process.env.DISCORD_TOKEN);

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
