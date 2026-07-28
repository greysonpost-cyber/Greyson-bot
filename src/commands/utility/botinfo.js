const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder().setName('botinfo').setDescription('Info about this bot'),
    async execute(interaction, client) {
        const uptimeSec = Math.floor(client.uptime / 1000);
        const embed = infoEmbed('🤖 Bot Info', null).addFields(
            { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
            { name: 'Uptime', value: `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`, inline: true },
            { name: 'Commands', value: `${client.commands.size}`, inline: true },
            { name: 'Library', value: 'discord.js v14', inline: true },
        );
        if (client.user.avatarURL()) embed.setThumbnail(client.user.avatarURL());
        return interaction.reply({ embeds: [embed] });
    },
};
