const { OpenAI } = require("openai");
const winston = require('winston');

class ApiHandler {
    constructor(systemPrompt = '') {
        this.systemPrompt = systemPrompt;
        this.anyscale = new OpenAI({
            baseURL: "https://api.endpoints.anyscale.com/v1",
            apiKey: process.env['OPEN_API_KEY'] // Replace with actual API key
        });
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports: [
                new winston.transports.Console(),
                // Additional transports like file or cloud can be added
            ],
        });
        this.userChats = new Map(); // Stores chat sessions for each user
    }

    async makeRequest(userId, userInput) {
        try {
            if (!userInput || typeof userInput !== 'string' || userInput.trim() === '') {
                this.logger.error('User input is empty or not a string');
                throw new Error('User input is empty or not a string.');
            }

            let chat = this.userChats.get(userId);
            if (!chat) {
                chat = { history: [{ role: "system", content: this.systemPrompt }] };
                this.userChats.set(userId, chat);
            }

            chat.history.push({ role: "user", content: userInput });

            const completion = await this.anyscale.chat.completions.create({
                model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
                messages: chat.history,
                temperature: 0.7
            });

            const response = completion.choices[0].message.content;
            chat.history.push({ role: "assistant", content: response });

            return response;
        } catch (error) {
            this.logger.error(`Error making API request for user ${userId}: ${error}`);
            throw error;
        }
    }
}

module.exports = ApiHandler;