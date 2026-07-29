const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');
const { getConfig } = require('../../utils/config');
const { updateRosterMessage } = require('../../utils/roster');

const upsert = db.prepare(`INSERT INTO guild_members (guild_id,discord_id,roblox_username,join_date,recruiter_id,guild_rank,notes,active)
VALUES (?,?,?,?,?,?,?,1) ON CONFLICT(guild_id,discord_id) DO UPDATE SET roblox_username=excluded.roblox_username,recruiter_id=excluded.recruiter_id,guild_rank=excluded.guild_rank,active=1`);
const get = db.prepare('SELECT * FROM guild_members WHERE guild_id=? AND discord_id=?');
const remove = db.prepare('DELETE FROM guild_members WHERE guild_id=? AND discord_id=?');
const updateRoblox = db.prepare('UPDATE guild_members SET roblox_username=? WHERE guild_id=? AND discord_id=?');
const updateRank = db.prepare('UPDATE guild_members SET guild_rank=? WHERE guild_id=? AND discord_id=?');
const updateRecruiter = db.prepare('UPDATE guild_members SET recruiter_id=? WHERE guild_id=? AND discord_id=?');
const updateNotes = db.prepare('UPDATE guild_members SET notes=? WHERE guild_id=? AND discord_id=?');
const updateActive = db.prepare('UPDATE guild_members SET active=? WHERE guild_id=? AND discord_id=?');
const list = db.prepare('SELECT * FROM guild_members WHERE guild_id=? AND active=1 ORDER BY guild_rank COLLATE NOCASE, join_date');

async function refresh(interaction) { await updateRosterMessage(interaction.guild).catch(e => console.error('[roster update]', e)); }
function profile(row) { return infoEmbed('Guild Member Profile').addFields(
  {name:'Discord User',value:`<@${row.discord_id}>`,inline:true}, {name:'Roblox User',value:`\`${row.roblox_username}\``,inline:true},
  {name:'Guild Role',value:row.guild_rank || 'Member',inline:true}, {name:'Recruiter',value:row.recruiter_id?`<@${row.recruiter_id}>`:'None',inline:true},
  {name:'Status',value:row.active?'Active':'Inactive',inline:true}, {name:'Joined',value:`<t:${Math.floor(row.join_date/1000)}:D>`,inline:true},
  {name:'Notes',value:row.notes || 'None'}); }

