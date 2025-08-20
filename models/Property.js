const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    
    // Цены в разных валютах
    price: { type: Number, required: true, min: 0 }, // Цена в рублях
    priceInCZK: { type: Number, min: 0 }, // Цена в чешских кронах
    currency: { 
        type: String, 
        enum: ['RUB', 'CZK'], 
        default: 'RUB' 
    }, // Основная валюта для отображения
    
    specifications: {
        area: Number,
        rooms: Number,
        floor: Number,
        totalFloors: Number,
        address: String
    },
    isAvailable: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
}, { timestamps: true });

// Виртуальное поле для получения цены в нужной валюте
propertySchema.virtual('formattedPrice').get(function() {
    if (this.currency === 'CZK' && this.priceInCZK) {
        return `${this.priceInCZK.toLocaleString('cs-CZ')} Kč`;
    }
    return `${this.price.toLocaleString('ru-RU')} ₽`;
});

// Виртуальное поле для получения цены в обеих валютах
propertySchema.virtual('bothPrices').get(function() {
    const rubPrice = `${this.price.toLocaleString('ru-RU')} ₽`;
    const czkPrice = this.priceInCZK ? `${this.priceInCZK.toLocaleString('cs-CZ')} Kč` : 'не указана';
    return `${rubPrice} / ${czkPrice}`;
});

// Метод для получения цены в определенной валюте
propertySchema.methods.getPriceInCurrency = function(currency) {
    switch (currency) {
        case 'CZK':
            return {
                value: this.priceInCZK || Math.round(this.price * 0.4),
                formatted: `${(this.priceInCZK || Math.round(this.price * 0.4)).toLocaleString('cs-CZ')} Kč`
            };
        case 'RUB':
        default:
            return {
                value: this.price,
                formatted: `${this.price.toLocaleString('ru-RU')} ₽`
            };
    }
};

// Middleware для автоматического расчета цены во второй валюте
propertySchema.pre('save', function(next) {
    // Если установлена цена в рублях, но не в кронах
    if (this.price && !this.priceInCZK) {
        this.priceInCZK = Math.round(this.price * 0.4); // Примерный курс
    }
    
    // Если установлена цена в кронах, но не в рублях
    if (this.priceInCZK && !this.price) {
        this.price = Math.round(this.priceInCZK * 2.5); // Примерный курс
    }
    
    next();
});

module.exports = mongoose.model('Property', propertySchema);