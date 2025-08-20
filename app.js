const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const config = require('./config');
const Database = require('./database');
const ClientHandler = require('./clientHandler');

class RealEstateBot {
    constructor() {
        this.bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
        this.database = new Database();
        this.clientHandler = new ClientHandler(this.bot, this.database);
        this.setupHandlers();
    }

    setupHandlers() {
        this.bot.onText(/\/start/, (msg) => {
            this.clientHandler.handleStart(msg);
        });

        this.bot.on('callback_query', (callbackQuery) => {
            this.clientHandler.handleCallback(callbackQuery);
        });

        this.bot.on('message', (msg) => {
            if (msg.text && msg.text.startsWith('/')) return;
            this.clientHandler.handleTextMessage(msg);
        });

        console.log('🤖 Бот запущен!');
    }
}

new RealEstateBot();