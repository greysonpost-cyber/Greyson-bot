const { ActivityType } = require('discord.js');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`[ready] Logged in as ${client.user.tag} (${client.user.id})`);
        client.user.setPresence({
            activities: [{ name: 'over the Guild 🌱', type: ActivityType.Watching }],
            status: 'online',
        });
    },
};
