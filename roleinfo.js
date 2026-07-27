const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder().setName('roleinfo').setDescription('View info about a role')
        .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)),
    async execute(interaction) {
        const role = interaction.options.getRole('role');
        const embed = infoEmbed(role.name, null).setColor(role.color || 0x2B2D31).addFields(
            { name: 'ID', value: role.id, inline: true },
            { name: 'Color', value: role.hexColor, inline: true },
            { name: 'Members', value: `${role.members.size}`, inline: true },
            { name: 'Position', value: `${role.position}`, inline: true },
            { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
            { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
        );
        return interaction.reply({ embeds: [embed] });
    },
};
