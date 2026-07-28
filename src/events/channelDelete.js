const { sendLog } = require('../utils/logger');
module.exports = {
    name: 'channelDelete',
    async execute(channel) {
        if (!channel.guild) return;
        await sendLog(channel.guild, 'log_channel_channel', { title: 'Channel Deleted', description: `#${channel.name} (${channel.id})`, color: 0xED4245 });
    },
};
