const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder().setName('serverinfo').setDescription('Info about this server'),
    async execute(interaction) {
        const guild = interaction.guild;
        const owner = await guild.fetchOwner().catch(() => null);
        const embed = infoEmbed(guild.name, null).addFields(
            { name: 'Owner', value: owner ? `<@${owner.id}>` : 'Unknown', inline: true },
            { name: 'Members', value: `${guild.memberCount}`, inline: true },
            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
            { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
            { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
            { name: 'Boosts', value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true },
        );
        if (guild.iconURL()) embed.setThumbnail(guild.iconURL());
        return interaction.reply({ embeds: [embed] });
    },
};
