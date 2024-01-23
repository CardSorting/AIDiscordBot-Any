const { SlashCommandBuilder } = require('@discordjs/builders');
const axios = require('axios');
const fastq = require('fastq');
const BackblazeB2 = require('backblaze-b2');
const logger = require('./logger'); // Ensure your logger is properly configured
class ImagineCommand {
    constructor(creditManager) {
        this.b2 = new BackblazeB2({
            applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
            applicationKey: process.env.B2_APPLICATION_KEY,
        });
        this.queue = fastq.promise(this.imageWorker.bind(this), 5);
        this.creditManager = creditManager; // Injected CreditManager instance
    }
    getCommandData() {
        return new SlashCommandBuilder()
            .setName('imagine')
            .setDescription('Generate an image from a text prompt')
            .addStringOption(option =>
                option.setName('prompt')
                    .setDescription('The text prompt for the image')
                    .setRequired(true))
            .toJSON();
    }
    async handleInteraction(interaction) {
        // Defer the reply upfront
        await interaction.deferReply();

        const prompt = interaction.options.getString('prompt');
        const userId = interaction.user.id;

        // Check for credit deduction
        if (!await this.creditManager.deductUserCredits(userId, this.creditManager.RENDER_COST)) {
            await interaction.followUp({ content: 'Insufficient credits to perform this action.', ephemeral: true });
            return;
        }

        // Task pushed to queue without response
        this.queue.push({ interaction, prompt });
    }

  async createImage(prompt) {
      const url = 'https://api.openai.com/v1/images/generations';
      const headers = {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
      };

      const data = {
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: "1024x1024"
      };

      try {
          const response = await axios.post(url, data, { headers: headers });
          logger.info({ message: 'Image generated successfully', prompt: prompt });
          return response.data.data[0].url;
      } catch (error) {
          logger.error({
              message: 'Error in createImage',
              prompt: prompt,
              errorDetails: {
                  error: error.message,
                  stack: error.stack,
                  response: error.response ? error.response.data : null
              }
          });
          throw new Error('Failed to generate image');
      }
  }

async backupToBackblaze(imageUrl, prompt) {
      let fileName;
      try {
          logger.info('Starting authorization with Backblaze B2');
          await this.b2.authorize();
          logger.info('Authorization successful');

          logger.info({ message: 'Fetching image data', imageUrl: imageUrl });
          const imageData = await axios.get(imageUrl, { responseType: 'arraybuffer' });
          logger.info('Image data fetched successfully');

          const bucketId = process.env.B2_BUCKET_ID_GENS; // Ensure this is set in your environment
          const bucketName = process.env.B2_BUCKET_NAME_GENS; // Ensure this is set in your environment
          if (!bucketId || !bucketName) {
              throw new Error('Backblaze B2 bucket ID or name is not set');
          }

          const uploadUrl = await this.b2.getUploadUrl({ bucketId: bucketId });
          const sanitizedPrompt = prompt.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
          fileName = `images/${sanitizedPrompt}_${Date.now()}.png`;

          logger.info({ message: 'Starting image upload to Backblaze B2', fileName: fileName });
          await this.b2.uploadFile({
              uploadUrl: uploadUrl.data.uploadUrl,
              uploadAuthToken: uploadUrl.data.authorizationToken,
              fileName: fileName,
              data: imageData.data,
              mime: 'image/png',
          });

          // Construct and return the Backblaze B2 file URL
          const backblazeUrl = `https://f005.backblazeb2.com/file/${bucketName}/${fileName}`;
          logger.info(`Backup successful for ${fileName}`);
          return backblazeUrl;
      } catch (error) {
          logger.error({
              message: 'Error during backup to Backblaze',
              fileName: fileName,
              imageUrl: imageUrl,
              prompt: prompt,
              errorDetails: {
                  error: error.message,
                  stack: error.stack,
                  response: error.response ? error.response.data : null
              }
          });
          throw new Error('Failed to backup image');
      }
  }

async imageWorker(task, callback) {
        try {
            const imageUrl = await this.createImage(task.prompt);
            const backblazeUrl = await this.backupToBackblaze(imageUrl, task.prompt);
            await task.interaction.followUp({ content: backblazeUrl });
        } catch (error) {
            logger.error(`Error in imageWorker: ${error.message}`);
            await task.interaction.followUp({ content: 'Error processing your request.' });
        } finally {
            callback();
        }
    }
}


module.exports = ImagineCommand;