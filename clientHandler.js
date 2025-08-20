// clientHandler.js - Основная логика клиента (обновленная для MongoDB)

class ClientHandler {
    constructor(bot, database) {
        this.bot = bot;
        this.db = database;
        this.userSessions = new Map();
    }

    getUserSession(userId) {
        if (!this.userSessions.has(userId)) {
            this.userSessions.set(userId, {
                cart: [],
                currentCategory: null,
                currentProperty: null,
                state: 'start'
            });
        }
        return this.userSessions.get(userId);
    }

    async handleStart(msg) {
        const chatId = msg.chat.id;
        const session = this.getUserSession(chatId);
        session.state = 'choosing_action';

        // Создаем или обновляем пользователя
        await this.db.createOrUpdateUser({
            userId: chatId,
            username: msg.from.username,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name
        });

        const welcomeText = `👋 Добро пожаловать в бот по продаже недвижимости!

🏠 У нас представлены лучшие объекты недвижимости
💼 Профессиональные консультации
🚀 Быстрое оформление сделок

Выберите, как хотите продолжить:`;

        await this.bot.sendMessage(chatId, welcomeText, Keyboards.getStartKeyboard());
    }

    async handleCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const data = callbackQuery.data;
        const session = this.getUserSession(chatId);

        try {
            if (data === 'work_with_bot') {
                await this.showCategories(chatId, messageId);
            
            } else if (data === 'contact_operator') {
                await this.showOperators(chatId, messageId);
            
            } else if (data.startsWith('category_')) {
                const categoryId = data.split('_')[1];
                await this.showProperties(chatId, messageId, categoryId);
            
            } else if (data.startsWith('property_')) {
                const propertyId = data.split('_')[1];
                await this.showPropertyDetail(chatId, messageId, propertyId);
            
            } else if (data.startsWith('select_quantity_')) {
                const propertyId = data.split('_')[2];
                await this.showQuantitySelection(chatId, messageId, propertyId);
            
            } else if (data.startsWith('quantity_')) {
                const [, propertyId, quantity] = data.split('_');
                if (quantity === 'custom') {
                    await this.requestCustomQuantity(chatId, messageId, propertyId);
                } else {
                    await this.addToCart(chatId, messageId, propertyId, parseInt(quantity));
                }
            
            } else if (data === 'continue_shopping') {
                await this.showCategories(chatId, messageId);
            
            } else if (data === 'view_cart') {
                await this.showCart(chatId, messageId);
            
            } else if (data === 'clear_cart') {
                session.cart = [];
                await this.bot.editMessageText(
                    "🗑️ Корзина очищена!",
                    { chat_id: chatId, message_id: messageId, ...Keyboards.getStartKeyboard() }
                );
            
            } else if (data === 'complete_order') {
                await this.completeOrder(chatId, messageId);
            
            } else if (data === 'my_stats') {
                await this.showUserStats(chatId, messageId);
            
            } else if (data === 'back_to_categories') {
                await this.showCategories(chatId, messageId);
            
            } else if (data === 'back_to_start') {
                session.state = 'choosing_action';
                await this.bot.editMessageText(
                    `👋 Добро пожаловать в бот по продаже недвижимости!\n\n🏠 У нас представлены лучшие объекты недвижимости\n💼 Профессиональные консультации\n🚀 Быстрое оформление сделок\n\nВыберите, как хотите продолжить:`,
                    { chat_id: chatId, message_id: messageId, ...Keyboards.getStartKeyboard() }
                );
            }

            await this.bot.answerCallbackQuery(callbackQuery.id);
        } catch (error) {
            console.error('Ошибка при обработке callback:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: "Произошла ошибка" });
        }
    }

