require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
    console.error(`[config] Missing Railway variable(s): ${missing.join(', ')}`);
    process.exit(1);
}

const commands = [];
const commandsRoot = path.join(__dirname, 'commands');
for (const folder of fs.readdirSync(commandsRoot)) {
    const folderPath = path.join(commandsRoot, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.js'))) {
        const command = require(path.join(folderPath, file));
        if (command?.data) commands.push(command.data.toJSON());
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Deploying ${commands.length} slash commands...`);

        let route;
        if (process.env.GUILD_ID) {
            // Guild-scoped: updates instantly, great for development.
            route = Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID);
        } else {
            // Global: can take up to an hour to propagate.
            route = Routes.applicationCommands(process.env.CLIENT_ID);
        }

        const data = await rest.put(route, { body: commands });
        console.log(`Successfully deployed ${data.length} commands${process.env.GUILD_ID ? ' to guild ' + process.env.GUILD_ID : ' globally'}.`);
    } catch (err) {
        console.error('[deploy] Failed to register slash commands:', err);
        process.exitCode = 1;
    }
})();
