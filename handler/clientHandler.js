// clientHandler.js - Исправленный полный файл для работы только с CZK
const config = require('../config/config');
const Keyboards = require('../keyboards');

class ClientHandler {
    constructor(bot, database) {
        this.bot = bot;
        this.db = database;
        this.userSessions = new Map();
        
        // Реквизиты для оплаты картой (замените на реальные)
        this.paymentDetails = {
            cardNumber: "4111 1111 1111 1111",
            cardHolder: "IVAN PETROV", 
            bank: "Česká spořitelna",
            message: "Оплата заказа недвижимости"
        };
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

            } else if (data === 'choose_more_items') {
                await this.showCategories(chatId, messageId);

            } else if (data === 'proceed_to_payment') {
                await this.showCart(chatId, messageId);

            } else if (data === 'view_cart') {
                await this.showCart(chatId, messageId);

            } else if (data === 'clear_cart') {
                session.cart = [];
                await this.bot.editMessageText(
                    "🗑️ Корзина очищена!",
                    { chat_id: chatId, message_id: messageId, ...Keyboards.getStartKeyboard() }
                );

            } else if (data === 'payment_card') {
                await this.showCardPaymentDetails(chatId, messageId);

            } else if (data === 'payment_cash') {
                await this.showCashPaymentInfo(chatId, messageId);

            } else if (data === 'confirm_card_payment') {
                await this.processCardPayment(chatId, messageId);

            } else if (data === 'confirm_cash_payment') {
                await this.processCashPayment(chatId, messageId);

            } else if (data === 'payment_completed') {
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

    async showCategories(chatId, messageId) {
        try {
            const categories = await this.db.getCategories();
            const session = this.getUserSession(chatId);
            session.state = 'browsing_categories';

            const text = "🏠 Выберите категорию недвижимости:";
            const keyboard = Keyboards.getCategoriesKeyboard(categories);
            
            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...keyboard
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
                
                const previousMsg = session.lastMessageType;
                if (previousMsg === 'photo') {
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

            session.lastMessageType = 'text';

            if (session.lastMessageType === 'photo') {
                await this.bot.sendMessage(chatId, text, keyboard);
            } else {
                await this.bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...keyboard
                });
            }
        } catch (error) {
            console.error('Ошибка при показе недвижимости:', error);
            
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

    async showPropertyDetail(chatId, messageId, propertyId) {
        try {
            const property = await this.db.getPropertyById(propertyId);
            const session = this.getUserSession(chatId);
            session.state = 'viewing_property';
            session.currentProperty = propertyId;

            let text = `🏠 *${property.name}*\n\n`;

            // Показываем цену только в кронах
            if (property.priceInCZK) {
                text += `💰 *Цена:* ${property.priceInCZK.toLocaleString('cs-CZ')} Kč\n\n`;
            } else if (property.price) {
                // Если цена в рублях, конвертируем в кроны (примерный курс 1 RUB = 0.4 CZK)
                const priceInCZK = Math.round(property.price * 0.4);
                text += `💰 *Цена:* ${priceInCZK.toLocaleString('cs-CZ')} Kč\n\n`;
            }

            // Добавляем описание, если оно есть
            if (property.description && property.description.trim()) {
                text += `📝 ${property.description}`;
            }

            const keyboard = Keyboards.getPropertyDetailKeyboard(propertyId, property.categoryId._id);

            // Если есть главная фотография, отправляем её с описанием
            if (property.photos && property.photos.length > 0) {
                const mainPhoto = property.photos.find(photo => photo.isMain) || property.photos[0];
                
                session.lastMessageType = 'photo';
                
                await this.bot.sendPhoto(chatId, mainPhoto.fileId, {
                    caption: text,
                    parse_mode: 'Markdown',
                    ...keyboard
                });
                
                try {
                    await this.bot.deleteMessage(chatId, messageId);
                } catch (error) {
                    // Игнорируем ошибку удаления
                }
            } else {
                session.lastMessageType = 'text';
                
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

            // Показываем цену в кронах
            let priceText = 'Цена не указана';
            if (property.priceInCZK) {
                priceText = `${property.priceInCZK.toLocaleString('cs-CZ')} Kč`;
            } else if (property.price) {
                const priceInCZK = Math.round(property.price * 0.4);
                priceText = `${priceInCZK.toLocaleString('cs-CZ')} Kč`;
            }

            const text = `🏠 ${property.name}\n\n💰 Цена: ${priceText}\n\nВыберите количество:`;

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

            // Используем цену в кронах
            let priceInCZK;
            if (property.priceInCZK) {
                priceInCZK = property.priceInCZK;
            } else if (property.price) {
                priceInCZK = Math.round(property.price * 0.4); // Конвертация из рублей
            } else {
                priceInCZK = 0;
            }

            const totalPrice = priceInCZK * quantity;
            const priceDisplay = `${totalPrice.toLocaleString('cs-CZ')} Kč`;

            // Проверяем, есть ли уже такой товар в корзине
            const existingItem = session.cart.find(item => item.propertyId.toString() === propertyId);

            if (existingItem) {
                existingItem.quantity += quantity;
                existingItem.total = existingItem.price * existingItem.quantity;
            } else {
                session.cart.push({
                    propertyId: property._id,
                    name: property.name,
                    price: priceInCZK,
                    currency: 'CZK',
                    quantity: quantity,
                    total: totalPrice
                });
            }

            const text = `✅ *Товар добавлен в корзину!*\n\n🏠 *${property.name}*\n📦 Количество: ${quantity}\n💰 Сумма: ${priceDisplay}\n\n🛒 *В корзине:* ${session.cart.length} поз.\n\n*Что дальше?*`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...Keyboards.getAfterAddToCartKeyboard()
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
                text += `   💰 Цена: ${item.price.toLocaleString('cs-CZ')} Kč\n`;
                text += `   💵 Сумма: ${item.total.toLocaleString('cs-CZ')} Kč\n\n`;
                
                totalAmount += item.total;
            });

            text += `💳 *Общая сумма: ${totalAmount.toLocaleString('cs-CZ')} Kč*\n\n`;
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

    async showCardPaymentDetails(chatId, messageId) {
        try {
            const session = this.getUserSession(chatId);
            const totalAmount = session.cart.reduce((sum, item) => sum + item.total, 0);

            const text = `💳 *Оплата на карту*\n\n` +
                        `💰 *К оплате:* ${totalAmount.toLocaleString('cs-CZ')} Kč\n\n` +
                        `*Реквизиты для перевода:*\n` +
                        `🏦 Банк: ${this.paymentDetails.bank}\n` +
                        `💳 Номер карты: \`${this.paymentDetails.cardNumber}\`\n` +
                        `👤 Получатель: ${this.paymentDetails.cardHolder}\n` +
                        `📝 Назначение: ${this.paymentDetails.message}\n\n` +
                        `*После перевода нажмите кнопку "Перевёл"*`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...Keyboards.getCardPaymentKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при показе реквизитов:', error);
        }
    }

    async showCashPaymentInfo(chatId, messageId) {
        try {
            const session = this.getUserSession(chatId);
            const totalAmount = session.cart.reduce((sum, item) => sum + item.total, 0);

            const text = `💵 *Оплата наличными при встрече*\n\n` +
                        `💰 *К оплате:* ${totalAmount.toLocaleString('cs-CZ')} Kč\n\n` +
                        `📞 *С вами свяжется наш менеджер и уточнит:*\n` +
                        `• Удобное время встречи\n` +
                        `• Место встречи\n` +
                        `• Детали сделки\n\n` +
                        `*Подтвердите заказ:*`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...Keyboards.getCashPaymentKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при показе информации о наличной оплате:', error);
        }
    }

    async processCardPayment(chatId, messageId) {
        try {
            const text = `⏳ *Проверяем ваш платёж...*\n\n` +
                        `После подтверждения поступления средств заказ будет обработан.\n\n` +
                        `💬 *С вами скоро свяжется наш менеджер для уточнения деталей.*`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...Keyboards.getPaymentProcessingKeyboard()
            });

            // Создаем заказ со статусом "ожидает подтверждения оплаты"
            await this.createOrderInDatabase(chatId, 'card', 'pending_payment');
        } catch (error) {
            console.error('Ошибка при обработке оплаты картой:', error);
        }
    }

    async processCashPayment(chatId, messageId) {
        try {
            await this.createOrderInDatabase(chatId, 'cash', 'confirmed');

            const text = `✅ *Заказ принят!*\n\n` +
                        `📞 *С вами скоро свяжется наш менеджер* для уточнения деталей встречи и оплаты наличными.\n\n` +
                        `🕐 Обычно это происходит в течение 30 минут.\n\n` +
                        `Спасибо за ваш заказ!`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...Keyboards.getOrderCompleteKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при обработке наличной оплаты:', error);
        }
    }

    async completeOrder(chatId, messageId) {
        try {
            const session = this.getUserSession(chatId);
            
            // Очищаем корзину
            session.cart = [];
            session.state = 'start';

            const text = `✅ *Спасибо за подтверждение!*\n\n` +
                        `📞 *С вами скоро свяжется наш менеджер* для уточнения деталей.\n\n` +
                        `🕐 Обычно это происходит в течение 30 минут.\n\n` +
                        `Хотите что-то ещё?`;

            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...Keyboards.getOrderCompleteKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при завершении заказа:', error);
        }
    }

    async createOrderInDatabase(chatId, paymentMethod, status = 'new') {
        try {
            const session = this.getUserSession(chatId);
            const user = await this.db.getUserById(chatId);

            if (session.cart.length === 0) {
                throw new Error('Корзина пуста');
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
                totalAmount: totalAmount,
                paymentMethod: paymentMethod,
                status: status
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
            orderText += `💳 Способ оплаты: ${paymentMethod === 'card' ? 'Карта' : 'Наличные'}\n`;
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

            return order;

        } catch (error) {
            console.error('Ошибка при создании заказа:', error);
            throw error;
        }
    }

    async requestCustomQuantity(chatId, messageId, propertyId) {
        try {
            const property = await this.db.getPropertyById(propertyId);
            const session = this.getUserSession(chatId);
            session.state = 'waiting_custom_quantity';
            session.currentProperty = propertyId;

            // Показываем цену в кронах
            let priceText = 'Цена не указана';
            if (property.priceInCZK) {
                priceText = `${property.priceInCZK.toLocaleString('cs-CZ')} Kč`;
            } else if (property.price) {
                const priceInCZK = Math.round(property.price * 0.4);
                priceText = `${priceInCZK.toLocaleString('cs-CZ')} Kč`;
            }

            const text = `🏠 ${property.name}\n\n💰 Цена: ${priceText}\n\n📝 Напишите желаемое количество числом:`;

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
            
            // Показываем сумму в кронах
            const totalSpentCZK = Math.round(user.totalSpent * 0.4); // Конвертируем из рублей
            text += `💰 Потрачено: ${totalSpentCZK.toLocaleString('cs-CZ')} Kč\n`;

            if (orders.length > 0) {
                text += `\n📋 Последние заказы:\n`;
                orders.slice(0, 3).forEach((order, index) => {
                    const orderAmountCZK = Math.round(order.totalAmount * 0.4);
                    text += `${index + 1}. ${order.createdAt.toLocaleDateString('ru-RU')} - ${orderAmountCZK.toLocaleString('cs-CZ')} Kč (${order.status})\n`;
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