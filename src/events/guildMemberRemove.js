const { sendLog } = require('../utils/logger');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        await sendLog(member.guild, 'log_channel_member', {
            title: 'Member Left',
            description: `${member.user.tag} (${member.id})`,
            color: 0xED4245,
        });
    },
};
