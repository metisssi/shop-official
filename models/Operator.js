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
        unique: true, 
        sparse: true // Позволяет null значения
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
    contactInfo: {
        phone: String,
        email: String,
        workingHours: String
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

// Виртуальное поле для полной информации
operatorSchema.virtual('fullInfo').get(function() {
    const status = this.isActive ? '✅' : '❌';
    const specialization = {
        general: 'Общий',
        premium: 'Премиум',
        commercial: 'Коммерческая',
        residential: 'Жилая'
    };
    
    return `${status} ${this.name} (${this.formattedUsername}) - ${specialization[this.specialization]}`;
});

// Методы модели
operatorSchema.methods.getContactUrl = function() {
    const username = this.username.replace('@', '');
    return `https://t.me/${username}`;
};

// Статические методы
operatorSchema.statics.getActiveOperators = function() {
    return this.find({ isActive: true }).sort({ order: 1, name: 1 });
};

operatorSchema.statics.getOperatorsBySpecialization = function(specialization) {
    return this.find({ 
        isActive: true, 
        specialization: specialization 
    }).sort({ order: 1, name: 1 });
};

module.exports = mongoose.model('Operator', operatorSchema);