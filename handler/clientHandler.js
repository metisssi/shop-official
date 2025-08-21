// clientHandler.js - Исправлен метод showCategories
const config = require('../config/config');
const Keyboards = require('../keyboards');

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

        // Пропускаем админские callback'и
        if (data.startsWith('admin_') ||
            data.startsWith('category_add') ||
            data.startsWith('property_add') ||
            data.startsWith('product_add') ||
            data.startsWith('product_list') ||
            data.startsWith('add_product_to_') ||
            data.startsWith('edit_') ||
            data.startsWith('delete_') ||
            data.startsWith('confirm_') ||
            data.startsWith('toggle_') ||
            data.startsWith('select_cat_') ||
            data.startsWith('manage_') ||
            data.startsWith('view_') ||
            data.startsWith('set_main_') ||
            data.startsWith('delete_photo_')) {
            return;
        }

        try {
            if (data === 'work_with_bot') {
                await this.showCategories(chatId, messageId);

            } else if (data === 'contact_operator') {
                await this.showOperators(chatId, messageId);

            } else if (data.startsWith('category_')) {
                const categoryId = data.split('_')[1];
                // Проверяем, что это валидный ObjectId (24 символа)
                if (categoryId && categoryId.length === 24) {
                    await this.showProperties(chatId, messageId, categoryId);
                }

            } else if (data.startsWith('property_')) {
                const propertyId = data.split('_')[1];
                if (propertyId && propertyId.length === 24) {
                    await this.showPropertyDetail(chatId, messageId, propertyId);
                }

            } else if (data.startsWith('select_quantity_')) {
                const propertyId = data.split('_')[2];
                if (propertyId && propertyId.length === 24) {
                    await this.showQuantitySelection(chatId, messageId, propertyId);
                }

            } else if (data.startsWith('quantity_')) {
                const [, propertyId, quantity] = data.split('_');
                if (propertyId && propertyId.length === 24) {
                    if (quantity === 'custom') {
                        await this.requestCustomQuantity(chatId, messageId, propertyId);
                    } else {
                        await this.addToCart(chatId, messageId, propertyId, parseInt(quantity));
                    }
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

            } else if (data === 'payment_card') {
                await this.showOrderConfirmation(chatId, messageId, 'card');

            } else if (data === 'payment_cash') {
                await this.showOrderConfirmation(chatId, messageId, 'cash');

            } else if (data === 'confirm_order_card') {
                await this.completeOrder(chatId, messageId, 'card');

            } else if (data === 'confirm_order_cash') {
                await this.completeOrder(chatId, messageId, 'cash');

            } else if (data === 'complete_order') {
                // Старый метод - перенаправляем на просмотр корзины
                await this.showCart(chatId, messageId);

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
            } else if (data === 'current_page') {
                // Игнорируем нажатие на индикатор текущей страницы
                return;
            }

            await this.bot.answerCallbackQuery(callbackQuery.id);
        } catch (error) {
            console.error('Ошибка при обработке callback:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: "Произошла ошибка" });
        }
    }

    // ✅ ИСПРАВЛЕННЫЙ МЕТОД showCategories
    async showCategories(chatId, messageId) {
        try {
            const categories = await this.db.getCategories();
            const session = this.getUserSession(chatId);
            session.state = 'browsing_categories';

            const text = "🏠 Выберите категорию недвижимости:";
            
            // ✅ ПРАВИЛЬНЫЙ ВЫЗОВ: используем статический метод
            const keyboard = Keyboards.getCategoriesKeyboard(categories);
            
            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...keyboard  // Разворачиваем объект с reply_markup
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
                const keyboard = Keyboards.getCategoriesKeyboard(await this.db.getCategories());
                
                // Проверяем тип предыдущего сообщения
                const previousMsg = session.lastMessageType;
                if (previousMsg === 'photo') {
                    // Отправляем новое сообщение вместо редактирования
                    await this.bot.sendMessage(chatId, "😔 В данной категории пока нет доступных объектов.", keyboard);
                } else {
                    await this.bot.editMessageText(
                        "😔 В данной категории пока нет доступных объектов.",
                        { chat_id: chatId, message_id: messageId, ...keyboard }
                    );
                }
                return;
            }

            const text = `🏘️ ${category.name}\n\nВыберите объект недвижимости:`;
            const keyboard = Keyboards.getPropertiesKeyboard(properties, categoryId);

            // Сохраняем тип сообщения
            session.lastMessageType = 'text';

            // Проверяем, было ли предыдущее сообщение фотографией
            if (session.lastMessageType === 'photo') {
                // Отправляем новое сообщение
                await this.bot.sendMessage(chatId, text, keyboard);
            } else {
                // Редактируем существующее сообщение
                await this.bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...keyboard
                });
            }
        } catch (error) {
            console.error('Ошибка при показе недвижимости:', error);
            
            // В случае ошибки отправляем новое сообщение
            try {
                const properties = await this.db.getPropertiesByCategory(categoryId);
                const category = await this.db.getCategoryById(categoryId);
                const text = `🏘️ ${category.name}\n\nВыберите объект недвижимости:`;
                const keyboard = Keyboards.getPropertiesKeyboard(properties, categoryId);
                
                await this.bot.sendMessage(chatId, text, keyboard);
            } catch (fallbackError) {
                console.error('Fallback ошибка:', fallbackError);
            }
        }
    }

    // 🔥 ИСПРАВЛЕННЫЙ МЕТОД: Показ деталей товара без характеристик
    async showPropertyDetail(chatId, messageId, propertyId) {
        try {
            const property = await this.db.getPropertyById(propertyId);
            const session = this.getUserSession(chatId);
            session.state = 'viewing_property';
            session.currentProperty = propertyId;

            let text = `🏠 *${property.name}*\n\n`;

            // Показываем цену в основной валюте товара
            if (property.currency === 'CZK' && property.priceInCZK) {
                text += `💰 *Цена:* ${property.priceInCZK.toLocaleString('cs-CZ')} Kč\n\n`;
            } else {
                text += `💰 *Цена:* ${property.price.toLocaleString('ru-RU')} ₽\n\n`;
            }

            // Добавляем описание, если оно есть
            if (property.description && property.description.trim()) {
                text += `📝 ${property.description}`;
            }

            // 🔥 УБРАНО: Блок с характеристиками полностью удален

            const keyboard = Keyboards.getPropertyDetailKeyboard(propertyId, property.categoryId._id);

            // 🔥 НОВОЕ: Если есть главная фотография, отправляем её с описанием
            if (property.photos && property.photos.length > 0) {
                const mainPhoto = property.photos.find(photo => photo.isMain) || property.photos[0];
                
                // Помечаем что отправляем фото
                session.lastMessageType = 'photo';
                
                // Отправляем фотографию с описанием
                await this.bot.sendPhoto(chatId, mainPhoto.fileId, {
                    caption: text,
                    parse_mode: 'Markdown',
                    ...keyboard
                });
                
                // Удаляем старое текстовое сообщение
                try {
                    await this.bot.deleteMessage(chatId, messageId);
                } catch (error) {
                    // Игнорируем ошибку удаления
                }
            } else {
                // Помечаем что отправляем текст
                session.lastMessageType = 'text';
                
                // Если фотографий нет, отправляем обычное текстовое сообщение
                await this.bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
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

            // Используем цену в основной валюте товара
            let priceToUse, priceDisplay;
            if (property.currency === 'CZK' && property.priceInCZK) {
                priceToUse = property.priceInCZK;
                priceDisplay = `${(priceToUse * quantity).toLocaleString('cs-CZ')} Kč`;
            } else {
                priceToUse = property.price;
                priceDisplay = `${(priceToUse * quantity).toLocaleString('ru-RU')} ₽`;
            }

            // Проверяем, есть ли уже такой товар в корзине
            const existingItem = session.cart.find(item => item.propertyId.toString() === propertyId);

            if (existingItem) {
                existingItem.quantity += quantity;
                existingItem.total = existingItem.price * existingItem.quantity;
            } else {
                session.cart.push({
                    propertyId: property._id,
                    name: property.name,
                    price: priceToUse,
                    currency: property.currency || 'RUB',
                    quantity: quantity,
                    total: priceToUse * quantity
                });
            }

            const text = `✅ *Товар добавлен в корзину!*\n\n🏠 *${property.name}*\n📦 Количество: ${quantity}\n💰 Сумма: ${priceDisplay}\n\n🛒 *В корзине:* ${session.cart.length} поз.\n\n*Что дальше?*`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
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
                    "🛒 Ваша корзина пуста!\n\nДобавьте товары для оформления заказа.",
                    { chat_id: chatId, message_id: messageId, ...Keyboards.getStartKeyboard() }
                );
                return;
            }

            let text = "🛒 *Ваша корзина:*\n\n";
            let totalAmount = 0;

            session.cart.forEach((item, index) => {
                text += `${index + 1}. *${item.name}*\n`;
                text += `   📦 Количество: ${item.quantity}\n`;
                
                // Показываем цену в правильной валюте
                if (item.currency === 'CZK') {
                    text += `   💰 Цена: ${item.price.toLocaleString('cs-CZ')} Kč\n`;
                    text += `   💵 Сумма: ${item.total.toLocaleString('cs-CZ')} Kč\n\n`;
                } else {
                    text += `   💰 Цена: ${item.price.toLocaleString('ru-RU')} ₽\n`;
                    text += `   💵 Сумма: ${item.total.toLocaleString('ru-RU')} ₽\n\n`;
                }
                
                totalAmount += item.total;
            });

            // Определяем валюту общей суммы (берем валюту первого товара)
            const mainCurrency = session.cart[0].currency || 'RUB';
            if (mainCurrency === 'CZK') {
                text += `💳 *Общая сумма: ${totalAmount.toLocaleString('cs-CZ')} Kč*\n\n`;
            } else {
                text += `💳 *Общая сумма: ${totalAmount.toLocaleString('ru-RU')} ₽*\n\n`;
            }
            
            text += `*Выберите способ оплаты:*`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...Keyboards.getCartKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при показе корзины:', error);
        }
    }

    // 🔥 НОВЫЙ МЕТОД: Подтверждение заказа с выбранным способом оплаты
    async showOrderConfirmation(chatId, messageId, paymentMethod) {
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
            const paymentText = paymentMethod === 'card' ? '💳 Оплата картой' : '💵 Оплата наличными';
            
            // Определяем валюту
            const mainCurrency = session.cart[0].currency || 'RUB';
            const totalFormatted = mainCurrency === 'CZK' ? 
                `${totalAmount.toLocaleString('cs-CZ')} Kč` : 
                `${totalAmount.toLocaleString('ru-RU')} ₽`;

            let text = `📋 *Подтверждение заказа*\n\n`;
            text += `👤 *Заказчик:* ${user.firstName || 'Пользователь'}`;
            if (user.lastName) text += ` ${user.lastName}`;
            if (user.username) text += ` (@${user.username})`;
            text += `\n\n`;

            text += `🛒 *Ваш заказ:*\n`;
            session.cart.forEach((item, index) => {
                text += `${index + 1}. ${item.name} × ${item.quantity}\n`;
            });

            text += `\n💰 *Общая сумма:* ${totalFormatted}\n`;
            text += `💳 *Способ оплаты:* ${paymentText}\n\n`;

            if (paymentMethod === 'card') {
                text += `*Оплата картой:*\n`;
                text += `После подтверждения заказа вам будут высланы реквизиты для оплаты.\n\n`;
            } else {
                text += `*Оплата наличными:*\n`;
                text += `Оплата производится при встрече с нашим представителем.\n\n`;
            }

            text += `*Подтвердите заказ:*`;

            // Сохраняем выбранный способ оплаты
            session.paymentMethod = paymentMethod;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...Keyboards.getOrderConfirmationKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при показе подтверждения заказа:', error);
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

    // Показ операторов
    async showOperators(chatId, messageId) {
        const text = `📞 Наши операторы:\n\nНажмите на имя оператора, чтобы написать ему в личные сообщения:`;

        try {
            const operatorsKeyboard = await Keyboards.getOperatorsKeyboard();

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...operatorsKeyboard
            });
        } catch (error) {
            console.error('Ошибка при показе операторов:', error);

            // Fallback на стартовое меню в случае ошибки
            await this.bot.editMessageText(
                "❌ Ошибка при загрузке списка операторов. Попробуйте позже.",
                {
                    chat_id: chatId,
                    message_id: messageId,
                    ...Keyboards.getStartKeyboard()
                }
            );
        }
    }
}

module.exports = ClientHandler;