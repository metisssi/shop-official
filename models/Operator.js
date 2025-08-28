// В файле models/Operator.js ЗАМЕНИТЬ полностью на это:

const mongoose = require('mongoose');

const operatorSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        trim: true 
    },
    username: { 
        type: String, 
        required: true, 
        trim: true,
        unique: true 
    },
    telegramId: { 
        type: Number, 
        required: true,  // Теперь обязательное поле
        unique: true
    },
    description: { 
        type: String, 
        trim: true,
        default: ''
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    specialization: {
        type: String,
        enum: ['general', 'premium', 'commercial', 'residential'],
        default: 'general'
    },
    order: { 
        type: Number, 
        default: 0 
    }
}, { timestamps: true });

// Виртуальное поле для форматирования имени пользователя
operatorSchema.virtual('formattedUsername').get(function() {
    return this.username.startsWith('@') ? this.username : `@${this.username}`;
});

// Виртуальное поле для отображения в админке
operatorSchema.virtual('displayInfo').get(function() {
    const status = this.isActive ? '✅' : '❌';
    return `${status} ${this.name} (${this.formattedUsername}) - ID: ${this.telegramId}`;
});

// Методы модели
operatorSchema.methods.getContactUrl = function() {
    const username = this.username.replace('@', '');
    return `https://t.me/${username}`;
};

// Статические методы
operatorSchema.statics.getActiveOperators = function() {
    return this.find({ 
        isActive: true,
        telegramId: { $exists: true, $ne: null }
    }).sort({ order: 1, username: 1 });
};

operatorSchema.statics.findByTelegramId = function(telegramId) {
    return this.findOne({ 
        telegramId: telegramId,
        isActive: true
    });
};

operatorSchema.statics.findByUsername = function(username) {
    const cleanUsername = username.replace('@', '');
    return this.findOne({ 
        username: cleanUsername,
        isActive: true
    });
};

// Middleware для автоматической очистки username
operatorSchema.pre('save', function(next) {
    if (this.username && this.username.startsWith('@')) {
        this.username = this.username.substring(1);
    }
    next();
});

module.exports = mongoose.model('Operator', operatorSchema);