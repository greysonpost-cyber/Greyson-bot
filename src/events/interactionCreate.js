const { errorEmbed } = require('../utils/embeds');
const { canRunCommand, hasCommandPermissions } = require('../utils/permissions');
const ticketHandler = require('../handlers/ticketHandler');
const reportHandler = require('../handlers/reportHandler');
const giveawayHandler = require('../handlers/giveawayHandler');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            // ---------------- Slash commands ----------------
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;

                const sub = interaction.options.getSubcommand(false);
                const permissionKey = sub ? `${interaction.commandName}.${sub}` : interaction.commandName;
                const keyToCheck = interaction.inGuild() && hasCommandPermissions(interaction.guild.id, permissionKey)
                    ? permissionKey : interaction.commandName;
                if (interaction.inGuild() && !canRunCommand(interaction.member, keyToCheck)) {
                    return interaction.reply({
                        embeds: [errorEmbed('No Permission', "You don't have permission to use this command.")],
                        ephemeral: true,
                    });
                }

                await command.execute(interaction, client);
                return;
            }

            // ---------------- Autocomplete ----------------
            if (interaction.isAutocomplete()) {
                const command = client.commands.get(interaction.commandName);
                if (command?.autocomplete) await command.autocomplete(interaction, client);
                return;
            }

            // ---------------- Buttons / Select menus / Modals ----------------
            const customId = interaction.customId || '';

            if (customId.startsWith('ticket_')) return ticketHandler.handleInteraction(interaction, client);
            if (customId.startsWith('report_')) return reportHandler.handleInteraction(interaction, client);
            if (customId.startsWith('giveaway_')) return giveawayHandler.handleInteraction(interaction, client);
        } catch (err) {
            console.error('[interactionCreate] Error:', err);
            const payload = { embeds: [errorEmbed('Something went wrong', 'That action could not be completed. Please try again or contact staff.')], ephemeral: true };
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(payload).catch(() => {});
            } else if (interaction.isRepliable?.()) {
                await interaction.reply(payload).catch(() => {});
            }
        }
    },
};
