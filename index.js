require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const CreditManager = require('./CreditManager');
const CreditHandler = require('./CreditHandler');
const SelfieCommandHandler = require('./SelfieCommandHandler');
const ImagineCommand = require('./ImagineCommand');
const AskSlashCommand = require('./AskSlashCommand');
const BotHandler = require('./BotHandler');
const fs = require('fs');
const pino = require('pino');

// Logger setup for better monitoring and debugging
const logStream = fs.createWriteStream('./task.log');
const logger = pino({ level: 'info' }, logStream);

class MyDiscordBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.validateEnvironmentVariables();

    this.botHandler = new BotHandler(this);
    this.creditManager = new CreditManager();
    this.creditHandler = new CreditHandler(this.creditManager);
    this.selfieCommandHandler = new SelfieCommandHandler(this.creditManager);
    this.imagineCommand = new ImagineCommand();
    this.askSlashCommand = new AskSlashCommand(this.botHandler);

    this.setupHandlers();
    this.registerCommands();
  }

  validateEnvironmentVariables() {
    const requiredEnvVars = ['DISCORD_BOT_TOKEN', 'CLIENT_ID'];
    requiredEnvVars.forEach(varName => {
      if (!process.env[varName]) {
        logger.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
      }
    });
  }

  setupHandlers() {
    this.commands = {
      imagine: this.imagineCommand,
      selfie: this.selfieCommandHandler,
      ask: this.askSlashCommand,
      ...this.creditHandler.commandHandlers
    };
  }

  async registerCommands() {
    const commandsData = [
      this.imagineCommand.getCommandData(),
      this.selfieCommandHandler.getCommandData(),
      this.askSlashCommand.data.toJSON(),
      ...this.creditHandler.getCommandData()
    ];

    const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_BOT_TOKEN);
    try {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsData });
      logger.info('Successfully registered global application commands.');
    } catch (error) {
      logger.error('Error registering global application commands:', error);
      process.exit(1);
    }
  }

  async handleInteraction(interaction) {
    if (!interaction.isCommand()) return;

    const commandHandler = this.commands[interaction.commandName];
    if (!commandHandler) {
      logger.warn(`No handler found for command: ${interaction.commandName}`);
      await interaction.reply({ content: 'Command not recognized.', ephemeral: true });
      return;
    }

    try {
      if (typeof commandHandler.handleInteraction === 'function') {
        await commandHandler.handleInteraction(interaction);
      } else if (typeof commandHandler.execute === 'function') {
        await commandHandler.execute(interaction);
      } else {
        logger.error(`No valid handler method found for command: ${interaction.commandName}`);
        await interaction.reply({ content: 'Command not implemented.', ephemeral: true });
      }
    } catch (error) {
      logger.error({
        message: 'Error handling command',
        commandName: interaction.commandName,
        error: error.message,
        stack: error.stack,
        interactionDetails: interaction.toJSON(),
      });

      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: 'Error processing your request.', ephemeral: true });
      } else {
        await interaction.followUp({ content: 'Error processing your request.', ephemeral: true });
      }
    }
  }
}

const bot = new MyDiscordBot();
bot.on('interactionCreate', (interaction) => bot.handleInteraction(interaction));
bot.login(process.env.DISCORD_BOT_TOKEN);

module.exports = MyDiscordBot;