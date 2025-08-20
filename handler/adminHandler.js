const Category = require('../models/Category');
const Property = require('../models/Property');

class AdminHandler {
    constructor(bot, adminIds = []) {
        this.bot = bot;
        this.adminIds = adminIds; // Массив ID администраторов
        this.setupAdminCommands();
    }

    // Проверка прав администратора
    isAdmin(userId) {
        return this.adminIds.includes(userId);
    } 

    setupAdminCommands() {
        // Главное админ меню
        this.bot.onText(/\/admin/, (msg) => {
            if (!this.isAdmin(msg.from.id)) {
                return this.bot.sendMessage(msg.chat.id, '❌ У вас нет прав администратора');
            }
            this.showAdminMenu(msg.chat.id);
        });

        // Обработка callback запросов для админки
        this.bot.on('callback_query', (query) => {
            if (!this.isAdmin(query.from.id)) return;
            this.handleAdminCallback(query);
        });
    }

    // Главное меню администратора
    showAdminMenu(chatId) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📂 Управление категориями', callback_data: 'admin_categories' },
                    { text: '🏠 Управление недвижимостью', callback_data: 'admin_properties' }
                ],
                [
                    { text: '📊 Статистика', callback_data: 'admin_stats' },
                    { text: '📋 Заказы', callback_data: 'admin_orders' }
                ]
            ]
        };

        this.bot.sendMessage(chatId, '🔧 *Административная панель*\n\nВыберите раздел для управления:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Обработка админ callback'ов
    async handleAdminCallback(query) {
        const data = query.data;
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        try {
            switch (data) {
                case 'admin_categories':
                    await this.showCategoriesMenu(chatId, messageId);
                    break;
                case 'admin_properties':
                    await this.showPropertiesMenu(chatId, messageId);
                    break;
                case 'admin_menu':
                    await this.showAdminMenu(chatId);
                    break;
                case 'category_add':
                    await this.startAddCategory(chatId);
                    break;
                case 'category_list':
                    await this.showCategoriesList(chatId, messageId);
                    break;
                case 'property_add':
                    await this.startAddProperty(chatId);
                    break;
                case 'property_list':
                    await this.showPropertiesList(chatId, messageId);
                    break;
                    
                default:
                    if (data.startsWith('edit_category_')) {
                        const categoryId = data.replace('edit_category_', '');
                        await this.editCategory(chatId, messageId, categoryId);
                    } else if (data.startsWith('delete_category_')) {
                        const categoryId = data.replace('delete_category_', '');
                        await this.deleteCategory(chatId, messageId, categoryId);
                    } else if (data.startsWith('edit_cat_name_')) {
                        const categoryId = data.replace('edit_cat_name_', '');
                        await this.startEditCategoryName(chatId, categoryId);
                    } else if (data.startsWith('edit_cat_desc_')) {
                        const categoryId = data.replace('edit_cat_desc_', '');
                        await this.startEditCategoryDescription(chatId, categoryId);
                    } else if (data.startsWith('edit_cat_order_')) {
                        const categoryId = data.replace('edit_cat_order_', '');
                        await this.startEditCategoryOrder(chatId, categoryId);
                    } else if (data.startsWith('toggle_cat_')) {
                        const categoryId = data.replace('toggle_cat_', '');
                        await this.toggleCategoryStatus(chatId, messageId, categoryId);
                    } else if (data.startsWith('confirm_delete_cat_')) {
                        const categoryId = data.replace('confirm_delete_cat_', '');
                        await this.confirmDeleteCategory(chatId, messageId, categoryId);
                    } else if (data.startsWith('edit_property_')) {
                        const propertyId = data.replace('edit_property_', '');
                        await this.editProperty(chatId, messageId, propertyId);
                    } else if (data.startsWith('delete_property_')) {
                        const propertyId = data.replace('delete_property_', '');
                        await this.deleteProperty(chatId, messageId, propertyId);
                    }
                    break;
            }
        } catch (error) {
            console.error('Admin callback error:', error);
            this.bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз.');
        }

        this.bot.answerCallbackQuery(query.id);
    }

    // === УПРАВЛЕНИЕ КАТЕГОРИЯМИ ===

    // Меню управления категориями
    showCategoriesMenu(chatId, messageId) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '➕ Добавить категорию', callback_data: 'category_add' },
                    { text: '📋 Список категорий', callback_data: 'category_list' }
                ],
                [{ text: '⬅️ Назад в админ меню', callback_data: 'admin_menu' }]
            ]
        };

        this.bot.editMessageText('📂 *Управление категориями*\n\nВыберите действие:', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Список всех категорий с кнопками управления
    async showCategoriesList(chatId, messageId) {
        try {
            const categories = await Category.find().sort({ order: 1, name: 1 });
            
            if (categories.length === 0) {
                return this.bot.editMessageText('📂 *Категории*\n\n❌ Категории не найдены', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ Назад', callback_data: 'admin_categories' }
                        ]]
                    }
                });
            }

            let text = '📂 *Список категорий:*\n\n';
            const keyboard = [];

            categories.forEach((category, index) => {
                const status = category.isActive ? '✅' : '❌';
                text += `${index + 1}. ${status} *${category.name}*\n`;
                text += `   📝 ${category.description || 'Без описания'}\n`;
                text += `   🔄 Порядок: ${category.order}\n\n`;

                keyboard.push([
                    { text: `✏️ ${category.name}`, callback_data: `edit_category_${category._id}` },
                    { text: `🗑 Удалить`, callback_data: `delete_category_${category._id}` }
                ]);
            });

            keyboard.push([{ text: '⬅️ Назад', callback_data: 'admin_categories' }]);

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            console.error('Show categories list error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке категорий');
        }
    }

    // Начало добавления новой категории
    async startAddCategory(chatId) {
        // Создаем сессию для добавления категории
        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'adding_category_name', {});
        }

        this.bot.sendMessage(chatId, '➕ *Добавление новой категории*\n\nВведите название категории:', {
            parse_mode: 'Markdown'
        });
    }

    // Редактирование категории
    async editCategory(chatId, messageId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            const status = category.isActive ? '✅ Активна' : '❌ Неактивна';
            const text = `✏️ *Редактирование категории*\n\n` +
                        `📝 *Название:* ${category.name}\n` +
                        `📄 *Описание:* ${category.description || 'Не указано'}\n` +
                        `📊 *Статус:* ${status}\n` +
                        `🔄 *Порядок:* ${category.order}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✏️ Изменить название', callback_data: `edit_cat_name_${categoryId}` },
                        { text: '📄 Изменить описание', callback_data: `edit_cat_desc_${categoryId}` }
                    ],
                    [
                        { text: category.isActive ? '❌ Деактивировать' : '✅ Активировать', callback_data: `toggle_cat_${categoryId}` },
                        { text: '🔄 Изменить порядок', callback_data: `edit_cat_order_${categoryId}` }
                    ],
                    [{ text: '⬅️ Назад к списку', callback_data: 'category_list' }]
                ]
            };

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Edit category error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке категории');
        }
    }

    // Удаление категории
    async deleteCategory(chatId, messageId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            // Проверяем, есть ли недвижимость в этой категории
            const propertiesCount = await Property.countDocuments({ categoryId });
            
            let text = `🗑 *Удаление категории*\n\n` +
                      `📝 *Категория:* ${category.name}\n`;
            
            if (propertiesCount > 0) {
                text += `⚠️ *В этой категории ${propertiesCount} объектов недвижимости*\n\n` +
                       `При удалении категории все объекты будут также удалены!\n\n` +
                       `Вы уверены?`;
            } else {
                text += `\nВы уверены, что хотите удалить эту категорию?`;
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Да, удалить', callback_data: `confirm_delete_cat_${categoryId}` },
                        { text: '❌ Отмена', callback_data: 'category_list' }
                    ]
                ]
            };

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Delete category error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении категории');
        }
    }

    // === НОВЫЕ МЕТОДЫ ДЛЯ РЕДАКТИРОВАНИЯ ===

    // Начало редактирования названия категории
    async startEditCategoryName(chatId, categoryId) {
        const category = await Category.findById(categoryId);
        if (!category) {
            return this.bot.sendMessage(chatId, '❌ Категория не найдена');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_category_name', { categoryId });
        }
        
        this.bot.sendMessage(chatId, 
            `✏️ *Редактирование названия категории*\n\nТекущее название: *${category.name}*\n\nВведите новое название:`,
            { parse_mode: 'Markdown' }
        );
    }

    // Начало редактирования описания категории  
    async startEditCategoryDescription(chatId, categoryId) {
        const category = await Category.findById(categoryId);
        if (!category) {
            return this.bot.sendMessage(chatId, '❌ Категория не найдена');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_category_description', { categoryId });
        }
        
        this.bot.sendMessage(chatId, 
            `📄 *Редактирование описания категории*\n\nТекущее описание: *${category.description || 'Не указано'}*\n\nВведите новое описание (или "пропустить" для удаления):`,
            { parse_mode: 'Markdown' }
        );
    }

    // Начало редактирования порядка категории
    async startEditCategoryOrder(chatId, categoryId) {
        const category = await Category.findById(categoryId);
        if (!category) {
            return this.bot.sendMessage(chatId, '❌ Категория не найдена');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_category_order', { categoryId });
        }
        
        this.bot.sendMessage(chatId, 
            `🔄 *Редактирование порядка категории*\n\nТекущий порядок: *${category.order}*\n\nВведите новый порядок (число от 0 до 9999):`,
            { parse_mode: 'Markdown' }
        );
    }

    // Переключение статуса категории
    async toggleCategoryStatus(chatId, messageId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            category.isActive = !category.isActive;
            await category.save();

            const status = category.isActive ? 'активирована' : 'деактивирована';
            this.bot.sendMessage(chatId, `✅ Категория "${category.name}" ${status}!`);
            
            setTimeout(() => this.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Toggle category status error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при изменении статуса категории');
        }
    }

    // Подтверждение удаления категории
    async confirmDeleteCategory(chatId, messageId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            // Удаляем все связанные объекты недвижимости
            await Property.deleteMany({ categoryId });
            
            // Удаляем категорию
            await Category.findByIdAndDelete(categoryId);

            this.bot.editMessageText(
                `✅ Категория "${category.name}" и все связанные объекты недвижимости удалены!`,
                { chat_id: chatId, message_id: messageId }
            );
            
            setTimeout(() => this.showAdminMenu(chatId), 2000);
        } catch (error) {
            console.error('Confirm delete category error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении категории');
        }
    }

    // === УПРАВЛЕНИЕ НЕДВИЖИМОСТЬЮ ===

    // Меню управления недвижимостью
    showPropertiesMenu(chatId, messageId) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '➕ Добавить объект', callback_data: 'property_add' },
                    { text: '📋 Список объектов', callback_data: 'property_list' }
                ],
                [{ text: '⬅️ Назад в админ меню', callback_data: 'admin_menu' }]
            ]
        };

        this.bot.editMessageText('🏠 *Управление недвижимостью*\n\nВыберите действие:', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Список всех объектов недвижимости
    async showPropertiesList(chatId, messageId) {
        try {
            const properties = await Property.find().populate('categoryId').sort({ order: 1, name: 1 });
            
            if (properties.length === 0) {
                return this.bot.editMessageText('🏠 *Недвижимость*\n\n❌ Объекты не найдены', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ Назад', callback_data: 'admin_properties' }
                        ]]
                    }
                });
            }

            let text = '🏠 *Список объектов недвижимости:*\n\n';
            const keyboard = [];

            properties.forEach((property, index) => {
                const status = property.isAvailable ? '✅' : '❌';
                const category = property.categoryId ? property.categoryId.name : 'Без категории';
                
                text += `${index + 1}. ${status} *${property.name}*\n`;
                text += `   📂 ${category}\n`;
                text += `   💰 ${property.price.toLocaleString()} ₽\n`;
                text += `   📍 ${property.specifications?.address || 'Адрес не указан'}\n\n`;

                keyboard.push([
                    { text: `✏️ ${property.name}`, callback_data: `edit_property_${property._id}` },
                    { text: `🗑 Удалить`, callback_data: `delete_property_${property._id}` }
                ]);
            });

            keyboard.push([{ text: '⬅️ Назад', callback_data: 'admin_properties' }]);

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            console.error('Show properties list error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке объектов недвижимости');
        }
    }

    // Начало добавления новой недвижимости
    async startAddProperty(chatId) {
        try {
            const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 });
            
            if (categories.length === 0) {
                return this.bot.sendMessage(chatId, '❌ Для добавления недвижимости нужно сначала создать категории');
            }

            let text = '➕ *Добавление объекта недвижимости*\n\nВыберите категорию:';
            const keyboard = [];

            categories.forEach(category => {
                keyboard.push([{ text: category.name, callback_data: `select_cat_${category._id}` }]);
            });

            keyboard.push([{ text: '❌ Отмена', callback_data: 'admin_properties' }]);

            this.bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            console.error('Start add property error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке категорий');
        }
    }

    // Заглушки для методов недвижимости (добавьте позже)
    async editProperty(chatId, messageId, propertyId) {
        this.bot.sendMessage(chatId, '🚧 Редактирование недвижимости - в разработке');
    }

    async deleteProperty(chatId, messageId, propertyId) {
        this.bot.sendMessage(chatId, '🚧 Удаление недвижимости - в разработке');
    }
}

module.exports = AdminHandler;