    async showCategories(chatId, messageId) {
        try {
            const categories = await this.db.getCategories();
            const session = this.getUserSession(chatId);
            session.state = 'browsing_categories';

            const text = "🏠 Выберите категорию недвижимости:";
            
            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...Keyboards.getCategoriesKeyboard(categories)
            });
        } catch (error) {
            console.error('Ошибка при показе категорий:', error);
        }
    }

    async showProperties(chatId, messageId, categoryId) {
        try {
            const properties = await this.db.getPropertiesByCategory(categoryId);
            const category = await this.db.getCategoryById(categoryId);
            const session = this.getUserSession(chatId);
            session.state = 'browsing_properties';
            session.currentCategory = categoryId;

            if (properties.length === 0) {
                await this.bot.editMessageText(
                    "😔 В данной категории пока нет доступных объектов.",
                    { chat_id: chatId, message_id: messageId, ...Keyboards.getCategoriesKeyboard(await this.db.getCategories()) }
                );
                return;
            }

            const text = `🏘️ ${category.name}\n\nВыберите объект недвижимости:`;
            
            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...Keyboards.getPropertiesKeyboard(properties, categoryId)
            });
        } catch (error) {
            console.error('Ошибка при показе недвижимости:', error);
        }
    }

    async showPropertyDetail(chatId, messageId, propertyId) {
        try {
            const property = await this.db.getPropertyById(propertyId);
            const session = this.getUserSession(chatId);
            session.state = 'viewing_property';
            session.currentProperty = propertyId;

            let text = `🏠 ${property.name}\n\n`;
            text += `💰 Цена: ${property.price.toLocaleString('ru-RU')} ₽\n`;
            text += `📝 ${property.description}\n\n`;

            if (property.specifications) {
                text += `📋 Характеристики:\n`;
                if (property.specifications.area) text += `📐 Площадь: ${property.specifications.area} кв.м\n`;
                if (property.specifications.rooms) text += `🚪 Комнат: ${property.specifications.rooms}\n`;
                if (property.specifications.floor) text += `🏢 Этаж: ${property.specifications.floor}`;
                if (property.specifications.totalFloors) text += ` из ${property.specifications.totalFloors}\n`;
                if (property.specifications.address) text += `📍 Адрес: ${property.specifications.address}\n`;
            }

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...Keyboards.getPropertyDetailKeyboard(propertyId, property.categoryId._id)
            });
        } catch (error) {
            console.error('Ошибка при показе деталей недвижимости:', error);
        }
    }

    async showQuantitySelection(chatId, messageId, propertyId) {
        try {
            const property = await this.db.getPropertyById(propertyId);
            const session = this.getUserSession(chatId);
            session.state = 'choosing_quantity';

            const text = `🏠 ${property.name}\n\n💰 Цена: ${property.price.toLocaleString('ru-RU')} ₽\n\nВыберите количество:`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...Keyboards.getQuantityKeyboard(propertyId)
            });
        } catch (error) {
            console.error('Ошибка при показе выбора количества:', error);
        }
    }

    async addToCart(chatId, messageId, propertyId, quantity) {
        try {
            const property = await this.db.getPropertyById(propertyId);
            const session = this.getUserSession(chatId);
            
            // Проверяем, есть ли уже такой товар в корзине
            const existingItem = session.cart.find(item => item.propertyId.toString() === propertyId);
            
            if (existingItem) {
                existingItem.quantity += quantity;
                existingItem.total = existingItem.price * existingItem.quantity;
            } else {
                session.cart.push({
                    propertyId: property._id,
                    name: property.name,
                    price: property.price,
                    quantity: quantity,
                    total: property.price * quantity
                });
            }

            const text = `✅ Добавлено в заказ:\n\n🏠 ${property.name}\n📦 Количество: ${quantity}\n💰 Сумма: ${(property.price * quantity).toLocaleString('ru-RU')} ₽\n\n🛒 В корзине: ${session.cart.length} поз.\n\nХотите заказать что-то ещё?`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...Keyboards.getContinueShoppingKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при добавлении в корзину:', error);
        }
    }

    async showCart(chatId, messageId) {
        try {
            const session = this.getUserSession(chatId);

            if (session.cart.length === 0) {
                await this.bot.editMessageText(
                    "🛒 Ваша корзина пуста!",
                    { chat_id: chatId, message_id: messageId, ...Keyboards.getStartKeyboard() }
                );
                return;
            }

            let text = "🛒 Ваша корзина:\n\n";
            let totalAmount = 0;

            session.cart.forEach((item, index) => {
                text += `${index + 1}. ${item.name}\n`;
                text += `   📦 Количество: ${item.quantity}\n`;
                text += `   💰 Цена: ${item.price.toLocaleString('ru-RU')} ₽\n`;
                text += `   💵 Сумма: ${item.total.toLocaleString('ru-RU')} ₽\n\n`;
                totalAmount += item.total;
            });

            text += `💳 Общая сумма: ${totalAmount.toLocaleString('ru-RU')} ₽`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...Keyboards.getCartKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при показе корзины:', error);
        }
    }

    async showUserStats(chatId, messageId) {
        try {
            const user = await this.db.getUserById(chatId);
            const orders = await this.db.getOrdersByUser(chatId);

            let text = `📊 Ваша статистика:\n\n`;
            text += `👤 Имя: ${user.firstName || 'Не указано'}`;
            if (user.lastName) text += ` ${user.lastName}`;
            text += `\n`;
            if (user.username) text += `📱 Username: @${user.username}\n`;
            text += `📅 Регистрация: ${user.createdAt.toLocaleDateString('ru-RU')}\n`;
            text += `🛒 Всего заказов: ${user.totalOrders}\n`;
            text += `💰 Потрачено: ${user.totalSpent.toLocaleString('ru-RU')} ₽\n`;
            
            if (orders.length > 0) {
                text += `\n📋 Последние заказы:\n`;
                orders.slice(0, 3).forEach((order, index) => {
                    text += `${index + 1}. ${order.createdAt.toLocaleDateString('ru-RU')} - ${order.totalAmount.toLocaleString('ru-RU')} ₽ (${order.status})\n`;
                });
            }

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "◀️ Назад к категориям", callback_data: "back_to_categories" }]
                    ]
                }
            });
        } catch (error) {
            console.error('Ошибка при показе статистики:', error);
        }
    }

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
                orderText += `   💰 Цена за единицу: ${item.price.toLocaleString('ru-RU')} ₽\n`;
                orderText += `   💵 Сумма: ${item.total.toLocaleString('ru-RU')} ₽\n\n`;
            });

            orderText += `💳 Общая сумма: ${totalAmount.toLocaleString('ru-RU')} ₽\n`;
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

            const thankText = `✅ Спасибо за заказ!\n\nВаш заказ #${order._id} на сумму ${totalAmount.toLocaleString('ru-RU')} ₽ принят.\nС вами скоро свяжется наш оператор.\n\n📞 Если у вас есть срочные вопросы, вы можете связаться с оператором напрямую.`;

            await this.bot.editMessageText(thankText, {
                chat_id: chatId,
                message_id: messageId,
                ...Keyboards.getStartKeyboard()
            });

        } catch (error) {
            console.error('Ошибка при оформлении заказа:', error);
        }
    }

    async requestCustomQuantity(chatId, messageId, propertyId) {
        try {
            const property = await this.db.getPropertyById(propertyId);
            const session = this.getUserSession(chatId);
            session.state = 'waiting_custom_quantity';
            session.currentProperty = propertyId;

            const text = `🏠 ${property.name}\n\n💰 Цена: ${property.price.toLocaleString('ru-RU')} ₽\n\n📝 Напишите желаемое количество числом:`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "◀️ Назад", callback_data: `select_quantity_${propertyId}` }]
                    ]
                }
            });
        } catch (error) {
            console.error('Ошибка при запросе кастомного количества:', error);
        }
    }

    async handleTextMessage(msg) {
        const chatId = msg.chat.id;
        const session = this.getUserSession(chatId);

        if (session.state === 'waiting_custom_quantity') {
            const quantity = parseInt(msg.text);
            
            if (isNaN(quantity) || quantity <= 0) {
                await this.bot.sendMessage(chatId, "❌ Пожалуйста, введите корректное число больше 0");
                return;
            }

            if (quantity > 100) {
                await this.bot.sendMessage(chatId, "❌ Максимальное количество: 100");
                return;
            }

            // Удаляем сообщение пользователя и показываем результат
            try {
                await this.bot.deleteMessage(chatId, msg.message_id);
            } catch (error) {
                // Игнорируем ошибку удаления сообщения
            }

            // Добавляем в корзину
            await this.addToCart(chatId, msg.message_id - 1, session.currentProperty, quantity);
            session.state = 'browsing_properties';
        }
    }

    async showOperators(chatId, messageId) {
        const text = `📞 Наши операторы:\n\nНажмите на имя оператора, чтобы написать ему в личные сообщения:`;

        await this.bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            ...Keyboards.getOperatorsKeyboard()
        });
    }
}

