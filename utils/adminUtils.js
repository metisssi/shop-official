// adminUtils.js - Утилиты для администратора с поддержкой валют

const Category = require('../models/Category');
const Property = require('../models/Property');
const Order = require('../models/Order');
const User = require('../models/User');

class AdminUtils {
    constructor(bot) {
        this.bot = bot;
        this.userSessions = new Map(); // Хранение сессий пользователей

        // Курсы валют (в реальном проекте лучше получать из API)
        this.exchangeRates = {
            RUB_CZK: 0.4,   // 1 RUB = 0.4 CZK
            CZK_RUB: 2.5    // 1 CZK = 2.5 RUB
        };
    }

    // === УПРАВЛЕНИЕ СЕССИЯМИ ===

    // Создать сессию пользователя
    // Отладочный метод для создания сессии
    createSession(userId, type, data = {}) {
        console.log('🔧 Создание сессии:', { userId, type, data });

        this.userSessions.set(userId, {
            type,
            data,
            createdAt: Date.now()
        });

        console.log('✅ Сессия создана. Всего активных сессий:', this.userSessions.size);
        console.log('📋 Все активные сессии:', Array.from(this.userSessions.entries()).map(([id, session]) => ({ id, type: session.type })));
    }

    // Отладочный метод для получения сессии
    getSession(userId) {
        const session = this.userSessions.get(userId);
        console.log('🔍 Запрос сессии для пользователя:', userId);
        console.log('📄 Найденная сессия:', session || 'отсутствует');
        return session;
    }

    // Отладочный метод для удаления сессии
    clearSession(userId) {
        console.log('🗑️ Удаление сессии для пользователя:', userId);
        const deleted = this.userSessions.delete(userId);
        console.log('✅ Сессия удалена:', deleted);
        console.log('📋 Оставшиеся сессии:', this.userSessions.size);
    }

    // ИСПРАВЛЕНО: Добавляем отсутствующий метод clearOldSessions
    clearOldSessions() {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 минут

        for (const [userId, session] of this.userSessions.entries()) {
            if (now - session.createdAt > maxAge) {
                console.log(`🧹 Удаление старой сессии пользователя: ${userId}`);
                this.userSessions.delete(userId);
            }
        }
    }

    // === ВАЛИДАЦИЯ ДАННЫХ ===

