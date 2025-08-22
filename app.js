const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const config = require('./config/config');
const Database = require('./database');
const ClientHandler = require('./handler/clientHandler');

// Импорт админских модулей
const AdminHandler = require('./handler/adminHandler');
const AdminUtils = require('./utils/adminUtils');
const adminConfig = require('./config/adminConfig');

console.log('🚀 Запуск приложения...');

// Проверка конфигурации
console.log('🔧 Проверка конфигурации:');
console.log('- BOT_TOKEN:', config.BOT_TOKEN ? '✅ Установлен' : '❌ Отсутствует');
console.log('- MONGODB_URI:', config.MONGODB_URI ? '✅ Установлен' : '❌ Отсутствует');
console.log('- OPERATORS:', Object.keys(config.OPERATORS).length, 'операторов');
console.log('- ADMIN_IDS:', adminConfig.getAdminIds().length, 'администраторов');

class RealEstateBot {
    constructor() {
        console.log('🤖 Инициализация бота...');

        try {
            this.bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
            console.log('✅ Telegram Bot API подключен');
        } catch (error) {
            console.error('❌ Ошибка подключения к Telegram Bot API:', error);
            process.exit(1);
        }

        try {
            this.database = new Database();
            console.log('✅ Database класс создан');
        } catch (error) {
            console.error('❌ Ошибка создания Database:', error);
            process.exit(1);
        }

        try {
            this.clientHandler = new ClientHandler(this.bot, this.database);
            console.log('✅ ClientHandler создан');
        } catch (error) {
            console.error('❌ Ошибка создания ClientHandler:', error);
            process.exit(1);
        }

        try {
            // Инициализация админ модулей
            this.adminUtils = new AdminUtils(this.bot);
            this.adminHandler = new AdminHandler(this.bot, adminConfig.getAdminIds());

            // Делаем adminUtils глобальным для доступа из других модулей
            global.adminUtils = this.adminUtils;
            console.log('✅ Админ модули созданы');
        } catch (error) {
            console.error('❌ Ошибка создания админ модулей:', error);
            process.exit(1);
        }

        this.setupHandlers();

        // Запуск очистки сессий
        this.adminUtils.startSessionCleaner();

        // Очистка старых обновлений
        this.bot.getUpdates({ offset: -1 }).then(() => {
            console.log('🧹 Старые обновления очищены');
        }).catch(err => {
            console.log('⚠️ Не удалось очистить обновления:', err.message);
        });
    }

    // Метод для экранирования Markdown
    escapeMarkdown(text) {
        if (!text) return '';
        return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
    }

