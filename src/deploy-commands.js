require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

// Initialize the database and run schema migrations before command modules are loaded.
// Some command files prepare SQL statements during require(), so this must happen first.
require('./database/db');

const commands = [];
const commandsRoot = path.join(__dirname, 'commands');
// Keep these command folders out of Discord registration even if their old
// source files still exist in the repository. Redeploying replaces the guild's
// command list, so the removed commands disappear from Discord.
const disabledCommandFolders = new Set(['ai', 'moderation']);
for (const folder of fs.readdirSync(commandsRoot)) {
  if (disabledCommandFolders.has(folder)) {
    console.log(`[deploy] Skipping disabled command folder: ${folder}`);
    continue;
  }
  const folderPath = path.join(commandsRoot, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;
  for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.js'))) {
    const full = path.join(folderPath, file);
    try {
      const command = require(full);
      if (!command?.data) throw new Error('Missing data export');
      const json = command.data.toJSON();
      if (!json.name || !json.description) throw new Error('Command is missing a name or description');
      commands.push(json);
      console.log(`[deploy] Validated ${folder}/${file} -> /${json.name}`);
    } catch (err) {
      console.error(`[deploy] Invalid command file: ${folder}/${file}`);
      console.error(err);
      process.exit(1);
    }
  }
}
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('[deploy] DISCORD_TOKEN and CLIENT_ID are required.');
  process.exit(1);
}
const rest = new REST().setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log(`Deploying ${commands.length} slash commands...`);
    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);
    const data = await rest.put(route, { body: commands });
    console.log(`Successfully deployed ${data.length} commands${process.env.GUILD_ID ? ` to guild ${process.env.GUILD_ID}` : ' globally'}.`);
  } catch (err) {
    console.error('[deploy] Failed to register slash commands:', err);
    process.exit(1);
  }
})();
