const { sendLog } = require('../utils/logger');
const boosterRewards = require('../services/boosterRewards');

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
        await boosterRewards.memberUpdate(oldMember, newMember).catch(console.error);
        // Nickname changes
        if (oldMember.nickname !== newMember.nickname) {
            await sendLog(newMember.guild, 'log_channel_member', {
                title: 'Nickname Changed',
                description: `<@${newMember.id}>\n**Before:** ${oldMember.nickname ?? oldMember.user.username}\n**After:** ${newMember.nickname ?? newMember.user.username}`,
            });
        }

        // Role changes
        const oldRoles = new Set(oldMember.roles.cache.keys());
        const newRoles = new Set(newMember.roles.cache.keys());
        const added = [...newRoles].filter(r => !oldRoles.has(r));
        const removed = [...oldRoles].filter(r => !newRoles.has(r));
        if (added.length || removed.length) {
            const parts = [];
            if (added.length) parts.push(`**Added:** ${added.map(r => `<@&${r}>`).join(', ')}`);
            if (removed.length) parts.push(`**Removed:** ${removed.map(r => `<@&${r}>`).join(', ')}`);
            await sendLog(newMember.guild, 'log_channel_role', {
                title: 'Roles Updated',
                description: `<@${newMember.id}>\n${parts.join('\n')}`,
            });
        }
    },
};
