// keyboards.js - Клавиатуры с операторами из БД
const config = require('./config/config');

class Keyboards {
    static getStartKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🤖 Работать с ботом", callback_data: "work_with_bot" }],
                    [{ text: "📞 Связаться с оператором", callback_data: "contact_operator" }]
                ]
            }
        };
    }

    // В файле keyboards.js
    // Замени метод getPropertiesKeyboard (строки примерно 25-40):

    static getPropertiesKeyboard(properties, categoryId) {
        const keyboard = properties.map(property => {
            // 🔥 ИСПРАВЛЕНИЕ: Показываем цену в правильной валюте
            let price;
            if (property.currency === 'CZK' && property.priceInCZK) {
                price = `${property.priceInCZK.toLocaleString('cs-CZ')} Kč`;
            } else {
                price = `${property.price.toLocaleString('ru-RU')} ₽`;
            }

            return [{
                text: `${property.name} - ${price}`,
                callback_data: `property_${property._id}`
            }];
        });

        keyboard.push([{ text: "◀️ Назад к категориям", callback_data: "back_to_categories" }]);

        return {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
    }

    static getPropertiesKeyboard(properties, categoryId) {
        const keyboard = properties.map(property => {
            const price = property.priceInCZK ?
                `${property.priceInCZK.toLocaleString('cs-CZ')} Kč` :
                `${property.price.toLocaleString('ru-RU')} ₽`;

            return [{
                text: `${property.name} - ${price}`,
                callback_data: `property_${property._id}`
            }];
        });

        keyboard.push([{ text: "◀️ Назад к категориям", callback_data: "back_to_categories" }]);

        return {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
    }

    static getPropertyDetailKeyboard(propertyId, categoryId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🛒 Выбрать количество", callback_data: `select_quantity_${propertyId}` }],
                    [{ text: "◀️ Назад к списку", callback_data: `category_${categoryId}` }]
                ]
            }
        };
    }

    static getQuantityKeyboard(propertyId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "1", callback_data: `quantity_${propertyId}_1` },
                        { text: "2", callback_data: `quantity_${propertyId}_2` },
                        { text: "3", callback_data: `quantity_${propertyId}_3` }
                    ],
                    [
                        { text: "4", callback_data: `quantity_${propertyId}_4` },
                        { text: "5", callback_data: `quantity_${propertyId}_5` },
                        { text: "Другое", callback_data: `quantity_${propertyId}_custom` }
                    ],
                    [{ text: "◀️ Назад", callback_data: `property_${propertyId}` }]
                ]
            }
        };
    }

    static getContinueShoppingKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Да, заказать ещё", callback_data: "continue_shopping" }],
                    [{ text: "🛒 Оформить заказ", callback_data: "complete_order" }],
                    [{ text: "👀 Посмотреть корзину", callback_data: "view_cart" }]
                ]
            }
        };
    }

    static getCartKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🛒 Оформить заказ", callback_data: "complete_order" }],
                    [{ text: "➕ Добавить ещё", callback_data: "continue_shopping" }],
                    [{ text: "🗑️ Очистить корзину", callback_data: "clear_cart" }]
                ]
            }
        };
    }

    // Обновленный метод - теперь асинхронный и берет операторов из БД
    static async getOperatorsKeyboard() {
        try {
            const Operator = require('./models/Operator');
            const operators = await Operator.getActiveOperators();

            if (operators.length === 0) {
                // Если в БД нет операторов, используем из конфига как fallback
                const keyboard = config.AVAILABLE_OPERATORS.map(operator => [
                    { text: `${operator.name} ${operator.username}`, url: `https://t.me/${operator.username.substring(1)}` }
                ]);

                keyboard.push([{ text: "◀️ Назад в меню", callback_data: "back_to_start" }]);

                return {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                };
            }

            // Используем операторов из БД
            const keyboard = operators.map(operator => [
                {
                    text: `${operator.name} ${operator.formattedUsername}`,
                    url: operator.getContactUrl()
                }
            ]);

            keyboard.push([{ text: "◀️ Назад в меню", callback_data: "back_to_start" }]);

            return {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            };
        } catch (error) {
            console.error('Error getting operators from DB:', error);

            // В случае ошибки возвращаем операторов из конфига
            const keyboard = config.AVAILABLE_OPERATORS.map(operator => [
                { text: `${operator.name} ${operator.username}`, url: `https://t.me/${operator.username.substring(1)}` }
            ]);

            keyboard.push([{ text: "◀️ Назад в меню", callback_data: "back_to_start" }]);

            return {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            };
        }
    }
}

module.exports = Keyboards;