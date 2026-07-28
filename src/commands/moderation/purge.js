const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
module.exports = {
 data: new SlashCommandBuilder().setName('purge').setDescription('Delete recent messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption(o=>o.setName('amount').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100))
  .addUserOption(o=>o.setName('user').setDescription('Only delete this user’s messages')),
 async execute(interaction){
  const amount=interaction.options.getInteger('amount'); const user=interaction.options.getUser('user');
  await interaction.deferReply({ephemeral:true});
  const fetched=await interaction.channel.messages.fetch({limit:100});
  const selected=[...fetched.values()].filter(m=>!user||m.author.id===user.id).slice(0,amount);
  const deleted=await interaction.channel.bulkDelete(selected,true).catch(()=>null);
  if(!deleted) return interaction.editReply({embeds:[errorEmbed('Could Not Purge','Messages older than 14 days cannot be bulk deleted.')]});
  return interaction.editReply({embeds:[successEmbed('Messages Deleted',`Deleted **${deleted.size}** message(s).`)]});
 }
};
