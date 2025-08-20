// adminConfig.js
module.exports = {
    // ЗАМЕНИТЕ НА СВОЙ TELEGRAM ID!
    ADMIN_IDS: [
        7827060466,  // Ваш ID (такой же как в config.js для операторов)
        // 123456789   // Добавьте еще админов если нужно
    ]
};

// Функции для работы с админами
function isAdmin(userId) {
    return module.exports.ADMIN_IDS.includes(userId);
}

function getAdminIds() {
    return module.exports.ADMIN_IDS;
}

module.exports.isAdmin = isAdmin;
module.exports.getAdminIds = getAdminIds;