// app.js - Главный файл с модулями
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

class RealEstateBot {
    constructor() {
        this.bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
        this.database = new Database();
        this.clientHandler = new ClientHandler(this.bot, this.database);
        
        this.setupHandlers();
    }

    setupHandlers() {
        // Обработчик команды /start
        this.bot.onText(/\/start/, (msg) => {
            this.clientHandler.handleStart(msg);
        });

        // Обработчик callback запросов
        this.bot.on('callback_query', (callbackQuery) => {
            this.clientHandler.handleCallback(callbackQuery);
        });

        // Обработчик текстовых сообщений
        this.bot.on('message', (msg) => {
            // Пропускаем команды
            if (msg.text && msg.text.startsWith('/')) return;
            
            this.clientHandler.handleTextMessage(msg);
        });

        // Обработчик ошибок
        this.bot.on('error', (error) => {
            console.error('Ошибка бота:', error);
        });

        // Обработчик ошибок polling
        this.bot.on('polling_error', (error) => {
            console.error('Ошибка polling:', error);
        });

        console.log('🤖 Бот запущен и готов к работе!');
    }

    // Graceful shutdown
    async shutdown() {
        console.log('🛑 Остановка бота...');
        this.bot.stopPolling();
        await mongoose.disconnect();
        console.log('✅ Бот остановлен');
        process.exit(0);
    }
}

// Обработка сигналов для graceful shutdown
process.on('SIGINT', async () => {
    if (global.botInstance) {
        await global.botInstance.shutdown();
    }
});

process.on('SIGTERM', async () => {
    if (global.botInstance) {
        await global.botInstance.shutdown();
    }
});

// Запуск бота
if (require.main === module) {
    global.botInstance = new RealEstateBot();
}

module.exports = { 
    RealEstateBot, 
    config, 
    Database, 
    ClientHandler, 
    Keyboards,
    // Экспорт моделей
    Category,
    Property, 
    Order,
    User
};