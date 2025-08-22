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
            console.log('📝 Данные сообщения:', {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                photo_count: msg.photo.length,
                caption: msg.caption
            });

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

            console.log('💬 Получено текстовое сообщение от пользователя:', msg.from.id);

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

    // === ОБРАБОТЧИКИ ТОВАРОВ ===

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
        this.bot.sendMessage(chatId, `📝 Название товара: "${escapedName}"\n\n💰 Введите цену в кронах:`, {
            parse_mode: 'Markdown'
        });
    }

    async handleNewProductPriceInput(chatId, userId, text, sessionData) {
        const priceValue = parseInt(text.replace(/\D/g, ''));

        if (isNaN(priceValue) || priceValue <= 0) {
            return this.bot.sendMessage(chatId, `❌ Введите корректную цену (только числа):\nПопробуйте еще раз:`);
        }

        try {
            const Property = require('./models/Property');

            const priceCZK = priceValue;
            const priceRUB = Math.round(priceValue * 2.5);

            const product = new Property({
                categoryId: sessionData.categoryId,
                name: sessionData.productName,
                description: '',
                price: priceRUB,
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
            this.bot.sendMessage(chatId, `✅ Товар "${escapedName}" создан!\n\n💰 Цена: ${this.formatPrice(priceCZK, 'CZK')}\n\n📷 Теперь вы можете добавить фотографии через редактирование товара.`, {
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
        const priceData = this.parsePriceWithCurrency(text);

        if (!priceData.valid) {
            return this.bot.sendMessage(chatId, `❌ ${priceData.error}\n\nПримеры:\n• 5000000 (рубли)\n• 5000000 RUB\n• 2000000 CZK\n• 2000000 крон\n\nПопробуйте еще раз:`);
        }

        try {
            const Property = require('./models/Property');
            const product = await Property.findById(productId);

            if (!product) {
                this.adminUtils.clearSession(userId);
                return this.bot.sendMessage(chatId, '❌ Товар не найден.');
            }

            let updateData = {};

            if (priceData.currency === 'CZK') {
                updateData.priceInCZK = priceData.value;
                updateData.price = Math.round(priceData.value * 2.5);
                updateData.currency = 'CZK';
            } else {
                updateData.price = priceData.value;
                updateData.priceInCZK = Math.round(priceData.value / 2.5);
                updateData.currency = 'RUB';
            }

            await Property.findByIdAndUpdate(productId, updateData);

            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, `✅ Цена товара обновлена!\n\n💰 Новая цена:\n• ${this.formatPrice(updateData.price, 'RUB')}\n• ${this.formatPrice(updateData.priceInCZK, 'CZK')}\n\n🎯 Основная валюта: ${priceData.currency}`, {
                parse_mode: 'Markdown'
            });

            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit product price error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении цены товара.');
        }
    }

    // === УТИЛИТЫ ДЛЯ РАБОТЫ С ВАЛЮТАМИ ===

    parsePriceWithCurrency(text) {
        const input = text.trim().toLowerCase();

        const patterns = [
            /^(\d+(?:\.\d+)?)\s*(czk|чеш|крон|кчк|kč)$/i,
            /^(\d+(?:\.\d+)?)\s*(rub|руб|рубл)$/i,
            /^(\d+(?:\.\d+)?)$/
        ];

        for (const pattern of patterns) {
            const match = input.match(pattern);
            if (match) {
                const value = parseFloat(match[1]);
                let currency = 'RUB';

                if (match[2]) {
                    const currencyStr = match[2].toLowerCase();
                    if (currencyStr.includes('czk') || currencyStr.includes('чеш') ||
                        currencyStr.includes('крон') || currencyStr.includes('кчк') ||
                        currencyStr.includes('kč')) {
                        currency = 'CZK';
                    }
                }

                if (isNaN(value) || value <= 0) {
                    return { valid: false, error: 'Цена должна быть положительным числом' };
                }

                if (currency === 'CZK' && value < 50000) {
                    return { valid: false, error: 'Минимальная цена: 50,000 Kč' };
                }

                if (currency === 'RUB' && value < 100000) {
                    return { valid: false, error: 'Минимальная цена: 100,000 ₽' };
                }

                if (value > 500000000) {
                    return { valid: false, error: 'Максимальная цена: 500,000,000' };
                }

                return { valid: true, value: Math.round(value), currency };
            }
        }

        return {
            valid: false,
            error: 'Неверный формат цены. Используйте: "цена валюта" (например: 2000000 CZK или 5000000 RUB)'
        };
    }

    formatPrice(price, currency) {
        const formatted = new Intl.NumberFormat('ru-RU').format(price);

        switch (currency) {
            case 'CZK':
                return `${formatted} Kč`;
            case 'RUB':
                return `${formatted} ₽`;
            default:
                return `${formatted} ${currency}`;
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

    // === УПРОЩЕННЫЙ МЕТОД ФОРМАТИРОВАНИЯ ЦЕНЫ ===

    formatPrice(price) {
        return `${new Intl.NumberFormat('cs-CZ').format(price)} Kč`;
    }

    // === ОБНОВЛЕННЫЙ МЕТОД completeOrder ===

    async completeOrder(chatId, messageId) {
        try {
            const session = this.getUserSession(chatId);
            const user = await this.db.getUserById(chatId);

            if (session.cart.length === 0) {
                await this.bot.editMessageText(
                    "🛒 Ваша корзина пуста!",
                    { chat_id: chatId, message_id: messageId, ...Keyboards.getStartKeyboard() }
                );
                return;
            }

            const totalAmount = session.cart.reduce((sum, item) => sum + item.total, 0);

            // Создаем заказ в базе данных
            const order = await this.db.createOrder({
                userId: chatId,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                items: session.cart,
                totalAmount: totalAmount
            });

            // Формируем текст заказа для операторов
            let orderText = `📋 Новый заказ #${order._id}\n\n`;
            orderText += `👤 От: ${user.firstName || 'Пользователь'}`;
            if (user.lastName) orderText += ` ${user.lastName}`;
            orderText += `\n`;
            if (user.username) orderText += `📱 @${user.username}\n`;
            orderText += `🆔 ID: ${chatId}\n\n`;

            session.cart.forEach((item, index) => {
                orderText += `${index + 1}. ${item.name}\n`;
                orderText += `   📦 Количество: ${item.quantity}\n`;
                orderText += `   💰 Цена за единицу: ${item.price.toLocaleString('cs-CZ')} Kč\n`;
                orderText += `   💵 Сумма: ${item.total.toLocaleString('cs-CZ')} Kč\n\n`;
            });

            orderText += `💳 Общая сумма: ${totalAmount.toLocaleString('cs-CZ')} Kč\n`;
            orderText += `📅 Дата заказа: ${new Date().toLocaleString('ru-RU')}\n`;
            orderText += `\n🔔 Свяжитесь с клиентом для уточнения деталей!`;

            // Отправляем заказ операторам
            for (const operatorId of Object.values(config.OPERATORS)) {
                try {
                    await this.bot.sendMessage(operatorId, orderText);
                } catch (error) {
                    console.error(`Не удалось отправить заказ оператору ${operatorId}:`, error);
                }
            }

            // Очищаем корзину
            session.cart = [];
            session.state = 'start';

            const thankText = `✅ Спасибо за заказ!\n\nВаш заказ #${order._id} на сумму ${totalAmount.toLocaleString('cs-CZ')} Kč принят.\nС вами скоро свяжется наш оператор.\n\n📞 Если у вас есть срочные вопросы, вы можете связаться с оператором напрямую.`;

            await this.bot.editMessageText(thankText, {
                chat_id: chatId,
                message_id: messageId,
                ...Keyboards.getStartKeyboard()
            });

        } catch (error) {
            console.error('Ошибка при оформлении заказа:', error);
        }
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