const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder().setName('avatar').setDescription("View a user's avatar")
        .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')),
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        return interaction.reply({ embeds: [infoEmbed(`${user.tag}'s Avatar`).setImage(user.displayAvatarURL({ size: 1024 }))] });
    },
};
