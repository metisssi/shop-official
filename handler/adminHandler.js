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
                    { text: '🏠 Управление товарами', callback_data: 'admin_products' }
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
                case 'admin_products':
                    await this.showProductsMenu(chatId, messageId);
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
                case 'product_add':
                    await this.selectCategoryForProduct(chatId, messageId);
                    break;
                case 'product_list':
                    await this.showProductsList(chatId, messageId);
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
                    } else if (data.startsWith('toggle_cat_')) {
                        const categoryId = data.replace('toggle_cat_', '');
                        await this.toggleCategoryStatus(chatId, messageId, categoryId);
                    } else if (data.startsWith('confirm_delete_cat_')) {
                        const categoryId = data.replace('confirm_delete_cat_', '');
                        await this.confirmDeleteCategory(chatId, messageId, categoryId);
                    } else if (data.startsWith('add_product_to_')) {
                        const categoryId = data.replace('add_product_to_', '');
                        await this.startAddProduct(chatId, categoryId);
                    } else if (data.startsWith('edit_product_')) {
                        const productId = data.replace('edit_product_', '');
                        await this.editProduct(chatId, messageId, productId);
                    } else if (data.startsWith('delete_product_')) {
                        const productId = data.replace('delete_product_', '');
                        await this.deleteProduct(chatId, messageId, productId);
                    } else if (data.startsWith('edit_prod_name_')) {
                        const productId = data.replace('edit_prod_name_', '');
                        await this.startEditProductName(chatId, productId);
                    } else if (data.startsWith('toggle_prod_')) {
                        const productId = data.replace('toggle_prod_', '');
                        await this.toggleProductStatus(chatId, messageId, productId);
                    } else if (data.startsWith('confirm_delete_prod_')) {
                        const productId = data.replace('confirm_delete_prod_', '');
                        await this.confirmDeleteProduct(chatId, messageId, productId);
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
                text += `${index + 1}. ${status} *${category.name}*\n\n`;

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
                        `📊 *Статус:* ${status}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✏️ Изменить название', callback_data: `edit_cat_name_${categoryId}` }
                    ],
                    [
                        { text: category.isActive ? '❌ Деактивировать' : '✅ Активировать', callback_data: `toggle_cat_${categoryId}` }
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

            const propertiesCount = await Property.countDocuments({ categoryId });
            
            let text = `🗑 *Удаление категории*\n\n` +
                      `📝 *Категория:* ${category.name}\n`;
            
            if (propertiesCount > 0) {
                text += `⚠️ *В этой категории ${propertiesCount} товаров*\n\n` +
                       `При удалении категории все товары будут также удалены!\n\n` +
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

            await Property.deleteMany({ categoryId });
            await Category.findByIdAndDelete(categoryId);

            this.bot.editMessageText(
                `✅ Категория "${category.name}" и все связанные товары удалены!`,
                { chat_id: chatId, message_id: messageId }
            );
            
            setTimeout(() => this.showAdminMenu(chatId), 2000);
        } catch (error) {
            console.error('Confirm delete category error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении категории');
        }
    }

    // === УПРАВЛЕНИЕ ТОВАРАМИ ===

    // Меню управления товарами
    showProductsMenu(chatId, messageId) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '➕ Добавить товар', callback_data: 'product_add' },
                    { text: '📋 Список товаров', callback_data: 'product_list' }
                ],
                [{ text: '⬅️ Назад в админ меню', callback_data: 'admin_menu' }]
            ]
        };

        this.bot.editMessageText('🏠 *Управление товарами*\n\nВыберите действие:', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Выбор категории для товара
    async selectCategoryForProduct(chatId, messageId) {
        try {
            const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 });
            
            if (categories.length === 0) {
                return this.bot.editMessageText('❌ Нет активных категорий!\n\nСначала создайте категории.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ Назад', callback_data: 'admin_products' }
                        ]]
                    }
                });
            }

            let text = '➕ *Добавление товара*\n\nВыберите категорию для товара:';
            const keyboard = [];

            categories.forEach(category => {
                keyboard.push([{ 
                    text: `📂 ${category.name}`, 
                    callback_data: `add_product_to_${category._id}` 
                }]);
            });

            keyboard.push([{ text: '⬅️ Назад', callback_data: 'admin_products' }]);

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            console.error('Select category for product error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке категорий');
        }
    }

    // Начало добавления товара в выбранную категорию
    async startAddProduct(chatId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            if (global.adminUtils) {
                global.adminUtils.createSession(chatId, 'adding_product_name', { categoryId });
            }

            this.bot.sendMessage(chatId, 
                `➕ *Добавление товара в категорию "${category.name}"*\n\nВведите название товара:`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Start add product error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при добавлении товара');
        }
    }

    // Список всех товаров
    async showProductsList(chatId, messageId) {
        try {
            const products = await Property.find()
                .populate('categoryId')
                .sort({ order: 1, name: 1 });
            
            if (products.length === 0) {
                return this.bot.editMessageText('🏠 *Товары*\n\n❌ Товары не найдены', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ Назад', callback_data: 'admin_products' }
                        ]]
                    }
                });
            }

            let text = '🏠 *Список товаров:*\n\n';
            const keyboard = [];

            products.forEach((product, index) => {
                const status = product.isAvailable ? '✅' : '❌';
                const categoryName = product.categoryId ? product.categoryId.name : 'Без категории';
                
                text += `${index + 1}. ${status} *${product.name}*\n`;
                text += `   📂 Категория: ${categoryName}\n`;
                text += `   💰 Цена: ${product.price.toLocaleString('ru-RU')} ₽\n\n`;

                keyboard.push([
                    { text: `✏️ ${product.name}`, callback_data: `edit_product_${product._id}` },
                    { text: `🗑 Удалить`, callback_data: `delete_product_${product._id}` }
                ]);
            });

            keyboard.push([{ text: '⬅️ Назад', callback_data: 'admin_products' }]);

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            console.error('Show products list error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке товаров');
        }
    }

    // Редактирование товара
    async editProduct(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId).populate('categoryId');
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            const status = product.isAvailable ? '✅ Доступен' : '❌ Недоступен';
            const categoryName = product.categoryId ? product.categoryId.name : 'Без категории';
            
            const text = `✏️ *Редактирование товара*\n\n` +
                        `📝 *Название:* ${product.name}\n` +
                        `📂 *Категория:* ${categoryName}\n` +
                        `💰 *Цена:* ${product.price.toLocaleString('ru-RU')} ₽\n` +
                        `📊 *Статус:* ${status}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✏️ Изменить название', callback_data: `edit_prod_name_${productId}` }
                    ],
                    [
                        { text: product.isAvailable ? '❌ Деактивировать' : '✅ Активировать', callback_data: `toggle_prod_${productId}` }
                    ],
                    [{ text: '⬅️ Назад к списку', callback_data: 'product_list' }]
                ]
            };

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Edit product error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке товара');
        }
    }

    // Начало редактирования названия товара
    async startEditProductName(chatId, productId) {
        const product = await Property.findById(productId);
        if (!product) {
            return this.bot.sendMessage(chatId, '❌ Товар не найден');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_product_name', { productId });
        }
        
        this.bot.sendMessage(chatId, 
            `✏️ *Редактирование названия товара*\n\nТекущее название: *${product.name}*\n\nВведите новое название:`,
            { parse_mode: 'Markdown' }
        );
    }

    // Переключение статуса товара
    async toggleProductStatus(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            product.isAvailable = !product.isAvailable;
            await product.save();

            const status = product.isAvailable ? 'активирован' : 'деактивирован';
            this.bot.sendMessage(chatId, `✅ Товар "${product.name}" ${status}!`);
            
            setTimeout(() => this.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Toggle product status error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при изменении статуса товара');
        }
    }

    // Удаление товара
    async deleteProduct(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            const text = `🗑 *Удаление товара*\n\n` +
                        `📝 *Товар:* ${product.name}\n` +
                        `💰 *Цена:* ${product.price.toLocaleString('ru-RU')} ₽\n\n` +
                        `Вы уверены, что хотите удалить этот товар?`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Да, удалить', callback_data: `confirm_delete_prod_${productId}` },
                        { text: '❌ Отмена', callback_data: 'product_list' }
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
            console.error('Delete product error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении товара');
        }
    }

    // Подтверждение удаления товара
    async confirmDeleteProduct(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            await Property.findByIdAndDelete(productId);

            this.bot.editMessageText(
                `✅ Товар "${product.name}" удален!`,
                { chat_id: chatId, message_id: messageId }
            );
            
            setTimeout(() => this.showAdminMenu(chatId), 2000);
        } catch (error) {
            console.error('Confirm delete product error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении товара');
        }
    }
}

module.exports = AdminHandler;