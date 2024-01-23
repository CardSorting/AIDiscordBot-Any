const fastq = require('fastq');
const ApiHandler = require('./ApiHandler');
const CreditManager = require("./CreditManager");
const UserLastChannelMapCache = require("./UserLastChannelMapCache"); // Import the cache class
const { creditConfig } = require("./creditconfig");
const logger = require("./logger");

class QueryHandler {
  constructor() {
    this.apiHandler = new ApiHandler();
    this.creditManager = new CreditManager(creditConfig);
    this.cache = UserLastChannelMapCache; // Use the exported instance directly
    this.queue = fastq(this.processTask.bind(this), 1);
    this.validateEnvironmentVariables();
  }

  validateEnvironmentVariables() {
    const requiredEnvVars = ['GEMINI_API_KEY'];
    requiredEnvVars.forEach(varName => {
      if (!process.env[varName]) {
        const errorMsg = `Missing required environment variable: ${varName}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
    });
  }

  enqueue(userId, lastChannelId) {
    return new Promise((resolve, reject) => {
      if (!this.isValidInput(userId)) {
        reject(new Error("UserId must be a string."));
        return;
      }

      this.queue.push({ userId, lastChannelId }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  isValidInput(userId) {
    return typeof userId === "string";
  }

  async processTask(task, done) {
    try {
      const hasSufficientCredits = await this.handleCreditDeduction(task.userId);
      if (!hasSufficientCredits) {
        throw new Error(`User ${task.userId} has insufficient credits.`);
      }

      const query = this.cache.getQuery(task.userId); 
      if (!query) {
        throw new Error('No query found in cache for user.');
      }

      const apiResponse = await this.apiHandler.makeRequest(task.userId, query);
      logger.info(`Query successfully processed for user: ${task.userId}`);
      done(null, { success: true, response: apiResponse });
    } catch (error) {
      logger.error(`Error processing query for user ${task.userId}: ${error.message}`);
      done(error, null);
    }
  }

  async handleCreditDeduction(userId) {
    return this.creditManager.handleQueryCostDeduction(userId);
  }
}

module.exports = QueryHandler;