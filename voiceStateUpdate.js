const { sendLog } = require('../utils/logger');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const guild = newState.guild;
        if (!oldState.channel && newState.channel) {
            await sendLog(guild, 'log_channel_voice', { title: 'Voice Join', description: `<@${newState.id}> joined ${newState.channel}` });
        } else if (oldState.channel && !newState.channel) {
            await sendLog(guild, 'log_channel_voice', { title: 'Voice Leave', description: `<@${oldState.id}> left ${oldState.channel}` });
        } else if (oldState.channel?.id !== newState.channel?.id) {
            await sendLog(guild, 'log_channel_voice', { title: 'Voice Move', description: `<@${newState.id}> moved from ${oldState.channel} to ${newState.channel}` });
        }
    },
};
