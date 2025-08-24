// ========================================
// ШАГ 1: ПОЛНОСТЬЮ ЗАМЕНИТЬ config/adminConfig.js
// ========================================
// Файл: config/adminConfig.js
// УДАЛИТЬ ВСЁ СОДЕРЖИМОЕ и вставить это:

const fs = require('fs');
const path = require('path');

let ADMIN_IDS = [
    7827060466,  // Ваш основной ID (super admin)
    // Другие админы будут добавляться динамически
];

// Путь к файлу с админами
const ADMINS_FILE = path.join(__dirname, 'admins.json');

// Загружаем админов из файла при запуске
function loadAdmins() {
    try {
        if (fs.existsSync(ADMINS_FILE)) {
            const data = fs.readFileSync(ADMINS_FILE, 'utf8');
            const admins = JSON.parse(data);
            ADMIN_IDS = admins.adminIds || [7827060466];
            console.log('✅ Админы загружены из файла:', ADMIN_IDS);
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки админов:', error);
        ADMIN_IDS = [7827060466]; // Fallback на основного админа
    }
}

// Сохраняем админов в файл
function saveAdmins() {
    try {
        const data = {
            adminIds: ADMIN_IDS,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(ADMINS_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log('✅ Админы сохранены в файл');
        return true;
    } catch (error) {
        console.error('❌ Ошибка сохранения админов:', error);
        return false;
    }
}

// Функции для работы с админами
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

function isSuperAdmin(userId) {
    return userId === 7827060466; // Только основной админ
}

function getAdminIds() {
    return [...ADMIN_IDS];
}

function addAdmin(userId, addedBy) {
    if (!isSuperAdmin(addedBy)) {
        return { success: false, error: 'Только супер-админ может добавлять админов' };
    }
    
    if (ADMIN_IDS.includes(userId)) {
        return { success: false, error: 'Пользователь уже является админом' };
    }
    
    ADMIN_IDS.push(userId);
    const saved = saveAdmins();
    
    if (saved) {
        console.log(`✅ Новый админ добавлен: ${userId} (добавил: ${addedBy})`);
        return { success: true, message: 'Админ успешно добавлен' };
    } else {
        // Откатываем изменения если не удалось сохранить
        ADMIN_IDS = ADMIN_IDS.filter(id => id !== userId);
        return { success: false, error: 'Ошибка сохранения' };
    }
}

function removeAdmin(userId, removedBy) {
    if (!isSuperAdmin(removedBy)) {
        return { success: false, error: 'Только супер-админ может удалять админов' };
    }
    
    if (userId === 7827060466) {
        return { success: false, error: 'Нельзя удалить супер-админа' };
    }
    
    if (!ADMIN_IDS.includes(userId)) {
        return { success: false, error: 'Пользователь не является админом' };
    }
    
    ADMIN_IDS = ADMIN_IDS.filter(id => id !== userId);
    const saved = saveAdmins();
    
    if (saved) {
        console.log(`✅ Админ удален: ${userId} (удалил: ${removedBy})`);
        return { success: true, message: 'Админ успешно удален' };
    } else {
        // Откатываем изменения
        ADMIN_IDS.push(userId);
        return { success: false, error: 'Ошибка сохранения' };
    }
}

function getAdminsList() {
    return ADMIN_IDS.map(id => ({
        id,
        isSuperAdmin: id === 7827060466
    }));
}

// Загружаем админов при импорте модуля
loadAdmins();

module.exports = {
    ADMIN_IDS,
    isAdmin,
    isSuperAdmin,
    getAdminIds,
    addAdmin,
    removeAdmin,
    getAdminsList,
    loadAdmins,
    saveAdmins
};