    setupHandlers() {
        console.log('⚙️ Настройка обработчиков событий...');

        // Обработка ошибок бота
        this.bot.on('polling_error', (error) => {
            console.error('❌ Polling error:', error);
        });

        this.bot.on('error', (error) => {
            console.error('❌ Bot error:', error);
        });

        // Команда /start
        this.bot.onText(/\/start/, (msg) => {
            console.log('📥 Получена команда /start от пользователя:', msg.from.id);
            this.clientHandler.handleStart(msg);
        });

        // Команда /admin (только для администраторов)
        this.bot.onText(/\/admin/, (msg) => {
            console.log('📥 Получена команда /admin от пользователя:', msg.from.id);
            if (!adminConfig.isAdmin(msg.from.id)) {
                console.log('🚫 Пользователь не является администратором');
                return this.bot.sendMessage(msg.chat.id, '❌ У вас нет прав администратора');
            }
            this.adminHandler.showAdminMenu(msg.chat.id);
        });

        // Обработка фотографий
        this.bot.on('photo', (msg) => {
            console.log('📸 Получена фотография от пользователя:', msg.from.id);

            // Проверяем, что это администратор
            if (!adminConfig.isAdmin(msg.from.id)) {
                console.log('🚫 Пользователь не является администратором');
                return this.bot.sendMessage(msg.chat.id, '❌ Только администраторы могут загружать фотографии');
            }

            // Проверяем наличие активной сессии
            const session = this.adminUtils.getSession(msg.from.id);
            console.log('🔍 Проверка сессии перед загрузкой фотографии:', session);

            if (!session || session.type !== 'uploading_product_photo') {
                console.log('❌ Нет активной сессии загрузки фотографии');
                return this.bot.sendMessage(msg.chat.id,
                    '❌ Сначала выберите товар для добавления фотографии через команду /admin → Управление товарами → Редактировать товар → Управление фото → Добавить фото');
            }

            console.log('✅ Передача фотографии в AdminHandler');
            // Передаем обработку фотографии в AdminHandler
            this.adminHandler.handlePhotoUpload(msg);
        });

        // Обработка callback запросов
        this.bot.on('callback_query', (callbackQuery) => {
            console.log('📞 Получен callback от пользователя:', callbackQuery.from.id, 'данные:', callbackQuery.data);

            // Если это админский callback и пользователь админ
            if (adminConfig.isAdmin(callbackQuery.from.id) &&
                callbackQuery.data.startsWith('admin_')) {
                console.log('👑 Обработка админского callback');
                // AdminHandler уже обрабатывает админские callback'и
                return;
            }

            // Обычные callback'и для клиентов
            console.log('👤 Обработка клиентского callback');
            this.clientHandler.handleCallback(callbackQuery);
        });

        // Обработка текстовых сообщений
        this.bot.on('message', (msg) => {
            // Пропускаем команды
            if (msg.text && msg.text.startsWith('/')) return;

            // Пропускаем фотографии (они обрабатываются отдельно)
            if (msg.photo) return;

            console.log('💬 Получено текстовое сообщение от пользователя:', msg.from.id, 'текст:', msg.text);

            // Проверяем, есть ли активная админская сессия
            const session = this.adminUtils.getSession(msg.from.id);
            if (session && adminConfig.isAdmin(msg.from.id)) {
                console.log('👑 Обработка админского ввода');
                this.handleAdminInput(msg, session);
                return;
            }

            // Обычная обработка для клиентов
            console.log('👤 Обработка клиентского сообщения');
            this.clientHandler.handleTextMessage(msg);
        });

        console.log('✅ Обработчики событий настроены');
        console.log('🤖 Бот запущен!');
        console.log(`👑 Администраторы: ${adminConfig.getAdminIds().join(', ')}`);
    }

    // Обработка ввода данных администратором
    async handleAdminInput(msg, session) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        console.log('Обработка админского ввода:', {
            userId,
            sessionType: session.type,
            text: text ? text.substring(0, 50) : 'no text'
        });

