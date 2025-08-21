const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const config = require('./config/config');
const Database = require('./database');
const ClientHandler = require('./handler/clientHandler');

// Импорт админских модулей
const AdminHandler = require('./handler/adminHandler');
const AdminUtils = require('./utils/adminUtils');
const adminConfig = require('./config/adminConfig');

class RealEstateBot {
    constructor() {
        this.bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
        this.database = new Database();
        this.clientHandler = new ClientHandler(this.bot, this.database);
        
        // Инициализация админ модулей
        this.adminUtils = new AdminUtils(this.bot);
        this.adminHandler = new AdminHandler(this.bot, adminConfig.getAdminIds());
        
        // Делаем adminUtils глобальным для доступа из других модулей
        global.adminUtils = this.adminUtils;
        
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
            this.adminHandler.showAdminMenu(msg.chat.id);
        });

        // 🔥 ДОБАВЛЕНО: Обработка фотографий
        this.bot.on('photo', (msg) => {
            console.log('Получена фотография от пользователя:', msg.from.id);
            
            // Проверяем, что это администратор
            if (!adminConfig.isAdmin(msg.from.id)) {
                console.log('Пользователь не является администратором');
                return;
            }
            
            // Передаем обработку фотографии в AdminHandler
            this.adminHandler.handlePhotoUpload(msg);
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
            
            // 🔥 ДОБАВЛЕНО: Пропускаем фотографии (они обрабатываются отдельно)
            if (msg.photo) return;
            
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
                    
                // 🔥 НОВОЕ: Обработка редактирования описания
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
            
            this.bot.sendMessage(chatId, `✅ Категория "*${validation.value}*" успешно создана!`, {
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

    // === ОБРАБОТЧИКИ ТОВАРОВ ===

    async handleProductNameInput(chatId, userId, text, categoryId) {
        const validation = this.adminUtils.validateName(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        // Теперь после ввода названия переходим к вводу цены
        this.adminUtils.createSession(userId, 'adding_product_price', {
            categoryId: categoryId,
            productName: validation.value
        });

        this.bot.sendMessage(chatId, `📝 Название товара: "*${validation.value}*"\n\n💰 Введите цену в кронах:`, {
            parse_mode: 'Markdown'
        });
    }

    async handleNewProductPriceInput(chatId, userId, text, sessionData) {
        // Простая проверка - только число
        const priceValue = parseInt(text.replace(/\D/g, ''));
        
        if (isNaN(priceValue) || priceValue <= 0) {
            return this.bot.sendMessage(chatId, `❌ Введите корректную цену (только числа):\nПопробуйте еще раз:`);
        }

        try {
            const Property = require('./models/Property');
            
            // Автоматически CZK, конвертируем в рубли
            const priceCZK = priceValue;
            const priceRUB = Math.round(priceValue * 2.5); // Конвертация CZK в RUB

            const product = new Property({
                categoryId: sessionData.categoryId,
                name: sessionData.productName,
                description: '',
                price: priceRUB,
                priceInCZK: priceCZK,
                currency: 'CZK', // Всегда CZK
                specifications: {},
                isAvailable: true,
                order: 0,
                photos: [] // 🔥 НОВОЕ: Инициализируем пустой массив фотографий
            });

            await product.save();
            this.adminUtils.clearSession(userId);
            
            this.bot.sendMessage(chatId, `✅ Товар "*${sessionData.productName}*" создан!\n\n💰 Цена: ${this.formatPrice(priceCZK, 'CZK')}\n\n📷 Теперь вы можете добавить фотографии через редактирование товара.`, {
                parse_mode: 'Markdown'
            });
            
            // Показываем админ меню через секунду
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
            this.bot.sendMessage(chatId, `✅ Название товара обновлено на "*${validation.value}*"`, {
                parse_mode: 'Markdown'
            });
            
            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit product name error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении названия товара.');
        }
    }

    // 🔥 НОВЫЙ МЕТОД: Обработка редактирования описания товара
    async handleEditProductDescription(chatId, userId, text, productId) {
        console.log('Обработка редактирования описания товара:', { userId, productId });
        
        const validation = this.adminUtils.validateDescription(text);
        if (!validation.valid) {
            return this.bot.sendMessage(chatId, `❌ ${validation.error}\nПопробуйте еще раз:`);
        }

        try {
            const Property = require('./models/Property');
            await Property.findByIdAndUpdate(productId, { description: validation.value });
            
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
        // Парсим цену с валютой
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

            // Обновляем цены в зависимости от указанной валюты
            let updateData = {};
            
            if (priceData.currency === 'CZK') {
                updateData.priceInCZK = priceData.value;
                updateData.price = Math.round(priceData.value * 2.5); // Примерный курс CZK к RUB
                updateData.currency = 'CZK';
            } else {
                updateData.price = priceData.value;
                updateData.priceInCZK = Math.round(priceData.value / 2.5); // Примерный курс RUB к CZK
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
        // Убираем лишние пробелы и приводим к нижнему регистру
        const input = text.trim().toLowerCase();
        
        // Регулярные выражения для парсинга
        const patterns = [
            /^(\d+(?:\.\d+)?)\s*(czk|чеш|крон|кчк|kč)$/i,  // CZK
            /^(\d+(?:\.\d+)?)\s*(rub|руб|рубл)$/i,       // RUB
            /^(\d+(?:\.\d+)?)$/                          // Только число (по умолчанию RUB)
        ];

        for (const pattern of patterns) {
            const match = input.match(pattern);
            if (match) {
                const value = parseFloat(match[1]);
                let currency = 'RUB'; // По умолчанию

                if (match[2]) {
                    const currencyStr = match[2].toLowerCase();
                    if (currencyStr.includes('czk') || currencyStr.includes('чеш') || 
                        currencyStr.includes('крон') || currencyStr.includes('кчк') || 
                        currencyStr.includes('kč')) {
                        currency = 'CZK';
                    }
                }

                // Валидация цены
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

        // После ввода имени переходим к вводу username
        this.adminUtils.createSession(userId, 'adding_operator_username', {
            operatorName: validation.value
        });

        this.bot.sendMessage(chatId, `👤 Имя оператора: "*${validation.value}*"\n\n📱 Введите username оператора (без @):`, {
            parse_mode: 'Markdown'
        });
    }

    async handleOperatorUsernameInput(chatId, userId, text, operatorName) {
        // Убираем @ если есть и проверяем username
        const username = text.trim().replace('@', '');
        
        if (!username || username.length < 3) {
            return this.bot.sendMessage(chatId, `❌ Username должен содержать минимум 3 символа\nПопробуйте еще раз:`);
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return this.bot.sendMessage(chatId, `❌ Username может содержать только буквы, цифры и подчеркивания\nПопробуйте еще раз:`);
        }

        try {
            const Operator = require('./models/Operator');
            
            // Проверяем, не существует ли уже такой username
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
            
            this.bot.sendMessage(chatId, `✅ Оператор "*${operatorName}*" (@${username}) успешно создан!`, {
                parse_mode: 'Markdown'
            });
            
            // Показываем админ меню через секунду
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
            this.bot.sendMessage(chatId, `✅ Имя оператора обновлено на "*${validation.value}*"`, {
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
        // Убираем @ если есть и проверяем username
        const username = text.trim().replace('@', '');
        
        if (!username || username.length < 3) {
            return this.bot.sendMessage(chatId, `❌ Username должен содержать минимум 3 символа\nПопробуйте еще раз:`);
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return this.bot.sendMessage(chatId, `❌ Username может содержать только буквы, цифры и подчеркивания\nПопробуйте еще раз:`);
        }

        try {
            const Operator = require('./models/Operator');
            
            // Проверяем, не существует ли уже такой username (исключая текущего оператора)
            const existingOperator = await Operator.findOne({ 
                username: username, 
                _id: { $ne: operatorId } 
            });
            
            if (existingOperator) {
                return this.bot.sendMessage(chatId, `❌ Оператор с username @${username} уже существует\nВведите другой username:`);
            }

            await Operator.findByIdAndUpdate(operatorId, { username: username });
            
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, `✅ Username оператора обновлен на "*@${username}*"`, {
                parse_mode: 'Markdown'
            });
            
            setTimeout(() => this.adminHandler.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Edit operator username error:', error);
            this.adminUtils.clearSession(userId);
            this.bot.sendMessage(chatId, '❌ Ошибка при обновлении username оператора.');
        }
    }
}

// Запуск бота
new RealEstateBot();