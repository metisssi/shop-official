// clientHandler.js - Исправлена обработка сообщений с фотографиями
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
                state: 'start',
                lastMessageType: 'text',
                lastMessageId: null
            });
        }
        return this.userSessions.get(userId);
    }

    async handleStart(msg) {
        const chatId = msg.chat.id;
        const session = this.getUserSession(chatId);
        session.state = 'choosing_action';  // ИЗМЕНЕНО: возвращаем выбор действия
        session.lastMessageType = 'text';

        // Создаем или обновляем пользователя
        await this.db.createOrUpdateUser({
            userId: chatId,
            username: msg.from.username,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name
        });

        // ИСПРАВЛЕНО: Показываем приветственное меню вместо категорий
        const welcomeText = `👋 Добро пожаловать в бот по продаже недвижимости!\n\n🏠 У нас представлены лучшие объекты недвижимости\n💼 Профессиональные консультации\n🚀 Быстрое оформление сделок\n\nВыберите, как хотите продолжить:`;

        await this.bot.sendMessage(chatId, welcomeText, Keyboards.getStartKeyboard());
    }

    async handleCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const data = callbackQuery.data;
        const session = this.getUserSession(chatId);

        console.log('📞 Обработка callback:', { userId: chatId, data, sessionState: session.state, lastMessageType: session.lastMessageType });

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

        // Убираем ELSE! Делаем отдельными условиями:
        if (data === 'work_with_bot') {
            await this.showCategories(chatId, messageId);

        } else if (data === 'contact_operator') {
            await this.showOperators(chatId, messageId);

        } else if (data === 'view_cart') {
            await this.showCart(chatId, messageId);

        } else if (data === 'request_address') {
            await this.requestDeliveryAddress(chatId, messageId);

        } else if (data === 'address_entered') {
            await this.showPaymentOptions(chatId, messageId);

        } else if (data === 'clear_cart') {
            session.cart = [];
            await this.editOrSendMessage(chatId, messageId, "🗑️ Корзина очищена!", Keyboards.getStartKeyboard());
        }
        try {
            if (data === 'contact_operator') {
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
                console.log('🛒 Запрос выбора количества для товара:', propertyId);
                if (propertyId && propertyId.length === 24) {
                    await this.showQuantitySelection(chatId, messageId, propertyId);
                }

            } else if (data.startsWith('quantity_')) {
                const parts = data.split('_');
                const propertyId = parts[1];
                const quantity = parts[2];
                console.log('📦 Выбор количества:', { propertyId, quantity });

                if (propertyId && propertyId.length === 24) {
                    if (quantity === 'custom') {
                        await this.requestCustomQuantity(chatId, messageId, propertyId);
                    } else {
                        const qty = parseInt(quantity);
                        if (!isNaN(qty) && qty > 0) {
                            await this.addToCart(chatId, messageId, propertyId, qty);
                        }
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
                await this.editOrSendMessage(chatId, messageId, "🗑️ Корзина очищена!", Keyboards.getStartKeyboard());

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
                const welcomeText = `👋 Добро пожаловать в бот по продаже недвижимости!\n\n🏠 У нас представлены лучшие объекты недвижимости\n💼 Профессиональные консультации\n🚀 Быстрое оформление сделок\n\nВыберите, как хотите продолжить:`;
                await this.editOrSendMessage(chatId, messageId, welcomeText, Keyboards.getStartKeyboard());

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

    // Универсальный метод для редактирования или отправки сообщения
    async editOrSendMessage(chatId, messageId, text, keyboard, parseMode = null) {
        const session = this.getUserSession(chatId);

        try {
            if (session.lastMessageType === 'text') {
                // Пытаемся отредактировать текстовое сообщение
                const options = {
                    chat_id: chatId,
                    message_id: messageId,
                    ...keyboard
                };
                if (parseMode) options.parse_mode = parseMode;

                await this.bot.editMessageText(text, options);
            } else {
                // Отправляем новое сообщение, если предыдущее было с фото
                const options = { ...keyboard };
                if (parseMode) options.parse_mode = parseMode;

                const newMessage = await this.bot.sendMessage(chatId, text, options);
                session.lastMessageId = newMessage.message_id;
                session.lastMessageType = 'text';
            }
        } catch (error) {
            console.log('Не удалось отредактировать сообщение, отправляем новое:', error.message);
            // Если редактирование не удалось, отправляем новое сообщение
            const options = { ...keyboard };
            if (parseMode) options.parse_mode = parseMode;

            const newMessage = await this.bot.sendMessage(chatId, text, options);
            session.lastMessageId = newMessage.message_id;
            session.lastMessageType = 'text';
        }
    }

    async showCategories(chatId, messageId) {
        try {
            const categories = await this.db.getCategories();
            const session = this.getUserSession(chatId);
            session.state = 'browsing_categories';

            const text = "🏠 Выберите категорию недвижимости:";
            const hasItemsInCart = session.cart.length > 0;
            const keyboard = Keyboards.getCategoriesKeyboard(categories, hasItemsInCart);

            await this.editOrSendMessage(chatId, messageId, text, keyboard);
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
                const hasItemsInCart = session.cart.length > 0;
                const keyboard = Keyboards.getCategoriesKeyboard(await this.db.getCategories(), hasItemsInCart);
                await this.editOrSendMessage(chatId, messageId, "😔 В данной категории пока нет доступных объектов.", keyboard);
                return;
            }

            const text = `🏘️ ${category.name}\n\nВыберите объект недвижимости:`;
            const hasItemsInCart = session.cart.length > 0;
            const keyboard = Keyboards.getPropertiesKeyboard(properties, categoryId, hasItemsInCart);

            await this.editOrSendMessage(chatId, messageId, text, keyboard);
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

            console.log('🏠 Показ деталей товара:', { propertyId, propertyName: property.name });

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

            const hasItemsInCart = session.cart.length > 0;
            const keyboard = Keyboards.getPropertyDetailKeyboard(propertyId, property.categoryId._id, hasItemsInCart);

            // Если есть главная фотография, отправляем её с описанием
            if (property.photos && property.photos.length > 0) {
                const mainPhoto = property.photos.find(photo => photo.isMain) || property.photos[0];

                try {
                    const photoMessage = await this.bot.sendPhoto(chatId, mainPhoto.fileId, {
                        caption: text,
                        parse_mode: 'Markdown',
                        ...keyboard
                    });

                    session.lastMessageType = 'photo';
                    session.lastMessageId = photoMessage.message_id;

                    // Пытаемся удалить предыдущее сообщение
                    try {
                        await this.bot.deleteMessage(chatId, messageId);
                    } catch (deleteError) {
                        console.log('Не удалось удалить предыдущее сообщение:', deleteError.message);
                    }
                } catch (photoError) {
                    console.error('Ошибка при отправке фото, отправляем текст:', photoError);
                    await this.editOrSendMessage(chatId, messageId, text, keyboard, 'Markdown');
                }
            } else {
                await this.editOrSendMessage(chatId, messageId, text, keyboard, 'Markdown');
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

            console.log('📦 Показ выбора количества:', { propertyId, propertyName: property.name, lastMessageType: session.lastMessageType });

            // Показываем цену в кронах
            let priceText = 'Цена не указана';
            if (property.priceInCZK) {
                priceText = `${property.priceInCZK.toLocaleString('cs-CZ')} Kč`;
            } else if (property.price) {
                const priceInCZK = Math.round(property.price * 0.4);
                priceText = `${priceInCZK.toLocaleString('cs-CZ')} Kč`;
            }

            const text = `🏠 ${property.name}\n\n💰 Цена: ${priceText}\n\nВыберите количество:`;
            const keyboard = Keyboards.getQuantityKeyboard(propertyId);

            // ИСПРАВЛЕНО: всегда отправляем новое сообщение для выбора количества
            await this.editOrSendMessage(chatId, messageId, text, keyboard);

        } catch (error) {
            console.error('Ошибка при показе выбора количества:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке товара');
        }
    }

    async addToCart(chatId, messageId, propertyId, quantity) {
        try {
            const property = await this.db.getPropertyById(propertyId);
            const session = this.getUserSession(chatId);

            console.log('🛒 Добавление в корзину:', { propertyId, quantity, propertyName: property.name });

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

            // Проверяем, есть ли уже такой товар в корзине
            const existingItem = session.cart.find(item => item.propertyId.toString() === propertyId);

            if (existingItem) {
                existingItem.quantity += quantity;
                existingItem.total = existingItem.price * existingItem.quantity;
                console.log('📝 Обновлен существующий товар в корзине');
            } else {
                session.cart.push({
                    propertyId: property._id,
                    name: property.name,
                    price: priceInCZK,
                    currency: 'CZK',
                    quantity: quantity,
                    total: totalPrice
                });
                console.log('➕ Добавлен новый товар в корзину');
            }

            // ИСПРАВЛЕНО: Показываем всю корзину вместо информации только о добавленном товаре
            let text = `✅ *Товар добавлен в корзину!*\n\n`;

            // Показываем всю корзину
            text += `🛒 *Ваша корзина:*\n\n`;
            let totalCartAmount = 0;

            session.cart.forEach((item, index) => {
                text += `${index + 1}. *${item.name}*\n`;
                text += `   📦 Количество: ${item.quantity}\n`;
                text += `   💰 Цена: ${item.price.toLocaleString('cs-CZ')} Kč\n`;
                text += `   💵 Сумма: ${item.total.toLocaleString('cs-CZ')} Kč\n\n`;
                totalCartAmount += item.total;
            });

            text += `💳 *Общая сумма: ${totalCartAmount.toLocaleString('cs-CZ')} Kč*\n\n`;
            text += `*Что дальше?*`;

            await this.editOrSendMessage(chatId, messageId, text, Keyboards.getAfterAddToCartKeyboard(), 'Markdown');
        } catch (error) {
            console.error('Ошибка при добавлении в корзину:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при добавлении товара в корзину');
        }
    }

    async showCart(chatId, messageId) {
        try {
            const session = this.getUserSession(chatId);

            if (session.cart.length === 0) {
                await this.editOrSendMessage(chatId, messageId, "🛒 Ваша корзина пуста!\n\nДобавьте товары для оформления заказа.", Keyboards.getStartKeyboard());
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
            text += `📍 *Для оформления заказа необходимо указать адрес доставки*`;

            // Кнопка для ввода адреса
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📍 Указать адрес доставки", callback_data: "request_address" }],
                        [
                            { text: "➕ Добавить еще", callback_data: "choose_more_items" },
                            { text: "🗑️ Очистить корзину", callback_data: "clear_cart" }
                        ]
                    ]
                }
            };

            await this.editOrSendMessage(chatId, messageId, text, keyboard, 'Markdown');
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
                `*После перевода нажмите кнопку "Подтвердить оплату"*`;

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ Подтвердить оплату", callback_data: "confirm_card_payment" }],
                        [{ text: "🔄 Назад к способам оплаты", callback_data: "address_entered" }]
                    ]
                }
            };

            await this.editOrSendMessage(chatId, messageId, text, keyboard, 'Markdown');
        } catch (error) {
            console.error('Ошибка при показе реквизитов:', error);
        }
    }

    async showCashPaymentInfo(chatId, messageId) {
        try {
            const session = this.getUserSession(chatId);
            const totalAmount = session.cart.reduce((sum, item) => sum + item.total, 0);

            const text = `💵 *Оплата при встрече*\n\n` +
                `💰 *К оплате:* ${totalAmount.toLocaleString('cs-CZ')} Kč\n\n` +
                `📞 *С вами свяжется курьер и уточнит:*\n` +
                `• Удобное время встречи\n` +
                `• Детали доставки\n` +
                `• Способ оплаты\n\n` +
                `*Подтвердите заказ:*`;

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ Подтвердить заказ", callback_data: "confirm_cash_payment" }],
                        [{ text: "🔄 Назад к способам оплаты", callback_data: "address_entered" }]
                    ]
                }
            };

            await this.editOrSendMessage(chatId, messageId, text, keyboard, 'Markdown');
        } catch (error) {
            console.error('Ошибка при показе информации о наличной оплате:', error);
        }
    }

    async processCardPayment(chatId, messageId) {
        try {
            // Создаем заказ со статусом "ожидает подтверждения оплаты"
            await this.createOrderInDatabase(chatId, 'card', 'pending_payment');

            const text = `✅ *Ваш заказ успешно оформлен. Ожидайте подтверждения и доставки!*\n\n` +
                `📞 *С вами скоро свяжется наш менеджер* для уточнения деталей доставки.\n\n` +
                `🕐 Обычно это происходит в течение 30 минут.\n\n` +
                `Спасибо за ваш заказ!`;

            await this.editOrSendMessage(chatId, messageId, text, Keyboards.getOrderCompleteKeyboard(), 'Markdown');
        } catch (error) {
            console.error('Ошибка при обработке оплаты картой:', error);
        }
    }

    async processCashPayment(chatId, messageId) {
        try {
            await this.createOrderInDatabase(chatId, 'cash', 'confirmed');

            const text = `✅ *Ваш заказ принят. С вами скоро свяжется курьер для уточнения деталей.*\n\n` +
                `📞 *Курьер уточнит:*\n` +
                `• Удобное время встречи\n` +
                `• Детали доставки\n` +
                `• Способ оплаты\n\n` +
                `🕐 Обычно это происходит в течение 30 минут.\n\n` +
                `Спасибо за ваш заказ!`;

            await this.editOrSendMessage(chatId, messageId, text, Keyboards.getOrderCompleteKeyboard(), 'Markdown');
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

            await this.editOrSendMessage(chatId, messageId, text, Keyboards.getOrderCompleteKeyboard(), 'Markdown');
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

            if (!session.deliveryAddress) {
                throw new Error('Адрес доставки не указан');
            }

            const totalAmount = session.cart.reduce((sum, item) => sum + item.total, 0);

            // Создаем заказ в базе данных
            const order = await this.db.createOrder({
                userId: chatId,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                deliveryAddress: session.deliveryAddress,
                items: session.cart,
                totalAmount: totalAmount,
                paymentMethod: paymentMethod,
                status: status
            });

            // Формируем текст заказа для @metisuk
            let orderText = `🔔 *НОВЫЙ ЗАКАЗ #${order._id.toString().slice(-6)}*\n\n`;

            // Информация о клиенте
            orderText += `👤 *Клиент:* ${user.firstName || 'Пользователь'}`;
            if (user.lastName) orderText += ` ${user.lastName}`;
            orderText += `\n`;
            if (user.username) orderText += `📱 @${user.username}\n`;
            orderText += `🆔 ID: ${chatId}\n\n`;

            // Адрес доставки
            orderText += `📍 *Адрес доставки:*\n${session.deliveryAddress}\n\n`;

            // Товары
            orderText += `🛒 *Товары:*\n`;
            session.cart.forEach((item, index) => {
                orderText += `${index + 1}. *${item.name}*\n`;
                orderText += `   📦 Количество: ${item.quantity}\n`;
                orderText += `   💰 Цена: ${item.price.toLocaleString('cs-CZ')} Kč\n`;
                orderText += `   💵 Сумма: ${item.total.toLocaleString('cs-CZ')} Kč\n\n`;
            });

            // Итого
            orderText += `💳 *Общая сумма: ${totalAmount.toLocaleString('cs-CZ')} Kč*\n`;
            orderText += `💰 *Способ оплаты:* ${paymentMethod === 'card' ? '💳 Карта' : '💵 Наличные'}\n`;
            orderText += `📅 *Дата заказа:* ${new Date().toLocaleString('ru-RU')}\n\n`;

            orderText += `🔔 *Обработайте заказ и свяжитесь с клиентом!*`;

            // Отправляем заказ на @metisuk
            try {
                await this.bot.sendMessage('@metisuk', orderText, { parse_mode: 'Markdown' });
                console.log('✅ Заказ отправлен на @metisuk');

                // Отправляем дополнительное сообщение оператору
                await this.bot.sendMessage('@metisuk',
                    `📞 *Свяжитесь с клиентом для уточнения деталей заказа*\n\n👤 Клиент: ${user.firstName || 'Пользователь'}\n🆔 ID: ${chatId}`,
                    { parse_mode: 'Markdown' }
                );

            } catch (error) {
                console.error('❌ Не удалось отправить заказ на @metisuk:', error);
                // В качестве запасного варианта отправляем операторам из конфига
                for (const operatorId of Object.values(config.OPERATORS)) {
                    try {
                        await this.bot.sendMessage(operatorId, orderText, { parse_mode: 'Markdown' });
                        // И дополнительное сообщение для связи
                        await this.bot.sendMessage(operatorId,
                            `📞 *Свяжитесь с клиентом для уточнения деталей заказа*\n\n👤 Клиент: ${user.firstName || 'Пользователь'}\n🆔 ID: ${chatId}`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (error) {
                        console.error(`Не удалось отправить заказ оператору ${operatorId}:`, error);
                    }
                }
            }

            // Очищаем корзину и адрес
            session.cart = [];
            session.deliveryAddress = null;
            session.state = 'start';

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
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "◀️ Назад", callback_data: `select_quantity_${propertyId}` }]
                    ]
                }
            };

            await this.editOrSendMessage(chatId, messageId, text, keyboard);
        } catch (error) {
            console.error('Ошибка при запросе кастомного количества:', error);
        }
    }

    async handleTextMessage(msg) {
        const chatId = msg.chat.id;
        const session = this.getUserSession(chatId);

        console.log('💬 Обработка текстового сообщения:', { userId: chatId, state: session.state, text: msg.text });

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

            // Удаляем сообщение пользователя
            try {
                await this.bot.deleteMessage(chatId, msg.message_id);
            } catch (error) {
                // Игнорируем ошибку удаления сообщения
            }

            // Добавляем в корзину - отправляем новое сообщение
            const loadingMessage = await this.bot.sendMessage(chatId, '🔄 Добавляем в корзину...');

            await this.addToCart(chatId, loadingMessage.message_id, session.currentProperty, quantity);
            session.state = 'browsing_properties';
        }
        else if (session.state === 'waiting_address') {
            // Обработка ввода адреса
            if (!msg.text || msg.text.trim().length < 10) {
                await this.bot.sendMessage(chatId, "❌ Пожалуйста, введите полный адрес (минимум 10 символов)");
                return;
            }

            // Сохраняем адрес в сессии
            session.deliveryAddress = msg.text.trim();
            session.state = 'address_entered';

            // Удаляем сообщение пользователя
            try {
                await this.bot.deleteMessage(chatId, msg.message_id);
            } catch (error) {
                // Игнорируем ошибку удаления сообщения
            }

            // Показываем варианты оплаты
            const confirmMessage = await this.bot.sendMessage(chatId, '✅ Адрес сохранен. Выбираем способ оплаты...');
            await this.showPaymentOptions(chatId, confirmMessage.message_id);
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

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "◀️ Назад к категориям", callback_data: "back_to_categories" }]
                    ]
                }
            };

            await this.editOrSendMessage(chatId, messageId, text, keyboard);
        } catch (error) {
            console.error('Ошибка при показе статистики:', error);
        }
    }

    // Показ операторов
    async showOperators(chatId, messageId) {
        const text = `📞 Наши операторы:\n\nНажмите на имя оператора, чтобы написать ему в личные сообщения:`;

        try {
            const operatorsKeyboard = await Keyboards.getOperatorsKeyboard();
            await this.editOrSendMessage(chatId, messageId, text, operatorsKeyboard);
        } catch (error) {
            console.error('Ошибка при показе операторов:', error);
            // Fallback на стартовое меню в случае ошибки
            await this.editOrSendMessage(chatId, messageId, "❌ Ошибка при загрузке списка операторов. Попробуйте позже.", Keyboards.getStartKeyboard());
        }
    }

    // Запрос адреса доставки
    async requestDeliveryAddress(chatId, messageId) {
        try {
            const session = this.getUserSession(chatId);
            session.state = 'waiting_address';

            const text = `📍 *Укажите адрес доставки*\n\nВведите полный адрес для доставки заказа:`;

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 Назад к корзине", callback_data: "view_cart" }]
                    ]
                }
            };

            await this.editOrSendMessage(chatId, messageId, text, keyboard, 'Markdown');
        } catch (error) {
            console.error('Ошибка при запросе адреса:', error);
        }
    }
    А
    // Показ вариантов оплаты после ввода адреса
    async showPaymentOptions(chatId, messageId) {
        try {
            const session = this.getUserSession(chatId);
            const totalAmount = session.cart.reduce((sum, item) => sum + item.total, 0);

            const text = `✅ *Адрес доставки сохранен*\n\n` +
                `💳 *К оплате: ${totalAmount.toLocaleString('cs-CZ')} Kč*\n\n` +
                `*Выберите способ оплаты:*`;

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "💵 Оплата при встрече", callback_data: "payment_cash" }],
                        [{ text: "💳 Оплата на карту", callback_data: "payment_card" }],
                        [{ text: "🔄 Изменить адрес", callback_data: "request_address" }]
                    ]
                }
            };

            await this.editOrSendMessage(chatId, messageId, text, keyboard, 'Markdown');
        } catch (error) {
            console.error('Ошибка при показе вариантов оплаты:', error);
        }
    }
}

module.exports = ClientHandler;