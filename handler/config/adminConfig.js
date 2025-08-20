module.exports = {
    // ID администраторов Telegram (замените на свои)
    ADMIN_IDS: [
        123456789,  // Замените на свой Telegram ID
        987654321   // ID второго администратора (опционально)
    ],
    
    // Настройки админ панели
    ADMIN_SETTINGS: {
        // Максимальное количество символов в описании
        MAX_DESCRIPTION_LENGTH: 500,
        
        // Максимальная цена объекта недвижимости
        MAX_PROPERTY_PRICE: 100000000, // 100 млн
        
        // Минимальная цена объекта недвижимости
        MIN_PROPERTY_PRICE: 1000, // 1 тысяча
        
        // Максимальное количество объектов на страницу
        ITEMS_PER_PAGE: 10,
        
        // Таймаут для ожидания ответа от админа (в минутах)
        INPUT_TIMEOUT: 5
    },
    
    // Сообщения для администраторов
    ADMIN_MESSAGES: {
        NO_ACCESS: '❌ У вас нет прав администратора',
        ERROR_GENERAL: '❌ Произошла ошибка. Попробуйте еще раз.',
        TIMEOUT: '⏰ Время ожидания истекло. Операция отменена.',
        SUCCESS_CREATED: '✅ Успешно создано!',
        SUCCESS_UPDATED: '✅ Успешно обновлено!',
        SUCCESS_DELETED: '✅ Успешно удалено!',
        CONFIRM_DELETE: '⚠️ Вы уверены, что хотите удалить это?',
        OPERATION_CANCELLED: '❌ Операция отменена'
    },
    
    // Эмодзи для интерфейса
    EMOJIS: {
        CATEGORY: '📂',
        PROPERTY: '🏠',
        ADD: '➕',
        EDIT: '✏️',
        DELETE: '🗑',
        LIST: '📋',
        BACK: '⬅️',
        CONFIRM: '✅',
        CANCEL: '❌',
        ACTIVE: '✅',
        INACTIVE: '❌',
        PRICE: '💰',
        LOCATION: '📍',
        STATS: '📊',
        ORDERS: '📋',
        SETTINGS: '⚙️',
        ADMIN: '👑'
    }
};

// Функция для проверки, является ли пользователь администратором
function isAdmin(userId) {
    return module.exports.ADMIN_IDS.includes(userId);
}

// Функция для получения списка администраторов
function getAdminIds() {
    return module.exports.ADMIN_IDS;
}

// Экспортируем дополнительные функции
module.exports.isAdmin = isAdmin;
module.exports.getAdminIds = getAdminIds;