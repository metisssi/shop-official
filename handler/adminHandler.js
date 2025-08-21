const Category = require('../models/Category');
const Property = require('../models/Property');
const Operator = require('../models/Operator');

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

        // 🔥 УБРАНО: Обработка фотографий (теперь в app.js)
    }

    // 🔥 ИСПРАВЛЕННЫЙ МЕТОД: Обработка загрузки фотографий
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

            // Получаем информацию о фотографии (берем самое большое разрешение)
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

            // Обновляем информацию о товаре для получения актуального количества фотографий
            const updatedProduct = await Property.findById(productId);

            this.bot.sendMessage(chatId, 
                `✅ Фотография добавлена к товару "*${product.name}*"!\n\n📸 Всего фотографий: ${updatedProduct.photos.length}`,
                { parse_mode: 'Markdown' }
            );

            // Показываем меню управления фотографиями
            setTimeout(() => {
                this.manageProductPhotos(chatId, null, productId);
            }, 1000);

        } catch (error) {
            console.error('Photo upload error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при загрузке фотографии');
        }
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
                    { text: '👥 Управление операторами', callback_data: 'admin_operators' },
                    { text: '📋 Заказы', callback_data: 'admin_orders' }
                ],
                [
                    { text: '📊 Статистика', callback_data: 'admin_stats' }
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
                case 'admin_operators':
                    await this.showOperatorsMenu(chatId, messageId);
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
                case 'operator_add':
                    await this.startAddOperator(chatId);
                    break;
                case 'operator_list':
                    await this.showOperatorsList(chatId, messageId);
                    break;
                    
                default:
                    // Обработка динамических callback'ов
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
                    } else if (data.startsWith('edit_prod_desc_')) {
                        const productId = data.replace('edit_prod_desc_', '');
                        await this.startEditProductDescription(chatId, productId);
                    } else if (data.startsWith('edit_prod_price_')) {
                        const productId = data.replace('edit_prod_price_', '');
                        await this.startEditProductPrice(chatId, productId);
                    } else if (data.startsWith('manage_prod_photos_')) {
                        const productId = data.replace('manage_prod_photos_', '');
                        await this.manageProductPhotos(chatId, messageId, productId);
                    } else if (data.startsWith('add_prod_photo_')) {
                        const productId = data.replace('add_prod_photo_', '');
                        await this.startAddProductPhoto(chatId, productId);
                    } else if (data.startsWith('view_prod_photos_')) {
                        const productId = data.replace('view_prod_photos_', '');
                        await this.viewProductPhotos(chatId, messageId, productId);
                    } else if (data.startsWith('set_main_photo_')) {
                        const parts = data.replace('set_main_photo_', '').split('_');
                        const productId = parts[0];
                        const photoIndex = parseInt(parts[1]);
                        await this.setMainPhoto(chatId, messageId, productId, photoIndex);
                    } else if (data.startsWith('delete_photo_')) {
                        const parts = data.replace('delete_photo_', '').split('_');
                        const productId = parts[0];
                        const photoIndex = parseInt(parts[1]);
                        await this.deletePhoto(chatId, messageId, productId, photoIndex);
                    } else if (data.startsWith('toggle_prod_')) {
                        const productId = data.replace('toggle_prod_', '');
                        await this.toggleProductStatus(chatId, messageId, productId);
                    } else if (data.startsWith('confirm_delete_prod_')) {
                        const productId = data.replace('confirm_delete_prod_', '');
                        await this.confirmDeleteProduct(chatId, messageId, productId);
                    } 
                    // === ОПЕРАТОРЫ ===
                    else if (data.startsWith('edit_operator_')) {
                        const operatorId = data.replace('edit_operator_', '');
                        await this.editOperator(chatId, messageId, operatorId);
                    } else if (data.startsWith('delete_operator_')) {
                        const operatorId = data.replace('delete_operator_', '');
                        await this.deleteOperator(chatId, messageId, operatorId);
                    } else if (data.startsWith('edit_op_name_')) {
                        const operatorId = data.replace('edit_op_name_', '');
                        await this.startEditOperatorName(chatId, operatorId);
                    } else if (data.startsWith('edit_op_username_')) {
                        const operatorId = data.replace('edit_op_username_', '');
                        await this.startEditOperatorUsername(chatId, operatorId);
                    } else if (data.startsWith('toggle_op_')) {
                        const operatorId = data.replace('toggle_op_', '');
                        await this.toggleOperatorStatus(chatId, messageId, operatorId);
                    } else if (data.startsWith('confirm_delete_op_')) {
                        const operatorId = data.replace('confirm_delete_op_', '');
                        await this.confirmDeleteOperator(chatId, messageId, operatorId);
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
                const photoIcon = product.photosCount > 0 ? `📸${product.photosCount}` : '📷';
                
                text += `${index + 1}. ${status} ${photoIcon} *${product.name}*\n`;
                text += `   📂 Категория: ${categoryName}\n`;
                text += `   💰 Цена: ${product.priceInCZK ? product.priceInCZK.toLocaleString('cs-CZ') + ' Kč' : 'не указана'}\n\n`;

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
            const price = product.priceInCZK ? `${product.priceInCZK.toLocaleString('cs-CZ')} Kč` : 'не указана';
            const photosInfo = product.photosCount > 0 ? `📸 ${product.photosCount} фото` : '📷 Нет фото';
            
            const text = `✏️ *Редактирование товара*\n\n` +
                        `📝 *Название:* ${product.name}\n` +
                        `📂 *Категория:* ${categoryName}\n` +
                        `💰 *Цена:* ${price}\n` +
                        `📷 *Фотографии:* ${photosInfo}\n` +
                        `📄 *Описание:* ${product.description || 'Не указано'}\n` +
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

    // 🔥 ИСПРАВЛЕННЫЙ МЕТОД: Управление фотографиями товара
    async manageProductPhotos(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            let text = `📷 *Управление фотографиями*\n\n`;
            text += `🏠 *Товар:* ${product.name}\n`;
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

            // Если messageId передан, редактируем существующее сообщение
            if (messageId) {
                this.bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                // Если messageId не передан, отправляем новое сообщение
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

    // 🔥 ИСПРАВЛЕННЫЙ МЕТОД: Начало добавления фотографии
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

            this.bot.sendMessage(chatId, 
                `📷 *Добавление фотографии*\n\n🏠 *Товар:* ${product.name}\n\n📸 Отправьте фотографию (просто прикрепите изображение к сообщению):`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Start add product photo error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при добавлении фотографии');
        }
    }

    // 🔥 НОВЫЙ МЕТОД: Просмотр фотографий товара
    async viewProductPhotos(chatId, messageId, productId) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            if (product.photosCount === 0) {
                return this.bot.editMessageText(
                    `📷 *Фотографии товара*\n\n🏠 *Товар:* ${product.name}\n\n❌ У этого товара нет фотографий`,
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

            let text = `📷 *Фотографии товара*\n\n🏠 *Товар:* ${product.name}\n📸 *Количество:* ${product.photosCount}\n\n`;

            const keyboard = [];

            product.photos.forEach((photo, index) => {
                const isMain = photo.isMain ? '⭐ ' : '';
                const photoRow = [];
                
                photoRow.push({
                    text: `${isMain}📸 ${index + 1}`,
                    callback_data: `current_page` // Заглушка
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

            // Отправляем первую фотографию с клавиатурой
            if (product.mainPhoto) {
                await this.bot.sendPhoto(chatId, product.mainPhoto.fileId, {
                    caption: text,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                });
                
                // Удаляем старое сообщение
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

    // 🔥 НОВЫЙ МЕТОД: Установить главную фотографию
    async setMainPhoto(chatId, messageId, productId, photoIndex) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            await product.setMainPhoto(photoIndex);

            this.bot.sendMessage(chatId, '✅ Главная фотография установлена!');
            
            // Обновляем список фотографий
            setTimeout(() => this.viewProductPhotos(chatId, messageId, productId), 1000);

        } catch (error) {
            console.error('Set main photo error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при установке главной фотографии');
        }
    }

    // 🔥 НОВЫЙ МЕТОД: Удалить фотографию
    async deletePhoto(chatId, messageId, productId, photoIndex) {
        try {
            const product = await Property.findById(productId);
            if (!product) {
                return this.bot.sendMessage(chatId, '❌ Товар не найден');
            }

            await product.removePhoto(photoIndex);

            this.bot.sendMessage(chatId, '✅ Фотография удалена!');
            
            // Обновляем список фотографий
            setTimeout(() => this.viewProductPhotos(chatId, messageId, productId), 1000);

        } catch (error) {
            console.error('Delete photo error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении фотографии');
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

    // 🔥 НОВЫЙ МЕТОД: Начало редактирования описания товара
    async startEditProductDescription(chatId, productId) {
        const product = await Property.findById(productId);
        if (!product) {
            return this.bot.sendMessage(chatId, '❌ Товар не найден');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_product_description', { productId });
        }
        
        this.bot.sendMessage(chatId, 
            `📝 *Редактирование описания товара*\n\nТекущее описание: *${product.description || 'Отсутствует'}*\n\nВведите новое описание:`,
            { parse_mode: 'Markdown' }
        );
    }

    // 🔥 НОВЫЙ МЕТОД: Начало редактирования цены товара
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

            const price = product.priceInCZK ? `${product.priceInCZK.toLocaleString('cs-CZ')} Kč` : 'не указана';
            const photosInfo = product.photosCount > 0 ? `\n📸 *Фотографий:* ${product.photosCount}` : '';
            
            const text = `🗑 *Удаление товара*\n\n` +
                        `📝 *Товар:* ${product.name}\n` +
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

    // === УПРАВЛЕНИЕ ОПЕРАТОРАМИ ===

    // Меню управления операторами
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

    // Список всех операторов
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
                
                text += `${index + 1}. ${status} *${operator.name}*\n`;
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

    // Начало добавления нового оператора
    async startAddOperator(chatId) {
        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'adding_operator_name', {});
        }

        this.bot.sendMessage(chatId, '➕ *Добавление нового оператора*\n\nВведите имя оператора:', {
            parse_mode: 'Markdown'
        });
    }

    // Редактирование оператора
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
            
            const text = `✏️ *Редактирование оператора*\n\n` +
                        `👤 *Имя:* ${operator.name}\n` +
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

    // Удаление оператора
    async deleteOperator(chatId, messageId, operatorId) {
        try {
            const operator = await Operator.findById(operatorId);
            if (!operator) {
                return this.bot.sendMessage(chatId, '❌ Оператор не найден');
            }

            const text = `🗑 *Удаление оператора*\n\n` +
                        `👤 *Оператор:* ${operator.name}\n` +
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

    // Начало редактирования имени оператора
    async startEditOperatorName(chatId, operatorId) {
        const operator = await Operator.findById(operatorId);
        if (!operator) {
            return this.bot.sendMessage(chatId, '❌ Оператор не найден');
        }

        if (global.adminUtils) {
            global.adminUtils.createSession(chatId, 'editing_operator_name', { operatorId });
        }
        
        this.bot.sendMessage(chatId, 
            `✏️ *Редактирование имени оператора*\n\nТекущее имя: *${operator.name}*\n\nВведите новое имя:`,
            { parse_mode: 'Markdown' }
        );
    }

    // Начало редактирования username оператора
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

    // Переключение статуса оператора
    async toggleOperatorStatus(chatId, messageId, operatorId) {
        try {
            const operator = await Operator.findById(operatorId);
            if (!operator) {
                return this.bot.sendMessage(chatId, '❌ Оператор не найден');
            }

            operator.isActive = !operator.isActive;
            await operator.save();

            const status = operator.isActive ? 'активирован' : 'деактивирован';
            this.bot.sendMessage(chatId, `✅ Оператор "${operator.name}" ${status}!`);
            
            setTimeout(() => this.showAdminMenu(chatId), 1000);
        } catch (error) {
            console.error('Toggle operator status error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при изменении статуса оператора');
        }
    }

    // Подтверждение удаления оператора
    async confirmDeleteOperator(chatId, messageId, operatorId) {
        try {
            const operator = await Operator.findById(operatorId);
            if (!operator) {
                return this.bot.sendMessage(chatId, '❌ Оператор не найден');
            }

            await Operator.findByIdAndDelete(operatorId);

            this.bot.editMessageText(
                `✅ Оператор "${operator.name}" удален!`,
                { chat_id: chatId, message_id: messageId }
            );
            
            setTimeout(() => this.showAdminMenu(chatId), 2000);
        } catch (error) {
            console.error('Confirm delete operator error:', error);
            this.bot.sendMessage(chatId, '❌ Ошибка при удалении оператора');
        }
    }
}

module.exports = AdminHandler;