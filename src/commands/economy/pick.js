const {SlashCommandBuilder}=require('discord.js');const drops=require('../../services/tokenDrops');
module.exports={data:new SlashCommandBuilder().setName('pick').setDescription('Pick up the active Power Token drop in this channel'),async execute(i){return drops.pick(i)}};
