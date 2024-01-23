const { Pinecone } = require('@pinecone-database/pinecone');
const winston = require('winston');

class PineconeManager {
    constructor(apiKey, environment, indexName, userDimension = 62, botDimension = 62) {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports: [
                new winston.transports.Console(),
                // Additional transports like file or cloud can be added
            ],
        });

        try {
            this.pinecone = new Pinecone({ apiKey, environment });
            this.indexName = indexName;
            this.userDimension = userDimension;
            this.botDimension = botDimension;

            this.ensureIndexInitialization();
        } catch (error) {
            this.logger.error('PineconeManager Constructor Error:', error);
            throw error;
        }
    }

    async ensureIndexInitialization() {
        try {
            const indexStatus = await this.pinecone.describeIndex(this.indexName);
            if (!indexStatus.status || !indexStatus.status.ready) {
                this.logger.info(`Index ${this.indexName} not ready, attempting to create.`);
                await this.createIndex();
            }
        } catch (error) {
            this.logger.error(`Error in ensureIndexInitialization for ${this.indexName}:`, error);
            await this.createIndex();
        }
    }

    async createIndex() {
        try {
            await this.pinecone.createIndex({
                name: this.indexName,
                dimension: this.userDimension, // Assuming same dimension for user and bot
                waitUntilReady: true,
            });
            this.logger.info(`Index ${this.indexName} created successfully.`);
        } catch (error) {
            this.logger.error(`Error creating index (${this.indexName}):`, error);
            throw error;
        }
    }

    async upsertUserMessage(userId, userMessage) {
        try {
            const numericalUserMessage = this.convertStateToNumericalArray(userMessage, this.userDimension);
            await this.upsert(userId + '_user', numericalUserMessage);
        } catch (error) {
            this.logger.error(`Error upserting user message for ${userId}:`, error);
            throw error;
        }
    }

    async upsertBotResponse(userId, botResponse) {
        try {
            const numericalBotResponse = this.convertStateToNumericalArray(botResponse, this.botDimension);
            await this.upsert(userId + '_bot', numericalBotResponse);
        } catch (error) {
            this.logger.error(`Error upserting bot response for ${userId}:`, error);
            throw error;
        }
    }

    async upsert(id, values) {
        const index = this.pinecone.index(this.indexName);
        await index.upsert([{ id, values }]);
    }

    async retrieveConversationHistory(userId) {
        try {
            const userState = await this.getUserConversationState(userId + '_user');
            const botState = await this.getUserConversationState(userId + '_bot');
            return { userState, botState };
        } catch (error) {
            this.logger.error(`Error retrieving conversation history for ${userId}:`, error);
            throw error;
        }
    }

    async getUserConversationState(id) {
        try {
            const index = this.pinecone.index(this.indexName);
            const response = await index.query({ topK: 1, id });

            if (response.matches && response.matches.length > 0) {
                return this.convertNumericalArrayToState(response.matches[0].values);
            }
            return '';
        } catch (error) {
            this.logger.error(`Error retrieving user conversation state for ${id}:`, error);
            throw error;
        }
    }

    convertStateToNumericalArray(state, dimension) {
        let array = state.split('').map(char => char.charCodeAt(0));
        array = array.length < dimension
            ? [...array, ...new Array(dimension - array.length).fill(0)]
            : array.slice(0, dimension);
        return array;
    }

    convertNumericalArrayToState(array) {
        return String.fromCharCode(...array).trim();
    }

    // Additional methods (deleteIndex, checkIndexHealth, etc.) can be added as needed
}

module.exports = PineconeManager;