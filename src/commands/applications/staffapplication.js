const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { setConfig, getConfig } = require('../../utils/config');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');

function validHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staffapplication')
        .setDescription('Configure or post the server staff application')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sc => sc
            .setName('set-link')
            .setDescription('Set the staff application link')
            .addStringOption(o => o
                .setName('link')
                .setDescription('Google Form or other application URL')
                .setRequired(true)))
        .addSubcommand(sc => sc
            .setName('send')
            .setDescription('Post the staff application link')
            .addChannelOption(o => o
                .setName('channel')
                .setDescription('Channel to post in; defaults to this channel')
                .addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o
                .setName('message')
                .setDescription('Optional message shown above the application button')
                .setMaxLength(1000))),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ embeds: [errorEmbed('Admin Only', 'Only server administrators can use this command.')], ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();
        if (sub === 'set-link') {
            const link = interaction.options.getString('link', true).trim();
            if (!validHttpUrl(link)) {
                return interaction.reply({ embeds: [errorEmbed('Invalid Link', 'Enter a complete `https://` or `http://` application link.')], ephemeral: true });
            }
            setConfig(interaction.guild.id, 'staff_application_url', link);
            return interaction.reply({ embeds: [successEmbed('Staff Application Saved', 'Use `/staffapplication send` whenever you want the bot to post it.')], ephemeral: true });
        }

        const link = getConfig(interaction.guild.id, 'staff_application_url');
        if (!link || !validHttpUrl(link)) {
            return interaction.reply({ embeds: [errorEmbed('No Application Link', 'Set one first with `/staffapplication set-link`.')], ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const customMessage = interaction.options.getString('message');
        const embed = infoEmbed(
            '📝 Staff Applications',
            customMessage || 'Interested in helping the server? Press the button below to complete the staff application.'
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Apply for Staff')
                .setEmoji('📝')
                .setStyle(ButtonStyle.Link)
                .setURL(link)
        );

        await channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ embeds: [successEmbed('Application Posted', `The staff application was posted in ${channel}.`)], ephemeral: true });
    },
};
