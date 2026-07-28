const { sendLog } = require('../utils/logger');
module.exports = {
    name: 'channelCreate',
    async execute(channel) {
        if (!channel.guild) return;
        await sendLog(channel.guild, 'log_channel_channel', { title: 'Channel Created', description: `${channel} (${channel.name})` });
    },
};
