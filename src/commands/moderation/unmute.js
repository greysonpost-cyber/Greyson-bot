const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { logModAction } = require('../../handlers/modActionHelper');
module.exports={
 data:new SlashCommandBuilder().setName('unmute').setDescription('Remove a Discord timeout').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason')),
 async execute(interaction){const member=interaction.options.getMember('user'); if(!member) return interaction.reply({embeds:[errorEmbed('Member Not Found')],ephemeral:true});
 const reason=interaction.options.getString('reason')||'No reason provided'; await member.timeout(null,reason); logModAction(interaction.guild.id,member.id,interaction.user.id,'unmute',reason);
 return interaction.reply({embeds:[successEmbed('Timeout Removed',`${member} can speak again.`)]});}
};