        try {
            switch (session.type) {
                case 'adding_category_name':
                    await this.handleCategoryNameInput(chatId, userId, text);
                    break;

                case 'editing_category_name':
                    await this.handleEditCategoryName(chatId, userId, text, session.data.categoryId);
                    break;

                case 'adding_product_name':
                    await this.handleProductNameInput(chatId, userId, text, session.data.categoryId);
                    break;

                case 'adding_product_price':
                    await this.handleNewProductPriceInput(chatId, userId, text, session.data);
                    break;

                case 'editing_product_name':
                    await this.handleEditProductName(chatId, userId, text, session.data.productId);
                    break;

                case 'editing_product_description':
                    await this.handleEditProductDescription(chatId, userId, text, session.data.productId);
                    break;

                case 'editing_product_price':
                    await this.handleProductPriceInput(chatId, userId, text, session.data.productId);
                    break;

                case 'adding_operator_name':
                    await this.handleOperatorNameInput(chatId, userId, text);
                    break;

                case 'adding_operator_username':
                    await this.handleOperatorUsernameInput(chatId, userId, text, session.data.operatorName);
                    break;

                case 'editing_operator_name':
                    await this.handleEditOperatorName(chatId, userId, text, session.data.operatorId);
                    break;

                case 'editing_operator_username':
                    await this.handleEditOperatorUsername(chatId, userId, text, session.data.operatorId);
                    break;

                default:
                    console.log('Неизвестный тип сессии:', session.type);
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

    // === ОБРАБОТЧИКИ КАТЕГОРИЙ ===
    async handleCategoryNameInput(chatId, userId, text) {
        const validation = this.adminUtils.validateName(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        try {
            const Category = require('./models/Category');
            const category = new Category({
                name: validation.value,
                description: '',
                isActive: true,
                order: 0
            });

            await category.save();
            this.adminUtils.clearSession(userId);

            const escapedName = this.escapeMarkdown(validation.value);
            this.bot.sendMessage(chatId, `✅ Категория "${escapedName}" успешно создана!`, {
                parse_mode: 'Markdown'
            });

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
            const escapedName = this.escapeMarkdown(validation.value);
            this.bot.sendMessage(chatId, `✅ Название категории обновлено на "${escapedName}"`, {
                parse_mode: 'Markdown'
            });

            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit category name error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении названия категории.');
        }
    }

    // === ОБРАБОТЧИКИ ТОВАРОВ (БЕЗ ОГРАНИЧЕНИЙ ЦЕНЫ) ===
    async handleProductNameInput(chatId, userId, text, categoryId) {
        const validation = this.adminUtils.validateName(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        this.adminUtils.createSession(userId, 'adding_product_price', {
            categoryId: categoryId,
            productName: validation.value
        });

        const escapedName = this.escapeMarkdown(validation.value);
        this.bot.sendMessage(chatId, `📝 Название товара: "${escapedName}"\n\n💰 Введите цену в кронах (любую положительную сумму):`, {
            parse_mode: 'Markdown'
        });
    }

    async handleNewProductPriceInput(chatId, userId, text, sessionData) {
        const validation = this.adminUtils.validatePrice(text);

        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        try {
            const Property = require('./models/Property');

            const priceCZK = validation.value;

            const product = new Property({
                categoryId: sessionData.categoryId,
                name: sessionData.productName,
                description: '',
                priceInCZK: priceCZK,
                currency: 'CZK',
                specifications: {},
                isAvailable: true,
                order: 0,
                photos: []
            });

            await product.save();
            this.adminUtils.clearSession(userId);

            const escapedName = this.escapeMarkdown(sessionData.productName);
            this.bot.sendMessage(chatId, `✅ Товар "${escapedName}" создан!\n\n💰 Цена: ${this.formatPrice(priceCZK)}\n\n📷 Теперь вы можете добавить фотографии через редактирование товара.`, {
                parse_mode: 'Markdown'
            });

            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Create product error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при создании товара.');
        }
    }

    async handleEditProductName(chatId, userId, text, productId) {
        const validation = this.adminUtils.validateName(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        try {
            const Property = require('./models/Property');
            await Property.findByIdAndUpdate(productId, { name: validation.value });

            this.adminUtils.clearSession(userId);
            const escapedName = this.escapeMarkdown(validation.value);
            this.bot.sendMessage(chatId, `✅ Название товара обновлено на "${escapedName}"`, {
                parse_mode: 'Markdown'
            });

            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit product name error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении названия товара.');
        }
    }

    async handleEditProductDescription(chatId, userId, text, productId) {
        console.log('Обработка редактирования описания товара:', { userId, productId, text: text?.substring(0, 50) });

        if (!text || text.trim().length === 0) {
            return this.bot.sendMessage(chatId, `❌ Описание не может быть пустым.\nПопробуйте еще раз:`);
        }

        const trimmedText = text.trim();
        if (trimmedText.length > 500) {
            return this.bot.sendMessage(chatId, `❌ Описание не должно превышать 500 символов (сейчас: ${trimmedText.length}).\nПопробуйте еще раз:`);
        }

        try {
            const Property = require('./models/Property');
            const product = await Property.findById(productId);

            if (!product) {
                this.adminUtils.clearSession(userId);
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            await Property.findByIdAndUpdate(productId, { description: trimmedText });

            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '✅ Описание товара обновлено!');

            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit product description error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении описания товара.');
        }
    }

    async handleProductPriceInput(chatId, userId, text, productId) {
        const validation = this.adminUtils.validatePrice(text);

        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\n\nПопробуйте еще раз:`);
        }

        try {
            const Property = require('./models/Property');
            const product = await Property.findById(productId);

            if (!product) {
                this.adminUtils.clearSession(userId);
                return this.bot.sendMessage(chatId, '❌ Товар не найден.');
            }

            const priceCZK = validation.value;

            const updateData = {
                priceInCZK: priceCZK,
                currency: 'CZK'
            };

            await Property.findByIdAndUpdate(productId, updateData);

            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, `✅ Цена товара обновлена!\n\n💰 Новая цена: ${this.formatPrice(priceCZK)}`, {
                parse_mode: 'Markdown'
            });

            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit product price error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении цены товара.');
        }
    }

    // === ОБРАБОТЧИКИ ОПЕРАТОРОВ ===
    async handleOperatorNameInput(chatId, userId, text) {
        const validation = this.adminUtils.validateName(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        this.adminUtils.createSession(userId, 'adding_operator_username', {
            operatorName: validation.value
        });

        const escapedName = this.escapeMarkdown(validation.value);
        this.bot.sendMessage(chatId, `👤 Имя оператора: "${escapedName}"\n\n📱 Введите username оператора (без @):`, {
            parse_mode: 'Markdown'
        });
    }

    async handleOperatorUsernameInput(chatId, userId, text, operatorName) {
        const username = text.trim().replace('@', '');

        if (!username || username.length < 3) {
            return this.bot.sendMessage(chatId, `❌ Username должен содержать минимум 3 символа\nПопробуйте еще раз:`);
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return this.bot.sendMessage(chatId, `❌ Username может содержать только буквы, цифры и подчеркивания\nПопробуйте еще раз:`);
        }

        try {
            const Operator = require('./models/Operator');

            const existingOperator = await Operator.findOne({ username: username });
            if (existingOperator) {
                return this.bot.sendMessage(chatId, `❌ Оператор с username @${username} уже существует\nВведите другой username:`);
            }

            const operator = new Operator({
                name: operatorName,
                username: username,
                description: '',
                isActive: true,
                specialization: 'general',
                order: 0
            });

            await operator.save();
            this.adminUtils.clearSession(userId);

            const escapedName = this.escapeMarkdown(operatorName);
            this.bot.sendMessage(chatId, `✅ Оператор "${escapedName}" (@${username}) успешно создан!`, {
                parse_mode: 'Markdown'
            });

            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Create operator error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при создании оператора.');
        }
    }

    async handleEditOperatorName(chatId, userId, text, operatorId) {
        const validation = this.adminUtils.validateName(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        try {
            const Operator = require('./models/Operator');
            await Operator.findByIdAndUpdate(operatorId, { name: validation.value });

            this.adminUtils.clearSession(userId);
            const escapedName = this.escapeMarkdown(validation.value);
            this.bot.sendMessage(chatId, `✅ Имя оператора обновлено на "${escapedName}"`, {
                parse_mode: 'Markdown'
            });

            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit operator name error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении имени оператора.');
        }
    }

    async handleEditOperatorUsername(chatId, userId, text, operatorId) {
        const username = text.trim().replace('@', '');

        if (!username || username.length < 3) {
            return this.bot.sendMessage(chatId, `❌ Username должен содержать минимум 3 символа\nПопробуйте еще раз:`);
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return this.bot.sendMessage(chatId, `❌ Username может содержать только буквы, цифры и подчеркивания\nПопробуйте еще раз:`);
        }

        try {
            const Operator = require('./models/Operator');

            const existingOperator = await Operator.findOne({
                username: username,
                _id: { $ne: operatorId }
            });

            if (existingOperator) {
                return this.bot.sendMessage(chatId, `❌ Оператор с username @${username} уже существует\nВведите другой username:`);
            }

            await Operator.findByIdAndUpdate(operatorId, { username: username });

            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, `✅ Username оператора обновлен на "@${username}"`, {
                parse_mode: 'Markdown'
            });

            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit operator username error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении username оператора.');
        }
    }

    // === УПРОЩЕННЫЙ МЕТОД ФОРМАТИРОВАНИЯ ЦЕНЫ ===
    formatPrice(price) {
        return `${new Intl.NumberFormat('cs-CZ').format(price)} Kč`;
    }
}

// Запуск бота с обработкой ошибок
try {
    console.log('🎯 Создание экземпляра бота...');
    new RealEstateBot();
} catch (error) {
    console.error('💥 Критическая ошибка при запуске:', error);
    process.exit(1);
}