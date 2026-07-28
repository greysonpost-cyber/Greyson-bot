const { sendLog } = require('../utils/logger');

module.exports = {
    name: 'messageDelete',
    async execute(message) {
        if (!message.guild || message.author?.bot) return;
        await sendLog(message.guild, 'log_channel_message', {
            title: 'Message Deleted',
            description: `**Author:** <@${message.author?.id ?? 'unknown'}>\n**Channel:** <#${message.channel.id}>`,
            fields: [{ name: 'Content', value: (message.content || '*(no cached content - embed/attachment?)*').slice(0, 1000) }],
            color: 0xED4245,
        });
    },
};
