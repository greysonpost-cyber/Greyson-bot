const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds');
const { getHistory } = require('../../handlers/modActionHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription("View a member's moderation history")
        .addUserOption(o => o.setName('user').setDescription('User to look up').setRequired(true)),

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const actions = getHistory(interaction.guild.id, user.id);

        if (!actions.length) return interaction.reply({ embeds: [infoEmbed('No History', `<@${user.id}> has no recorded moderation actions.`)], ephemeral: true });

        const lines = actions.slice(0, 20).map(a =>
            `**${a.action_type.toUpperCase()}** - <t:${Math.floor(a.created_at / 1000)}:R> by <@${a.moderator_id}>\n> ${a.reason || '*no reason given*'}`
        );

        return interaction.reply({
            embeds: [infoEmbed(`Moderation History - ${user.tag}`, lines.join('\n\n')).setFooter({ text: `${actions.length} total action(s)${actions.length > 20 ? ' - showing most recent 20' : ''}` })],
            ephemeral: true,
        });
    },
};
