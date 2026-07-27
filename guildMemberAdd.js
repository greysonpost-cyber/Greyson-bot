const { sendLog } = require('../utils/logger');
const { getConfig } = require('../utils/config');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        await sendLog(member.guild, 'log_channel_member', {
            title: 'Member Joined',
            description: `${member.user.tag} (<@${member.id}>)`,
            fields: [
                { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'User ID', value: member.id, inline: true },
            ],
        });

        // Auto role on join (item 9).
        const roleId = getConfig(member.guild.id, 'auto_role_on_join');
        if (roleId) {
            const role = member.guild.roles.cache.get(roleId);
            if (role) await member.roles.add(role).catch(() => {});
        }
    },
};
