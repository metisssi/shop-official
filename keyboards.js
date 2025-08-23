// keyboards.js - Обновлённые клавиатуры согласно новому ТЗ
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

    static getCategoriesKeyboard(categories, showCartButton = false) {
        const keyboard = categories.map(category => [{
            text: `📂 ${category.name}`,
            callback_data: `category_${category._id}`
        }]);

        // Добавляем кнопку корзины если есть товары
        if (showCartButton) {
            keyboard.push([{ text: "🛒 Моя корзина", callback_data: "view_cart" }]);
        }

        keyboard.push([{ text: "◀️ Назад в меню", callback_data: "back_to_start" }]);

        return {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
    }

    static getPropertiesKeyboard(properties, categoryId, showCartButton = false) {
        const keyboard = properties.map(property => {
            // Показываем цену только в кронах
            let price;
            if (property.priceInCZK) {
                price = `${property.priceInCZK.toLocaleString('cs-CZ')} Kč`;
            } else if (property.price) {
                // Конвертируем из рублей в кроны (примерный курс)
                const priceInCZK = Math.round(property.price * 0.4);
                price = `${priceInCZK.toLocaleString('cs-CZ')} Kč`;
            } else {
                price = 'Цена не указана';
            }

            return [{
                text: `${property.name} - ${price}`,
                callback_data: `property_${property._id}`
            }];
        });

        // Добавляем кнопку корзины если есть товары
        if (showCartButton) {
            keyboard.push([{ text: "🛒 Моя корзина", callback_data: "view_cart" }]);
        }

        keyboard.push([{ text: "◀️ Назад к категориям", callback_data: "back_to_categories" }]);

        return {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
    }

    static getPropertyDetailKeyboard(propertyId, categoryId, showCartButton = false) {
        const keyboard = [
            [{ text: "🛒 Выбрать количество", callback_data: `select_quantity_${propertyId}` }]
        ];

        // Добавляем кнопку корзины если есть товары
        if (showCartButton) {
            keyboard.push([{ text: "🛒 Моя корзина", callback_data: "view_cart" }]);
        }

        keyboard.push([{ text: "◀️ Назад к списку", callback_data: `category_${categoryId}` }]);

        return {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
    }

    // Клавиатура для выбора количества
    static getQuantityKeyboard(propertyId) {
        console.log('🎹 Создание клавиатуры количества для товара:', propertyId);
        
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

    // Клавиатура после добавления товара в корзину
    static getAfterAddToCartKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🛒 Перейти к оплате", callback_data: "proceed_to_payment" }],
                    [{ text: "➕ Выбрать ещё товары", callback_data: "choose_more_items" }],
                    [{ text: "👀 Посмотреть корзину", callback_data: "view_cart" }]
                ]
            }
        };
    }

    // Клавиатура корзины с выбором способа оплаты
    static getCartKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💵 Оплата наличными при встрече", callback_data: "payment_cash" }],
                    [{ text: "💳 Оплата на карту", callback_data: "payment_card" }],
                    [
                        { text: "➕ Добавить еще", callback_data: "choose_more_items" },
                        { text: "🗑️ Очистить корзину", callback_data: "clear_cart" }
                    ]
                ]
            }
        };
    }

    // ОБНОВЛЁННАЯ клавиатура для подтверждения заказа (только 2 кнопки)
    static getOrderConfirmationKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Подтверждаю заказ", callback_data: "confirm_order" }],
                    [{ text: "🔄 Назад к корзине", callback_data: "back_to_cart" }]
                ]
            }
        };
    }

    // Клавиатура после успешного оформления заказа
    static getOrderSuccessKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🏠 Посмотреть ещё товары", callback_data: "work_with_bot" }],
                    [{ text: "📞 Связаться с оператором", callback_data: "contact_operator" }],
                    [{ text: "🏠 В главное меню", callback_data: "back_to_start" }]
                ]
            }
        };
    }

    // Клавиатура для запроса адреса (без кнопок - только текстовый ввод)
    static getAddressInputKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔄 Назад к корзине", callback_data: "back_to_cart" }]
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

    // === АДМИНСКИЕ КЛАВИАТУРЫ ===

    // Клавиатура для управления администраторами
    static getAdminManagementKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '➕ Добавить админа', callback_data: 'admin_add_admin' },
                        { text: '📋 Список админов', callback_data: 'admin_list_admins' }
                    ],
                    [{ text: '⬅️ Назад в админ меню', callback_data: 'admin_menu' }]
                ]
            }
        };
    }

    // Клавиатура для редактирования администратора
    static getEditAdminKeyboard(adminId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✏️ Изменить имя', callback_data: `admin_edit_admin_name_${adminId}` },
                        { text: '📱 Изменить ID', callback_data: `admin_edit_admin_id_${adminId}` }
                    ],
                    [
                        { text: '❌ Удалить админа', callback_data: `admin_delete_admin_${adminId}` }
                    ],
                    [{ text: '⬅️ Назад к списку', callback_data: 'admin_list_admins' }]
                ]
            }
        };
    }
}

module.exports = Keyboards;