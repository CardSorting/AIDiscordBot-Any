const { EmbedBuilder } = require('discord.js');
const userLastChannelMapCache = require('./UserLastChannelMapCache');
const logger = require('./logger');
const QueryHandler = require('./QueryHandler');
const fs = require('fs');
const path = require('path');

class BotHandler {
  constructor(client) {
    this.validateClient(client);
    this.client = client;
    this.queryHandler = new QueryHandler();
    this.chatLogFilePath = path.join(__dirname, 'chatlog.json');
  }

  validateClient(client) {
    if (!client) {
      logger.error('BotHandler requires a valid Discord client instance.');
      throw new Error('Invalid Discord client instance.');
    }
  }

  async handleQuery(userId, query, guildId) {
    try {
      const result = await this.queryHandler.enqueue(userId, query, guildId);
      if (!result || !result.success) {
        throw new Error('Query processing failed');
      }
      await this.respondToUser(userId, query, result.response);
    } catch (error) {
      logger.error('Error in handleQuery', { userId, query, guildId, error });
    }
  }

  async respondToUser(userId, originalQuery, responseMessage) {
    let channelId;
    try {
      channelId = userLastChannelMapCache.getLastCommandChannelId(userId);
      if (!channelId) {
        throw new Error('No channel ID found in cache');
      }

      const channel = await this.fetchChannel(channelId);
      if (!channel) {
        throw new Error('Channel fetch failed');
      }

      const user = await this.fetchUser(userId);
      if (!user) {
        throw new Error('User fetch failed');
      }

      const embed = this.createResponseEmbed(originalQuery, responseMessage, user);
      await this.retrySend(channel, embed, 3);
      this.appendToChatLog(originalQuery, responseMessage);
    } catch (error) {
      logger.error('Error in respondToUser', {
        userId,
        channelId,
        originalQuery,
        responseMessage,
        error: { message: error.message, stack: error.stack }
      });
      // Optional: Send a user-friendly error message to the channel or user
    } finally {
      userLastChannelMapCache.clearUserCache(userId);
    }
  }

  async fetchChannel(channelId) {
    try {
      return await this.client.channels.fetch(channelId);
    } catch (error) {
      logger.error('Error fetching channel', { channelId, error });
      throw error; // Rethrow the error for upstream handling
    }
  }

  async fetchUser(userId) {
    try {
      return await this.client.users.fetch(userId);
    } catch (error) {
      logger.error('Error fetching user', { userId, error });
      throw error; // Rethrow the error for upstream handling
    }
  }

  async retrySend(channel, embed, retries) {
    let attempt = 0;
    while (attempt < retries) {
      try {
        await channel.send({ embeds: [embed] });
        return;
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          logger.error('All retries failed for sending response', { channelId: channel?.id, error });
          throw error; // Rethrow the error for upstream handling
        }
      }
    }
  }

  createResponseEmbed(query, responseMessage, user) {
    return new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Mina Chats')
      .setFooter({ text: `Requested by ${user?.tag}`, iconURL: user?.displayAvatarURL() })
      .setTimestamp()
      .addFields(
        { name: 'Your Query', value: query || 'No query provided' },
        { name: 'Response', value: responseMessage || 'No response provided' }
      );
  }

  appendToChatLog(prompt, completion) {
    const dataLine = JSON.stringify({ prompt, completion }) + '\n';
    fs.appendFile(this.chatLogFilePath, dataLine, (err) => {
      if (err) {
        logger.error('Error appending to the chat log', { error: err.message });
      } else {
        logger.info('Successfully appended to the chat log');
      }
    });
  }
}

module.exports = BotHandler;