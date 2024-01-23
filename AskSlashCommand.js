const { SlashCommandBuilder } = require("@discordjs/builders");
const userLastChannelMapCache = require("./UserLastChannelMapCache");
const logger = require("./logger");
const BotHandler = require("./BotHandler");

class AskSlashCommand {
    constructor(botHandler) {
        this.data = this._buildCommandData();
        this.botHandler = botHandler || new BotHandler();
    }

    _buildCommandData() {
        return new SlashCommandBuilder()
            .setName("ask")
            .setDescription("Submit a query for the bot to process")
            .addStringOption(option =>
                option.setName("query").setDescription("The query text").setRequired(true)
            );
    }

    async execute(interaction) {
        const userId = interaction.user.id;
        const query = interaction.options.getString("query");
        const channelId = interaction.channelId;
        const guildId = interaction.guild?.id || 'unknown';

        try {
            await interaction.deferReply({ ephemeral: true });

            // Use the updated method to cache the user's last command channel id
            userLastChannelMapCache.set(userId, channelId, "discord", query, guildId);
            await this.botHandler.handleQuery(userId, query, channelId);

            await interaction.editReply({ content: "Your query has been received and is being processed." });
        } catch (error) {
            logger.error(`Error processing query: ${error.message}`, { userId, channelId, guildId });
            await interaction.editReply({ content: "Sorry, there was an error processing your request." });
        }
    }
}

module.exports = AskSlashCommand;