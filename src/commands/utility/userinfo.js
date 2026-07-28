const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder().setName('userinfo').setDescription('View info about a member')
        .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')),
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const embed = infoEmbed(user.tag, null)
            .setThumbnail(user.displayAvatarURL())
            .addFields(
                { name: 'User ID', value: user.id, inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
            );
        if (member) {
            embed.addFields(
                { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: true },
                { name: 'Roles', value: member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).join(', ') || 'None' },
            );
        }
        return interaction.reply({ embeds: [embed] });
    },
};
