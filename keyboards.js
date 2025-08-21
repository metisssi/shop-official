// keyboards.js - Исправленные клавиатуры
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

    // ✅ ИСПРАВЛЕННЫЙ МЕТОД - добавлен метод для категорий
    static getCategoriesKeyboard(categories) {
        const keyboard = categories.map(category => [{
            text: `📂 ${category.name}`,
            callback_data: `category_${category._id}`
        }]);

        keyboard.push([{ text: "◀️ Назад в меню", callback_data: "back_to_start" }]);

        return {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
    }

    // ✅ ИСПРАВЛЕННЫЙ МЕТОД - убрано дублирование и исправлено отображение цен
    static getPropertiesKeyboard(properties, categoryId) {
        const keyboard = properties.map(property => {
            // Показываем цену в правильной валюте
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
                    [{ text: "➕ Выбрать еще товары", callback_data: "continue_shopping" }],
                    [{ text: "🛒 Перейти к оформлению", callback_data: "view_cart" }]
                ]
            }
        };
    }

    static getCartKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💳 Оплата картой", callback_data: "payment_card" }],
                    [{ text: "💵 Оплата наличными", callback_data: "payment_cash" }],
                    [
                        { text: "➕ Добавить еще", callback_data: "continue_shopping" },
                        { text: "🗑️ Очистить корзину", callback_data: "clear_cart" }
                    ]
                ]
            }
        };
    }

    // 🔥 НОВАЯ КЛАВИАТУРА: Подтверждение заказа с выбором оплаты
    static getOrderConfirmationKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💳 Оплатить картой", callback_data: "confirm_order_card" }],
                    [{ text: "💵 Оплатить наличными", callback_data: "confirm_order_cash" }],
                    [
                        { text: "✏️ Изменить заказ", callback_data: "view_cart" },
                        { text: "❌ Отменить", callback_data: "back_to_start" }
                    ]
                ]
            }
        };
    }

    // 🔥 НОВАЯ КЛАВИАТУРА: После успешного заказа
    static getOrderCompleteKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🏠 Посмотреть еще товары", callback_data: "work_with_bot" }],
                    [{ text: "📞 Связаться с оператором", callback_data: "contact_operator" }],
                    [{ text: "🏠 В главное меню", callback_data: "back_to_start" }]
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