module.exports = {
 data: new SlashCommandBuilder().setName('guild').setDescription('Manage the Roblox guild roster')
  .addSubcommand(sc=>sc.setName('accept').setDescription('Accept and add a guild member').addUserOption(o=>o.setName('user').setDescription('Discord user').setRequired(true)).addStringOption(o=>o.setName('roblox_user').setDescription('Roblox username').setRequired(true)).addStringOption(o=>o.setName('guild_role').setDescription('Guild role/rank').setRequired(false)).addUserOption(o=>o.setName('recruiter').setDescription('Recruiter')))
  .addSubcommand(sc=>sc.setName('add').setDescription('Add a member to the roster').addUserOption(o=>o.setName('user').setDescription('Discord user').setRequired(true)).addStringOption(o=>o.setName('roblox_user').setDescription('Roblox username').setRequired(true)).addStringOption(o=>o.setName('guild_role').setDescription('Guild role/rank').setRequired(false)).addUserOption(o=>o.setName('recruiter').setDescription('Recruiter')))
  .addSubcommand(sc=>sc.setName('edit-user').setDescription("Edit a member's Roblox username").addUserOption(o=>o.setName('user').setDescription('Discord user').setRequired(true)).addStringOption(o=>o.setName('roblox_user').setDescription('New Roblox username').setRequired(true)))
  .addSubcommand(sc=>sc.setName('set-role').setDescription("Edit a member's guild role/rank").addUserOption(o=>o.setName('user').setDescription('Discord user').setRequired(true)).addStringOption(o=>o.setName('guild_role').setDescription('New guild role/rank').setRequired(true)))
  .addSubcommand(sc=>sc.setName('remove').setDescription('Remove a member').addUserOption(o=>o.setName('user').setDescription('Discord user').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason')))
  .addSubcommand(sc=>sc.setName('info').setDescription('View a guild member').addUserOption(o=>o.setName('user').setDescription('Discord user').setRequired(true)))
  .addSubcommand(sc=>sc.setName('list').setDescription('Show the guild roster'))
  .addSubcommand(sc=>sc.setName('recruiter').setDescription('Edit recruiter').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addUserOption(o=>o.setName('recruiter').setDescription('Recruiter').setRequired(true)))
  .addSubcommand(sc=>sc.setName('notes').setDescription('Edit private guild notes').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('note').setDescription('Notes').setRequired(true)))
  .addSubcommand(sc=>sc.setName('inactive').setDescription('Set active/inactive').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addBooleanOption(o=>o.setName('inactive').setDescription('Mark inactive?').setRequired(true)))
  .addSubcommand(sc=>sc.setName('refresh-list').setDescription('Force-refresh the configured live roster message')),
 async execute(interaction) {
  const sub=interaction.options.getSubcommand(), gid=interaction.guild.id;
  if (sub==='accept'||sub==='add') {
    const user=interaction.options.getUser('user'), roblox=interaction.options.getString('roblox_user').trim(), rank=interaction.options.getString('guild_role')||'Member', recruiter=interaction.options.getUser('recruiter');
    upsert.run(gid,user.id,roblox,Date.now(),recruiter?.id||null,rank,null);
    if(sub==='accept'){ const roleId=getConfig(gid,'guild_accept_role'); const member=await interaction.guild.members.fetch(user.id).catch(()=>null); if(roleId&&member) await member.roles.add(roleId).catch(()=>{}); }
    await refresh(interaction); await sendLog(interaction.guild,'log_channel_mod',{title:'Guild Roster Updated',description:`<@${user.id}> added/accepted by <@${interaction.user.id}> • Roblox: ${roblox} • Role: ${rank}`});
    return interaction.reply({embeds:[successEmbed('Guild Member Saved',`<@${user.id}> • \`${roblox}\` • **${rank}**`)]});
  }
  const user=interaction.options.getUser('user'); const row=user?get.get(gid,user.id):null;
  if(['edit-user','set-role','remove','info','recruiter','notes','inactive'].includes(sub)&&!row) return interaction.reply({embeds:[errorEmbed('Not In Roster','That Discord user is not in the guild roster.')],ephemeral:true});
  if(sub==='edit-user'){const v=interaction.options.getString('roblox_user').trim();updateRoblox.run(v,gid,user.id);await refresh(interaction);return interaction.reply({embeds:[successEmbed('Roblox User Updated',`<@${user.id}> is now \`${v}\`.`)]});}
  if(sub==='set-role'){const v=interaction.options.getString('guild_role').trim();updateRank.run(v,gid,user.id);await refresh(interaction);return interaction.reply({embeds:[successEmbed('Guild Role Updated',`<@${user.id}>: **${row.guild_rank}** → **${v}**`)]});}
  if(sub==='remove'){const reason=interaction.options.getString('reason')||'No reason provided';remove.run(gid,user.id);const roleId=getConfig(gid,'guild_accept_role');const m=await interaction.guild.members.fetch(user.id).catch(()=>null);if(roleId&&m)await m.roles.remove(roleId).catch(()=>{});await refresh(interaction);return interaction.reply({embeds:[successEmbed('Removed From Guild',`<@${user.id}> removed. **Reason:** ${reason}`)]});}
  if(sub==='info') return interaction.reply({embeds:[profile(row)]});
  if(sub==='recruiter'){const r=interaction.options.getUser('recruiter');updateRecruiter.run(r.id,gid,user.id);await refresh(interaction);return interaction.reply({embeds:[successEmbed('Recruiter Updated',`Set to <@${r.id}>.`)]});}
  if(sub==='notes'){updateNotes.run(interaction.options.getString('note'),gid,user.id);return interaction.reply({embeds:[successEmbed('Notes Updated')],ephemeral:true});}
  if(sub==='inactive'){const inactive=interaction.options.getBoolean('inactive');updateActive.run(inactive?0:1,gid,user.id);await refresh(interaction);return interaction.reply({embeds:[successEmbed('Status Updated',`<@${user.id}> is now **${inactive?'inactive':'active'}**.`)]});}
  if(sub==='refresh-list'){await refresh(interaction);return interaction.reply({embeds:[successEmbed('Roster Refreshed')],ephemeral:true});}
  const rows=list.all(gid);const text=rows.length?rows.slice(0,60).map(r=>`<@${r.discord_id}> • \`${r.roblox_username}\` • **${r.guild_rank}**`).join('\n'):'No active members.';return interaction.reply({embeds:[infoEmbed('Guild Roster',text.slice(0,4000))]});
 }
};
