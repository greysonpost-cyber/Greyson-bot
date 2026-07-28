const { SlashCommandBuilder } = require('discord.js');
const { successEmbed } = require('../../utils/embeds');
const { logModAction } = require('../../handlers/modActionHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notes')
        .setDescription('Add a staff-only note to a member (visible via /history)')
        .addUserOption(o => o.setName('user').setDescription('User to note').setRequired(true))
        .addStringOption(o => o.setName('note').setDescription('Note content').setRequired(true)),

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const note = interaction.options.getString('note');
        logModAction(interaction.guild.id, user.id, interaction.user.id, 'note', note);
        return interaction.reply({ embeds: [successEmbed('Note Added', `Note added for <@${user.id}>.`)], ephemeral: true });
    },
};
