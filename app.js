const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const config = require('./config');
const Database = require('./database');
const ClientHandler = require('./clientHandler');

// Импорт админских модулей
const AdminHandler = require('./handler/adminHandler');
const AdminUtils = require('./utlis/adminUtils');
const adminConfig = require('./adminConfig');

class RealEstateBot {
    constructor() {
        this.bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
        this.database = new Database();
        this.clientHandler = new ClientHandler(this.bot, this.database);
        
        // Инициализация админ модулей
        this.adminUtils = new AdminUtils(this.bot);
        this.adminHandler = new AdminHandler(this.bot, adminConfig.getAdminIds());
        
        this.setupHandlers();
        
        // Запуск очистки сессий
        this.adminUtils.startSessionCleaner();
    }

    setupHandlers() {
        // Команда /start
        this.bot.onText(/\/start/, (msg) => {
            this.clientHandler.handleStart(msg);
        });

        // Команда /admin (только для администраторов)
        this.bot.onText(/\/admin/, (msg) => {
            if (!adminConfig.isAdmin(msg.from.id)) {
                return this.bot.sendMessage(msg.chat.id, '❌ У вас нет прав администратора');
            }
            // AdminHandler уже обрабатывает эту команду
        });

        // Обработка callback запросов
        this.bot.on('callback_query', (callbackQuery) => {
            // Если это админский callback и пользователь админ
            if (adminConfig.isAdmin(callbackQuery.from.id) && 
                callbackQuery.data.startsWith('admin_')) {
                // AdminHandler уже обрабатывает админские callback'и
                return;
            }
            
            // Обычные callback'и для клиентов
            this.clientHandler.handleCallback(callbackQuery);
        });

        // Обработка текстовых сообщений
        this.bot.on('message', (msg) => {
            // Пропускаем команды
            if (msg.text && msg.text.startsWith('/')) return;
            
            // Проверяем, есть ли активная админская сессия
            const session = this.adminUtils.getSession(msg.from.id);
            if (session && adminConfig.isAdmin(msg.from.id)) {
                this.handleAdminInput(msg, session);
                return;
            }
            
            // Обычная обработка для клиентов
            this.clientHandler.handleTextMessage(msg);
        });

        console.log('🤖 Бот запущен!');
        console.log(`👑 Администраторы: ${adminConfig.getAdminIds().join(', ')}`);
    }

    // Обработка ввода данных администратором
    async handleAdminInput(msg, session) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        try {
            switch (session.type) {
                case 'adding_category_name':
                    await this.handleCategoryNameInput(chatId, userId, text);
                    break;
                    
                case 'adding_category_description':
                    await this.handleCategoryDescriptionInput(chatId, userId, text, session.data.name);
                    break;
                    
                case 'editing_category_name':
                    await this.handleEditCategoryName(chatId, userId, text, session.data.categoryId);
                    break;
                    
                case 'editing_category_description':
                    await this.handleEditCategoryDescription(chatId, userId, text, session.data.categoryId);
                    break;
                    
                case 'editing_category_order':
                    await this.handleEditCategoryOrder(chatId, userId, text, session.data.categoryId);
                    break;
                    
                default:
                    // Неизвестный тип сессии, очищаем
                    this.adminUtils.clearSession(userId);
                    this.bot.sendMessage(chatId, '❌ Сессия устарела. Попробуйте еще раз.');
                    break;
            }
        } catch (error) {
            console.error('Admin input error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз.');
        }
    }

    // === ОБРАБОТЧИКИ ВВОДА ДАННЫХ ===

    async handleCategoryNameInput(chatId, userId, text) {
        const validation = this.adminUtils.validateName(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        // Переходим к вводу описания
        this.adminUtils.createSession(userId, 'adding_category_description', { name: validation.value });
        this.bot.sendMessage(chatId, 
            `📝 Название: *${validation.value}*\n\nВведите описание категории (или напишите "пропустить"):`,
            { parse_mode: 'Markdown' }
        );
    }

    async handleCategoryDescriptionInput(chatId, userId, text, name) {
        const description = text.trim() === 'пропустить' ? '' : text.trim();
        const validation = this.adminUtils.validateDescription(description);
        
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        // Создаем категорию
        try {
            const Category = require('./models/Category');
            const category = new Category({
                name,
                description: validation.value,
                isActive: true,
                order: 0
            });

            await category.save();
            this.adminUtils.clearSession(userId);
            
            this.bot.sendMessage(chatId, `✅ Категория "*${name}*" успешно создана!`, {
                parse_mode: 'Markdown'
            });
            
            // Показываем админ меню через секунду
            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Create category error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при создании категории. Возможно, такая категория уже существует.');
        }
    }

    async handleEditCategoryName(chatId, userId, text, categoryId) {
        const validation = this.adminUtils.validateName(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        try {
            const Category = require('./models/Category');
            await Category.findByIdAndUpdate(categoryId, { name: validation.value });
            
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, `✅ Название категории обновлено на "*${validation.value}*"`, {
                parse_mode: 'Markdown'
            });
            
            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit category name error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении названия категории.');
        }
    }

    async handleEditCategoryDescription(chatId, userId, text, categoryId) {
        const description = text.trim() === 'пропустить' ? '' : text.trim();
        const validation = this.adminUtils.validateDescription(description);
        
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        try {
            const Category = require('./models/Category');
            await Category.findByIdAndUpdate(categoryId, { description: validation.value });
            
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '✅ Описание категории обновлено!');
            
            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit category description error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении описания категории.');
        }
    }

    async handleEditCategoryOrder(chatId, userId, text, categoryId) {
        const validation = this.adminUtils.validateOrder(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        try {
            const Category = require('./models/Category');
            await Category.findByIdAndUpdate(categoryId, { order: validation.value });
            
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, `✅ Порядок категории обновлен на ${validation.value}`);
            
            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit category order error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении порядка категории.');
        }
    }
}

new RealEstateBot();