    // Валидация названия
    validateName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Название не может быть пустым' };
        }

        const trimmed = name.trim();
        if (trimmed.length < 2) {
            return { valid: false, error: 'Название должно содержать минимум 2 символа' };
        }

        if (trimmed.length > 100) {
            return { valid: false, error: 'Название не должно превышать 100 символов' };
        }

        return { valid: true, value: trimmed };
    }

    // Валидация описания
    validateDescription(description) {
        if (!description) return { valid: true, value: '' };

        const trimmed = description.trim();
        if (trimmed.length > 500) {
            return { valid: false, error: 'Описание не должно превышать 500 символов' };
        }

        return { valid: true, value: trimmed };
    }

    // Валидация цены с поддержкой валют
    validatePrice(priceInput) {
        const parsed = this.parsePriceWithCurrency(priceInput);

        if (!parsed.valid) {
            return parsed;
        }

        const { value, currency } = parsed;

        // Проверка минимальных значений
        if (currency === 'CZK' && value < 50000) {
            return { valid: false, error: 'Минимальная цена: 50,000 Kč' };
        }

        if (currency === 'RUB' && value < 100000) {
            return { valid: false, error: 'Минимальная цена: 100,000 ₽' };
        }

        // Проверка максимальных значений
        if (value > 500000000) {
            return { valid: false, error: 'Максимальная цена: 500,000,000' };
        }

        return { valid: true, value: Math.round(value), currency };
    }

    // Парсинг цены с валютой
    parsePriceWithCurrency(text) {
        if (!text || typeof text !== 'string') {
            return { valid: false, error: 'Цена не может быть пустой' };
        }

        // Убираем лишние пробелы и приводим к нижнему регистру
        const input = text.trim().toLowerCase();

        // Регулярные выражения для парсинга
        const patterns = [
            /^(\d+(?:\.\d+)?)\s*(czk|чеш|крон|кчк|kč)$/i,  // CZK
            /^(\d+(?:\.\d+)?)\s*(rub|руб|рубл|₽)$/i,       // RUB
            /^(\d+(?:\.\d+)?)$/                            // Только число (по умолчанию RUB)
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

                // Валидация числа
                if (isNaN(value) || value <= 0) {
                    return { valid: false, error: 'Цена должна быть положительным числом' };
                }

                return { valid: true, value: Math.round(value), currency };
            }
        }

        return {
            valid: false,
            error: 'Неверный формат цены.\n\nПримеры:\n• 5000000 (рубли)\n• 5000000 RUB\n• 2000000 CZK\n• 2000000 крон\n• 2000000 Kč'
        };
    }

    // Валидация порядка сортировки
    validateOrder(order) {
        if (!order) return { valid: true, value: 0 };

        const numOrder = Number(order);
        if (isNaN(numOrder)) {
            return { valid: false, error: 'Порядок должен быть числом' };
        }

        if (numOrder < 0 || numOrder > 9999) {
            return { valid: false, error: 'Порядок должен быть от 0 до 9999' };
        }

        return { valid: true, value: numOrder };
    }

    // === ФОРМАТИРОВАНИЕ ВАЛЮТ ===

    // Форматирование цены
    formatPrice(price, currency = 'RUB') {
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

    // Форматирование цены в обеих валютах
    formatPriceInBothCurrencies(priceRUB, priceCZK) {
        const rubFormatted = this.formatPrice(priceRUB, 'RUB');
        const czkFormatted = this.formatPrice(priceCZK, 'CZK');
        return `${rubFormatted} / ${czkFormatted}`;
    }

    // Конвертация валют
    convertCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;

        const rateKey = `${fromCurrency}_${toCurrency}`;
        const rate = this.exchangeRates[rateKey];

        if (!rate) {
            console.warn(`Exchange rate not found for ${rateKey}`);
            return amount;
        }

        return Math.round(amount * rate);
    }

    // Обновление курсов валют (можно вызывать периодически)
    updateExchangeRates(newRates) {
        if (newRates && typeof newRates === 'object') {
            this.exchangeRates = { ...this.exchangeRates, ...newRates };
            console.log('Exchange rates updated:', this.exchangeRates);
        }
    }

    // Форматирование даты
    formatDate(date) {
        return new Intl.DateTimeFormat('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date));
    }

    // === СТАТИСТИКА ===

    // Получить общую статистику
    async getGeneralStats() {
        try {
            const [
                categoriesCount,
                activeCategoriesCount,
                propertiesCount,
                availablePropertiesCount,
                ordersCount,
                completedOrdersCount,
                usersCount,
                totalRevenue
            ] = await Promise.all([
                Category.countDocuments(),
                Category.countDocuments({ isActive: true }),
                Property.countDocuments(),
                Property.countDocuments({ isAvailable: true }),
                Order.countDocuments(),
                Order.countDocuments({ status: 'completed' }),
                User.countDocuments(),
                Order.aggregate([
                    { $match: { status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                ]).then(result => result[0]?.total || 0)
            ]);

            return {
                categories: { total: categoriesCount, active: activeCategoriesCount },
                properties: { total: propertiesCount, available: availablePropertiesCount },
                orders: { total: ordersCount, completed: completedOrdersCount },
                users: { total: usersCount },
                revenue: { total: totalRevenue }
            };
        } catch (error) {
            console.error('Get general stats error:', error);
            throw error;
        }
    }

    // Получить топ-5 объектов недвижимости по заказам
    async getTopProperties() {
        try {
            const topProperties = await Order.aggregate([
                { $match: { status: 'completed' } },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.propertyId',
                        totalOrders: { $sum: 1 },
                        totalRevenue: { $sum: '$items.total' },
                        propertyName: { $first: '$items.name' }
                    }
                },
                { $sort: { totalOrders: -1 } },
                { $limit: 5 }
            ]);

            return topProperties;
        } catch (error) {
            console.error('Get top properties error:', error);
            throw error;
        }
    }

    // === ОЧИСТКА ДАННЫХ ===

    // Очистка старых сессий (запускать периодически)
    startSessionCleaner() {
        setInterval(() => {
            this.clearOldSessions();
        }, 60000); // Каждую минуту
    }

    // Очистка неактивных категорий без недвижимости
    async cleanupInactiveCategories() {
        try {
            const inactiveCategories = await Category.find({ isActive: false });
            const cleanedIds = [];

            for (const category of inactiveCategories) {
                const propertiesCount = await Property.countDocuments({ categoryId: category._id });
                if (propertiesCount === 0) {
                    await Category.findByIdAndDelete(category._id);
                    cleanedIds.push(category._id);
                }
            }

            return cleanedIds;
        } catch (error) {
            console.error('Cleanup inactive categories error:', error);
            throw error;
        }
    }

    // === УВЕДОМЛЕНИЯ АДМИНИСТРАТОРОВ ===

    // Отправить уведомление всем администраторам
    async notifyAdmins(message, keyboard = null) {
        const adminConfig = require('../config/adminConfig');
        const adminIds = adminConfig.getAdminIds();

        const promises = adminIds.map(adminId => {
            const options = { parse_mode: 'Markdown' };
            if (keyboard) {
                options.reply_markup = keyboard;
            }

            return this.bot.sendMessage(adminId, message, options)
                .catch(error => {
                    console.error(`Failed to notify admin ${adminId}:`, error);
                });
        });

        await Promise.allSettled(promises);
    }

    // Уведомление о новом заказе
    async notifyNewOrder(order) {
        const user = await User.findOne({ userId: order.userId });
        const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username : 'Неизвестный';

        const message = `🔔 *Новый заказ!*\n\n` +
            `👤 *Клиент:* ${userName}\n` +
            `💰 *Сумма:* ${this.formatPrice(order.totalAmount)}\n` +
            `📝 *Товаров:* ${order.items.length}\n` +
            `🕐 *Время:* ${this.formatDate(order.createdAt)}`;

        const keyboard = {
            inline_keyboard: [[
                { text: '👀 Посмотреть заказ', callback_data: `admin_view_order_${order._id}` }
            ]]
        };

        await this.notifyAdmins(message, keyboard);
    }

    // === УТИЛИТЫ ДЛЯ РАБОТЫ С СООБЩЕНИЯМИ ===

    // Создать клавиатуру пагинации
    createPaginationKeyboard(currentPage, totalPages, callbackPrefix) {
        const keyboard = [];

        if (totalPages > 1) {
            const paginationRow = [];

            if (currentPage > 1) {
                paginationRow.push({
                    text: '⬅️ Назад',
                    callback_data: `${callbackPrefix}_${currentPage - 1}`
                });
            }

            paginationRow.push({
                text: `${currentPage}/${totalPages}`,
                callback_data: 'current_page'
            });

            if (currentPage < totalPages) {
                paginationRow.push({
                    text: 'Вперёд ➡️',
                    callback_data: `${callbackPrefix}_${currentPage + 1}`
                });
            }

            keyboard.push(paginationRow);
        }

        return keyboard;
    }

    // Разделить массив на страницы
    paginate(array, page, itemsPerPage = 5) {
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const items = array.slice(startIndex, endIndex);
        const totalPages = Math.ceil(array.length / itemsPerPage);

        return {
            items,
            currentPage: page,
            totalPages,
            totalItems: array.length,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    }
}

module.exports = AdminUtils;