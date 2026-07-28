const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { logModAction } = require('../../handlers/modActionHelper');
function parseDuration(s){const m=/^(\d+)\s*(m|h|d|w)$/i.exec(s||'');if(!m)return null;return Number(m[1])*({m:60000,h:3600000,d:86400000,w:604800000}[m[2].toLowerCase()]);}
module.exports={data:new SlashCommandBuilder().setName('mute').setDescription('Timeout a member without a mute role').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('duration').setDescription('10m, 2h, 3d').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason')),
async execute(interaction){const member=interaction.options.getMember('user');const ms=parseDuration(interaction.options.getString('duration'));const reason=interaction.options.getString('reason')||'No reason provided';
if(!member||!ms||ms>2419200000)return interaction.reply({embeds:[errorEmbed('Invalid Mute','Use 10m, 2h, 3d, or up to 4w.')],ephemeral:true});
if(!member.moderatable)return interaction.reply({embeds:[errorEmbed('Cannot Mute','Move the bot role above the target’s highest role.')],ephemeral:true});
await member.timeout(ms,reason);logModAction(interaction.guild.id,member.id,interaction.user.id,'mute',reason,ms);return interaction.reply({embeds:[successEmbed('Member Muted',`${member} was timed out for **${interaction.options.getString('duration')}**.\n**Reason:** ${reason}`)]});}}
