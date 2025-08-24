const Category = require('../models/Category');
const Property = require('../models/Property');
const Operator = require('../models/Operator');

class AdminHandler {
    constructor(bot, adminIds = []) {
        this.bot = bot;
        this.adminIds = adminIds;
        this.setupAdminCommands();
    }

    // Проверка прав администратора
    isAdmin(userId) {
        return this.adminIds.includes(userId);
    }

    // Метод для экранирования специальных символов Markdown
    escapeMarkdown(text) {
        if (!text) return '';
        return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
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

    // Обработка загрузки фотографий
    async handlePhotoUpload(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        try {
            console.log('Получена фотография от пользователя:', userId);

            const session = global.adminUtils?.getSession(userId);
            console.log('Текущая сессия:', session);

            if (!session || session.type !== 'uploading_product_photo') {
                console.log('Сессия не найдена или неверный тип');
                return this.bot.sendMessage(chatId,
                    '❌ Сначала выберите товар для добавления фотографии через команду /admin');
            }

            const { productId } = session.data;
            console.log('ID товара из сессии:', productId);

            const product = await Property.findById(productId);

            if (!product) {
                global.adminUtils.clearSession(userId);
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            const photo = msg.photo[msg.photo.length - 1];

            const photoData = {
                fileId: photo.file_id,
                fileName: `photo_${Date.now()}.jpg`,
                fileSize: photo.file_size,
                uploadedBy: userId,
                uploadedAt: new Date()
            };

            console.log('Добавляем фотографию:', photoData);

            await product.addPhoto(photoData);
            global.adminUtils.clearSession(userId);

            const updatedProduct = await Property.findById(productId);
            const escapedName = this.escapeMarkdown(product.name);

            this.bot.sendMessage(chatId,
                `✅ Фотография добавлена к товару "${escapedName}"!\n\n📸 Всего фотографий: ${updatedProduct.photos.length}`,
                { parse_mode: 'Markdown' }
            );

            setTimeout(() => {
                this.manageProductPhotos(chatId, null, productId);
            }, 1000);

        } catch (error) {
            console.error('Photo upload error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке фотографии');
        }
    }

    // В файле handler/adminHandler.js замените метод showAdminMenu на этот:

    showAdminMenu(chatId, messageId = null) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📂 Управление категориями', callback_data: 'admin_categories' },
                    { text: '🏠 Управление товарами', callback_data: 'admin_products' }
                ],
                [
                    { text: '👥 Управление операторами', callback_data: 'admin_operators' },
                    { text: '📋 Заказы', callback_data: 'admin_orders' }
                ],
                [
                    { text: '👑 Управление админами', callback_data: 'admin_admins_management' },
                    { text: '📊 Статистика', callback_data: 'admin_stats' }
                ]
            ]
        };

        const text = '🔧 Административная панель\n\nВыберите раздел для управления:';

        // Если есть messageId - редактируем сообщение, иначе отправляем новое
        if (messageId) {
            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: keyboard
            }).catch(error => {
                console.log('Не удалось отредактировать сообщение, отправляем новое:', error.message);
                // Fallback - отправляем новое сообщение
                this.bot.sendMessage(chatId, text, {
                    reply_markup: keyboard
                });
            });
        } else {
            this.bot.sendMessage(chatId, text, {
                reply_markup: keyboard
            });
        }
    }

    // В файле handler/adminHandler.js в методе handleAdminCallback найдите и исправьте:

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
                case 'admin_operators':
                    await this.showOperatorsMenu(chatId, messageId);
                    break;
                case 'admin_menu':
                    // ИСПРАВЛЕНО: передаем messageId для редактирования
                    await this.showAdminMenu(chatId, messageId);
                    break;
                case 'admin_admins_management':
                    await this.showAdminsManagement(chatId, messageId);
                    break;
                case 'admin_add_admin':
                    await this.startAddAdmin(chatId);
                    break;
                case 'admin_list_admins':
                    await this.showAdminsList(chatId, messageId);
                    break;

                // ... остальные case'ы остаются без изменений
            }
        } catch (error) {
            console.error('Admin callback error:', error);
            this.bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз.');
        }

        this.bot.answerCallbackQuery(query.id);
    }


    // === УПРАВЛЕНИЕ КАТЕГОРИЯМИ ===

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
                const escapedName = this.escapeMarkdown(category.name);
                text += `${index + 1}\\. ${status} *${escapedName}*\n\n`;

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

    async startAddCategory(chatId) {
        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'adding_category_name', {});
        }

        this.bot.sendMessage(chatId, '➕ *Добавление новой категории*\n\nВведите название категории:', {
            parse_mode: 'Markdown'
        });
    }

    async editCategory(chatId, messageId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            const status = category.isActive ? '✅ Активна' : '❌ Неактивна';
            const escapedName = this.escapeMarkdown(category.name);
            const text = `✏️ *Редактирование категории*\n\n` +
                `📝 *Название:* ${escapedName}\n` +
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

    async deleteCategory(chatId, messageId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            const propertiesCount = await Property.countDocuments({ categoryId });
            const escapedName = this.escapeMarkdown(category.name);

            let text = `🗑 *Удаление категории*\n\n` +
                `📝 *Категория:* ${escapedName}\n`;

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

    async startEditCategoryName(chatId, categoryId) {
        const category = await Category.findById(categoryId);
        if (!category) {
            return this.bot.sendMessage(chatId, '❌ Категория не найдена');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_category_name', { categoryId });
        }

        const escapedName = this.escapeMarkdown(category.name);
        this.bot.sendMessage(chatId,
            `✏️ *Редактирование названия категории*\n\nТекущее название: *${escapedName}*\n\nВведите новое название:`,
            { parse_mode: 'Markdown' }
        );
    }

    async toggleCategoryStatus(chatId, messageId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            category.isActive = !category.isActive;
            await category.save();

            const status = category.isActive ? 'активирована' : 'деактивирована';
            const escapedName = this.escapeMarkdown(category.name);
            this.bot.sendMessage(chatId, `✅ Категория "${escapedName}" ${status}!`);

            setTimeout(() => this.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Toggle category status error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при изменении статуса категории');
        }
    }

    async confirmDeleteCategory(chatId, messageId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            await Property.deleteMany({ categoryId });
            await Category.findByIdAndDelete(categoryId);

            const escapedName = this.escapeMarkdown(category.name);
            this.bot.editMessageText(
                `✅ Категория "${escapedName}" и все связанные товары удалены!`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            );

            setTimeout(() => this.showAdminMenu(chatId), 2000);
        } catch (error) {
            console.error('Confirm delete category error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении категории');
        }
    }

    // === УПРАВЛЕНИЕ ТОВАРАМИ ===

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

    async startAddProduct(chatId, categoryId) {
        try {
            const category = await Category.findById(categoryId);
            if (!category) {
                return this.bot.sendMessage(chatId, '❌ Категория не найдена');
            }

            if (global.adminUtils) {
                global.adminUtils.createSession(chatId, 'adding_product_name', { categoryId });
            }

            const escapedName = this.escapeMarkdown(category.name);
            this.bot.sendMessage(chatId,
                `➕ *Добавление товара в категорию "${escapedName}"*\n\nВведите название товара:`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Start add product error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при добавлении товара');
        }
    }

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
                const photoIcon = product.photosCount > 0 ? `📸${product.photosCount}` : '📷';

                const escapedName = this.escapeMarkdown(product.name);
                const escapedCategory = this.escapeMarkdown(categoryName);

                text += `${index + 1}\\. ${status} ${photoIcon} *${escapedName}*\n`;
                text += `   📂 Категория: ${escapedCategory}\n`;

                if (product.priceInCZK) {
                    text += `   💰 Цена: ${product.priceInCZK.toLocaleString('cs-CZ')} Kč\n\n`;
                } else {
                    text += `   💰 Цена: не указана\n\n`;
                }

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

    async editProduct(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId).populate('categoryId');
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            const status = product.isAvailable ? '✅ Доступен' : '❌ Недоступен';
            const categoryName = product.categoryId ? product.categoryId.name : 'Без категории';
            const price = product.priceInCZK ? `${product.priceInCZK.toLocaleString('cs-CZ')} Kč` : 'не указана';
            const photosInfo = product.photosCount > 0 ? `📸 ${product.photosCount} фото` : '📷 Нет фото';

            const escapedName = this.escapeMarkdown(product.name);
            const escapedCategory = this.escapeMarkdown(categoryName);
            const escapedDescription = this.escapeMarkdown(product.description || 'Не указано');

            const text = `✏️ *Редактирование товара*\n\n` +
                `📝 *Название:* ${escapedName}\n` +
                `📂 *Категория:* ${escapedCategory}\n` +
                `💰 *Цена:* ${price}\n` +
                `📷 *Фотографии:* ${photosInfo}\n` +
                `📄 *Описание:* ${escapedDescription}\n` +
                `📊 *Статус:* ${status}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✏️ Изменить название', callback_data: `edit_prod_name_${productId}` },
                        { text: '📝 Изменить описание', callback_data: `edit_prod_desc_${productId}` }
                    ],
                    [
                        { text: '💰 Изменить цену', callback_data: `edit_prod_price_${productId}` },
                        { text: '📷 Управление фото', callback_data: `manage_prod_photos_${productId}` }
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

    async manageProductPhotos(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            const escapedName = this.escapeMarkdown(product.name);
            let text = `📷 *Управление фотографиями*\n\n`;
            text += `🏠 *Товар:* ${escapedName}\n`;
            text += `📸 *Всего фотографий:* ${product.photosCount}\n\n`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '➕ Добавить фото', callback_data: `add_prod_photo_${productId}` }
                    ]
                ]
            };

            if (product.photosCount > 0) {
                keyboard.inline_keyboard.push([
                    { text: '👀 Просмотреть фото', callback_data: `view_prod_photos_${productId}` }
                ]);
            }

            keyboard.inline_keyboard.push([
                { text: '⬅️ Назад к товару', callback_data: `edit_product_${productId}` }
            ]);

            if (messageId) {
                this.bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                this.bot.sendMessage(chatId, text, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        } catch (error) {
            console.error('Manage product photos error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при управлении фотографиями');
        }
    }

    async startAddProductPhoto(chatId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            console.log('Создаем сессию для пользователя:', chatId, 'товар:', productId);

            if (global.adminUtils) {
                global.adminUtils.createSession(chatId, 'uploading_product_photo', { productId });
                console.log('Сессия создана успешно');
            } else {
                console.error('global.adminUtils не найден!');
                return this.bot.sendMessage(chatId, '❌ Ошибка системы. Попробуйте позже.');
            }

            const escapedName = this.escapeMarkdown(product.name);

            this.bot.sendMessage(chatId,
                `📷 *Добавление фотографии*\n\n🏠 Товар: *${escapedName}*\n\n📸 Отправьте фотографию \\(просто прикрепите изображение к сообщению\\):`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Start add product photo error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при добавлении фотографии');
        }
    }

    async viewProductPhotos(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            if (product.photosCount === 0) {
                const escapedName = this.escapeMarkdown(product.name);
                return this.bot.editMessageText(
                    `📷 *Фотографии товара*\n\n🏠 *Товар:* ${escapedName}\n\n❌ У этого товара нет фотографий`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '⬅️ Назад', callback_data: `manage_prod_photos_${productId}` }
                            ]]
                        }
                    }
                );
            }

            const escapedName = this.escapeMarkdown(product.name);
            let text = `📷 *Фотографии товара*\n\n🏠 *Товар:* ${escapedName}\n📸 *Количество:* ${product.photosCount}\n\n`;

            const keyboard = [];

            product.photos.forEach((photo, index) => {
                const isMain = photo.isMain ? '⭐ ' : '';
                const photoRow = [];

                photoRow.push({
                    text: `${isMain}📸 ${index + 1}`,
                    callback_data: `current_page`
                });

                if (!photo.isMain) {
                    photoRow.push({
                        text: '⭐ Сделать главной',
                        callback_data: `set_main_photo_${productId}_${index}`
                    });
                }

                photoRow.push({
                    text: '🗑',
                    callback_data: `delete_photo_${productId}_${index}`
                });

                keyboard.push(photoRow);
            });

            keyboard.push([
                { text: '➕ Добавить фото', callback_data: `add_prod_photo_${productId}` },
                { text: '⬅️ Назад', callback_data: `manage_prod_photos_${productId}` }
            ]);

            if (product.mainPhoto) {
                await this.bot.sendPhoto(chatId, product.mainPhoto.fileId, {
                    caption: text,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                });

                try {
                    await this.bot.deleteMessage(chatId, messageId);
                } catch (error) {
                    // Игнорируем ошибку удаления
                }
            } else {
                this.bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                });
            }

        } catch (error) {
            console.error('View product photos error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при просмотре фотографий');
        }
    }

    async setMainPhoto(chatId, messageId, productId, photoIndex) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            await product.setMainPhoto(photoIndex);

            this.bot.sendMessage(chatId, '✅ Главная фотография установлена!');

            setTimeout(() => this.viewProductPhotos(chatId, messageId, productId), 1000);

        } catch (error) {
            console.error('Set main photo error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при установке главной фотографии');
        }
    }

    async deletePhoto(chatId, messageId, productId, photoIndex) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            await product.removePhoto(photoIndex);

            this.bot.sendMessage(chatId, '✅ Фотография удалена!');

            setTimeout(() => this.viewProductPhotos(chatId, messageId, productId), 1000);

        } catch (error) {
            console.error('Delete photo error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении фотографии');
        }
    }

    async startEditProductName(chatId, productId) {
        const product = await Property.findById(productId);
        if (!product) {
            return this.bot.sendMessage(chatId, '❌ Товар не найден');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_product_name', { productId });
        }

        const escapedName = this.escapeMarkdown(product.name);
        this.bot.sendMessage(chatId,
            `✏️ *Редактирование названия товара*\n\nТекущее название: *${escapedName}*\n\nВведите новое название:`,
            { parse_mode: 'Markdown' }
        );
    }

    async startEditProductDescription(chatId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            if (global.adminUtils) {
                global.adminUtils.createSession(chatId, 'editing_product_description', { productId });
            }

            const currentDesc = product.description || 'Отсутствует';
            const escapedDesc = this.escapeMarkdown(currentDesc);
            const escapedName = this.escapeMarkdown(product.name);

            this.bot.sendMessage(chatId,
                `📝 *Редактирование описания товара*\n\nТовар: *${escapedName}*\n\nТекущее описание: ${escapedDesc}\n\nВведите новое описание:`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Start edit product description error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при редактировании описания');
        }
    }

    async startEditProductPrice(chatId, productId) {
        const product = await Property.findById(productId);
        if (!product) {
            return this.bot.sendMessage(chatId, '❌ Товар не найден');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_product_price', { productId });
        }

        const currentPrice = product.priceInCZK ?
            `${product.priceInCZK.toLocaleString('cs-CZ')} Kč` :
            `${product.price.toLocaleString('ru-RU')} ₽`;

        this.bot.sendMessage(chatId,
            `💰 *Редактирование цены товара*\n\nТекущая цена: *${currentPrice}*\n\nВведите новую цену с валютой:\n\nПримеры:\n• 5000000 (рубли)\n• 5000000 RUB\n• 2000000 CZK\n• 2000000 крон`,
            { parse_mode: 'Markdown' }
        );
    }

    async toggleProductStatus(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            product.isAvailable = !product.isAvailable;
            await product.save();

            const status = product.isAvailable ? 'активирован' : 'деактивирован';
            const escapedName = this.escapeMarkdown(product.name);
            this.bot.sendMessage(chatId, `✅ Товар "${escapedName}" ${status}!`);

            setTimeout(() => this.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Toggle product status error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при изменении статуса товара');
        }
    }

    async deleteProduct(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            const price = product.priceInCZK ? `${product.priceInCZK.toLocaleString('cs-CZ')} Kč` : 'не указана';
            const photosInfo = product.photosCount > 0 ? `\n📸 *Фотографий:* ${product.photosCount}` : '';
            const escapedName = this.escapeMarkdown(product.name);

            const text = `🗑 *Удаление товара*\n\n` +
                `📝 *Товар:* ${escapedName}\n` +
                `💰 *Цена:* ${price}${photosInfo}\n\n` +
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

    async confirmDeleteProduct(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            await Property.findByIdAndDelete(productId);

            const escapedName = this.escapeMarkdown(product.name);
            this.bot.editMessageText(
                `✅ Товар "${escapedName}" удален!`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            );

            setTimeout(() => this.showAdminMenu(chatId), 2000);
        } catch (error) {
            console.error('Confirm delete product error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении товара');
        }
    }

    // === УПРАВЛЕНИЕ ОПЕРАТОРАМИ ===

    showOperatorsMenu(chatId, messageId) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '➕ Добавить оператора', callback_data: 'operator_add' },
                    { text: '📋 Список операторов', callback_data: 'operator_list' }
                ],
                [{ text: '⬅️ Назад в админ меню', callback_data: 'admin_menu' }]
            ]
        };

        this.bot.editMessageText('👥 *Управление операторами*\n\nВыберите действие:', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showOperatorsList(chatId, messageId) {
        try {
            const operators = await Operator.find().sort({ order: 1, name: 1 });

            if (operators.length === 0) {
                return this.bot.editMessageText('👥 *Операторы*\n\n❌ Операторы не найдены', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ Назад', callback_data: 'admin_operators' }
                        ]]
                    }
                });
            }

            let text = '👥 *Список операторов:*\n\n';
            const keyboard = [];

            operators.forEach((operator, index) => {
                const status = operator.isActive ? '✅' : '❌';
                const specialization = {
                    general: 'Общий',
                    premium: 'Премиум',
                    commercial: 'Коммерческая',
                    residential: 'Жилая'
                };

                const escapedName = this.escapeMarkdown(operator.name);

                text += `${index + 1}\\. ${status} *${escapedName}*\n`;
                text += `   📱 ${operator.formattedUsername}\n`;
                text += `   🏷 ${specialization[operator.specialization]}\n\n`;

                keyboard.push([
                    { text: `✏️ ${operator.name}`, callback_data: `edit_operator_${operator._id}` },
                    { text: `🗑 Удалить`, callback_data: `delete_operator_${operator._id}` }
                ]);
            });

            keyboard.push([{ text: '⬅️ Назад', callback_data: 'admin_operators' }]);

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            console.error('Show operators list error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке операторов');
        }
    }

    async startAddOperator(chatId) {
        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'adding_operator_name', {});
        }

        this.bot.sendMessage(chatId, '➕ *Добавление нового оператора*\n\nВведите имя оператора:', {
            parse_mode: 'Markdown'
        });
    }

    async editOperator(chatId, messageId, operatorId) {
        try {
            const operator = await Operator.findById(operatorId);
            if (!operator) {
                return this.bot.sendMessage(chatId, '❌ Оператор не найден');
            }

            const status = operator.isActive ? '✅ Активен' : '❌ Неактивен';
            const specialization = {
                general: 'Общий',
                premium: 'Премиум',
                commercial: 'Коммерческая',
                residential: 'Жилая'
            };

            const escapedName = this.escapeMarkdown(operator.name);

            const text = `✏️ *Редактирование оператора*\n\n` +
                `👤 *Имя:* ${escapedName}\n` +
                `📱 *Username:* ${operator.formattedUsername}\n` +
                `🏷 *Специализация:* ${specialization[operator.specialization]}\n` +
                `📊 *Статус:* ${status}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✏️ Изменить имя', callback_data: `edit_op_name_${operatorId}` }
                    ],
                    [
                        { text: '📱 Изменить username', callback_data: `edit_op_username_${operatorId}` }
                    ],
                    [
                        { text: operator.isActive ? '❌ Деактивировать' : '✅ Активировать', callback_data: `toggle_op_${operatorId}` }
                    ],
                    [{ text: '⬅️ Назад к списку', callback_data: 'operator_list' }]
                ]
            };

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Edit operator error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке оператора');
        }
    }

    async deleteOperator(chatId, messageId, operatorId) {
        try {
            const operator = await Operator.findById(operatorId);
            if (!operator) {
                return this.bot.sendMessage(chatId, '❌ Оператор не найден');
            }

            const escapedName = this.escapeMarkdown(operator.name);

            const text = `🗑 *Удаление оператора*\n\n` +
                `👤 *Оператор:* ${escapedName}\n` +
                `📱 *Username:* ${operator.formattedUsername}\n\n` +
                `Вы уверены, что хотите удалить этого оператора?`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Да, удалить', callback_data: `confirm_delete_op_${operatorId}` },
                        { text: '❌ Отмена', callback_data: 'operator_list' }
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
            console.error('Delete operator error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении оператора');
        }
    }

    async startEditOperatorName(chatId, operatorId) {
        const operator = await Operator.findById(operatorId);
        if (!operator) {
            return this.bot.sendMessage(chatId, '❌ Оператор не найден');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_operator_name', { operatorId });
        }

        const escapedName = this.escapeMarkdown(operator.name);
        this.bot.sendMessage(chatId,
            `✏️ *Редактирование имени оператора*\n\nТекущее имя: *${escapedName}*\n\nВведите новое имя:`,
            { parse_mode: 'Markdown' }
        );
    }

    async startEditOperatorUsername(chatId, operatorId) {
        const operator = await Operator.findById(operatorId);
        if (!operator) {
            return this.bot.sendMessage(chatId, '❌ Оператор не найден');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_operator_username', { operatorId });
        }

        this.bot.sendMessage(chatId,
            `📱 *Редактирование username оператора*\n\nТекущий username: *${operator.formattedUsername}*\n\nВведите новый username (без @):`,
            { parse_mode: 'Markdown' }
        );
    }

    async toggleOperatorStatus(chatId, messageId, operatorId) {
        try {
            const operator = await Operator.findById(operatorId);
            if (!operator) {
                return this.bot.sendMessage(chatId, '❌ Оператор не найден');
            }

            operator.isActive = !operator.isActive;
            await operator.save();

            const status = operator.isActive ? 'активирован' : 'деактивирован';
            const escapedName = this.escapeMarkdown(operator.name);
            this.bot.sendMessage(chatId, `✅ Оператор "${escapedName}" ${status}!`);

            setTimeout(() => this.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Toggle operator status error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при изменении статуса оператора');
        }
    }

    async confirmDeleteOperator(chatId, messageId, operatorId) {
        try {
            const operator = await Operator.findById(operatorId);
            if (!operator) {
                return this.bot.sendMessage(chatId, '❌ Оператор не найден');
            }

            await Operator.findByIdAndDelete(operatorId);

            const escapedName = this.escapeMarkdown(operator.name);
            this.bot.editMessageText(
                `✅ Оператор "${escapedName}" удален!`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            );

            setTimeout(() => this.showAdminMenu(chatId), 2000);
        } catch (error) {
            console.error('Confirm delete operator error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении оператора');
        }
    }

    // В файле handler/adminHandler.js замените метод showAdminsManagement на этот:

    async showAdminsManagement(chatId, messageId) {
        console.log('🔧 Показ управления админами для пользователя:', chatId);

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '➕ Добавить админа', callback_data: 'admin_add_admin' },
                    { text: '📋 Список админов', callback_data: 'admin_list_admins' }
                ],
                [{ text: '⬅️ Назад в админ меню', callback_data: 'admin_menu' }]
            ]
        };

        const text = '👥 Управление администраторами\n\nВыберите действие:';

        try {
            if (messageId) {
                await this.bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: keyboard
                });
            } else {
                await this.bot.sendMessage(chatId, text, {
                    reply_markup: keyboard
                });
            }
            console.log('✅ Меню управления админами отправлено');
        } catch (error) {
            console.error('❌ Ошибка показа меню админов:', error);
            // Fallback - отправляем новое сообщение
            this.bot.sendMessage(chatId, text, {
                reply_markup: keyboard
            });
        }
    }
    // В файле handler/adminHandler.js замените метод showAdminsList на этот:

    async showAdminsList(chatId, messageId) {
        try {
            const adminConfig = require('../config/adminConfig');
            const adminsList = adminConfig.getAdminsList();

            let text = '👥 Список администраторов:\n\n';

            adminsList.forEach((admin, index) => {
                const status = admin.isSuperAdmin ? '👑 Супер-админ' : '👤 Админ';
                text += `${index + 1}. ${status}\n`;
                text += `   🆔 ID: ${admin.id}\n\n`; // Убираем backticks для избежания проблем
            });

            const keyboard = {
                inline_keyboard: []
            };

            // Добавляем кнопки удаления только для обычных админов
            adminsList.forEach(admin => {
                if (!admin.isSuperAdmin) {
                    keyboard.inline_keyboard.push([{
                        text: `🗑 Удалить ${admin.id}`,
                        callback_data: `admin_remove_admin_${admin.id}`
                    }]);
                }
            });

            keyboard.inline_keyboard.push([
                { text: '⬅️ Назад', callback_data: 'admin_admins_management' }
            ]);

            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                // Убираем parse_mode для избежания ошибок
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Show admins list error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке списка админов');
        }
    }

    // В файле handler/adminHandler.js замените метод startAddAdmin на этот:

    async startAddAdmin(chatId) {
        console.log('🔧 Запуск добавления админа для пользователя:', chatId);

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'adding_admin_id', {});
        }

        // ИСПРАВЛЕННЫЙ ТЕКСТ БЕЗ ПРОБЛЕМНЫХ СИМВОЛОВ
        const text = `➕ Добавление нового администратора

Введите Telegram ID пользователя, которого хотите сделать администратором:

Как узнать ID:
• Попросите пользователя написать боту @userinfobot
• Или используйте @getmyid_bot

Введите только цифры ID:`;

        this.bot.sendMessage(chatId, text, {
            // Убираем parse_mode чтобы избежать ошибок с Markdown
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬅️ Назад', callback_data: 'admin_admins_management' }]
                ]
            }
        }).then(() => {
            console.log('✅ Сообщение о добавлении админа отправлено');
        }).catch(error => {
            console.error('❌ Ошибка отправки сообщения:', error);
            this.bot.sendMessage(chatId, 'Введите Telegram ID нового администратора:');
        });
    }

    async confirmRemoveAdmin(chatId, messageId, adminId) {
        const adminConfig = require('../config/adminConfig');

        if (adminConfig.isSuperAdmin(parseInt(adminId))) {
            return this.bot.editMessageText('❌ Нельзя удалить супер-администратора', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [[
                        { text: '⬅️ Назад', callback_data: 'admin_list_admins' }
                    ]]
                }
            });
        }

        const text = `🗑 *Удаление администратора*\n\n` +
            `🆔 *ID админа:* \`${adminId}\`\n\n` +
            `⚠️ Вы уверены, что хотите удалить этого администратора?\n\n` +
            `После удаления у пользователя не будет доступа к админ-панели.`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Да, удалить', callback_data: `admin_confirm_remove_${adminId}` },
                    { text: '❌ Отмена', callback_data: 'admin_list_admins' }
                ]
            ]
        };

        this.bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async executeRemoveAdmin(chatId, messageId, adminId) {
        try {
            const adminConfig = require('../config/adminConfig');
            const result = adminConfig.removeAdmin(parseInt(adminId), chatId);

            if (result.success) {
                this.bot.editMessageText(`✅ ${result.message}\n\n🆔 Удаленный админ: \`${adminId}\``, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                });

                // Уведомляем удаленного админа
                try {
                    await this.bot.sendMessage(parseInt(adminId),
                        '⚠️ *Внимание!*\n\nВы больше не являетесь администратором бота.\n\nДоступ к админ-панели отозван.',
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    console.log('Не удалось уведомить удаленного админа:', error.message);
                }

                setTimeout(() => this.showAdminMenu(chatId), 2000);
            } else {
                this.bot.editMessageText(`❌ Ошибка: ${result.error}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ Назад', callback_data: 'admin_list_admins' }
                        ]]
                    }
                });
            }
        } catch (error) {
            console.error('Execute remove admin error:', error);
            this.bot.sendMessage(chatId, '❌ Произошла ошибка при удалении админа');
        }
    }
}

module.exports = AdminHandler;