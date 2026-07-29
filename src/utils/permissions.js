const { PermissionsBitField } = require('discord.js');
const db = require('../database/db');

const insertCmdPerm = db.prepare(
    `INSERT OR IGNORE INTO command_permissions (guild_id, command_name, role_id) VALUES (?, ?, ?)`
);
const deleteCmdPerm = db.prepare(
    `DELETE FROM command_permissions WHERE guild_id = ? AND command_name = ? AND role_id = ?`
);
const listCmdPerms = db.prepare(
    `SELECT role_id FROM command_permissions WHERE guild_id = ? AND command_name = ?`
);

const insertRolePerm = db.prepare(
    `INSERT OR IGNORE INTO role_permissions (guild_id, granter_role_id, grantable_role_id) VALUES (?, ?, ?)`
);
const deleteRolePerm = db.prepare(
    `DELETE FROM role_permissions WHERE guild_id = ? AND granter_role_id = ? AND grantable_role_id = ?`
);
const listGrantableRoles = db.prepare(
    `SELECT DISTINCT grantable_role_id FROM role_permissions WHERE guild_id = ? AND granter_role_id = ?`
);

/**
 * Server owners and Administrator-permission members always pass every check.
 * Otherwise, a command is allowed if:
 *  - no roles have been configured for it (defaults open, admins can lock it down later), OR
 *  - the member has one of the configured roles.
 */
function canRunCommand(member, commandName) {
    if (member.guild.ownerId === member.id) return true;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

    const configured = listCmdPerms.all(member.guild.id, commandName).map(r => r.role_id);
    if (configured.length === 0) return true; // unrestricted until an admin configures it
    return member.roles.cache.some(role => configured.includes(role.id));
}

function addCommandPermission(guildId, commandName, roleId) {
    insertCmdPerm.run(guildId, commandName, roleId);
}
function removeCommandPermission(guildId, commandName, roleId) {
    deleteCmdPerm.run(guildId, commandName, roleId);
}
function getCommandPermissions(guildId, commandName) {
    return listCmdPerms.all(guildId, commandName).map(r => r.role_id);
}
function hasCommandPermissions(guildId, commandName) {
    return getCommandPermissions(guildId, commandName).length > 0;
}

/** Which role IDs can this member grant via /giverole, given their roles? */
function getGrantableRolesForMember(member) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return 'ALL';
    const grantable = new Set();
    for (const role of member.roles.cache.values()) {
        for (const row of listGrantableRoles.all(member.guild.id, role.id)) {
            grantable.add(row.grantable_role_id);
        }
    }
    return [...grantable];
}

function addGrantableRole(guildId, granterRoleId, grantableRoleId) {
    insertRolePerm.run(guildId, granterRoleId, grantableRoleId);
}
function removeGrantableRole(guildId, granterRoleId, grantableRoleId) {
    deleteRolePerm.run(guildId, granterRoleId, grantableRoleId);
}

module.exports = {
    canRunCommand,
    addCommandPermission,
    removeCommandPermission,
    getCommandPermissions,
    hasCommandPermissions,
    getGrantableRolesForMember,
    addGrantableRole,
    removeGrantableRole,
};
