const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds');

// Simple in-memory vote tracking (per message). Resets on bot restart -
// fine for lightweight polls; swap for a DB table if you need persistence.
const votes = new Map(); // messageId -> Map(userId -> optionIndex)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a quick poll (up to 4 options)')
        .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
        .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
        .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
        .addStringOption(o => o.setName('option3').setDescription('Option 3'))
        .addStringOption(o => o.setName('option4').setDescription('Option 4')),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const options = [1, 2, 3, 4]
            .map(n => interaction.options.getString(`option${n}`))
            .filter(Boolean);

        const embed = infoEmbed(`📊 ${question}`, options.map((o, i) => `**${i + 1}.** ${o} - 0 votes`).join('\n'))
            .setFooter({ text: `Poll by ${interaction.user.tag}` });
        const row = new ActionRowBuilder().addComponents(
            options.map((o, i) => new ButtonBuilder().setCustomId(`poll_vote:${i}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Primary))
        );

        const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        votes.set(msg.id, { options, tally: new Map() });

        const collector = msg.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });
        collector.on('collect', async (btn) => {
            const state = votes.get(msg.id);
            const choice = Number(btn.customId.split(':')[1]);
            state.tally.set(btn.user.id, choice);

            const counts = state.options.map((_, i) => [...state.tally.values()].filter(v => v === i).length);
            const updated = infoEmbed(`📊 ${question}`, state.options.map((o, i) => `**${i + 1}.** ${o} - ${counts[i]} vote(s)`).join('\n'))
                .setFooter({ text: `Poll by ${interaction.user.tag}` });
            await btn.update({ embeds: [updated] });
        });
        collector.on('end', () => votes.delete(msg.id));
    },
};
