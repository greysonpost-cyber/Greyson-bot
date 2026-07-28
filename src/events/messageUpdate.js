const { sendLog } = require('../utils/logger');

module.exports = {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {
        if (!newMessage.guild || newMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return;
        await sendLog(newMessage.guild, 'log_channel_message', {
            title: 'Message Edited',
            description: `**Author:** <@${newMessage.author.id}>\n**Channel:** <#${newMessage.channel.id}> [Jump to message](${newMessage.url})`,
            fields: [
                { name: 'Before', value: (oldMessage.content || '*(uncached)*').slice(0, 500) },
                { name: 'After', value: (newMessage.content || '*(uncached)*').slice(0, 500) },
            ],
        });
    },
};
