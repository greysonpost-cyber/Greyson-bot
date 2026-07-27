const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder().setName('membercount').setDescription('Show the server member count'),
    async execute(interaction) {
        const guild = interaction.guild;
        const humans = guild.members.cache.filter(m => !m.user.bot).size;
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        return interaction.reply({ embeds: [infoEmbed('Member Count', `**Total:** ${guild.memberCount}\n**Humans:** ${humans}\n**Bots:** ${bots}`)] });
    },
};
