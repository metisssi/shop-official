const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    name: String,
    price: Number,
    quantity: { type: Number, required: true, min: 1 },
    total: Number
});

const orderSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    username: String,
    firstName: String,
    lastName: String,
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    paymentMethod: { 
        type: String, 
        enum: ['card', 'cash'], 
        default: 'cash' 
    }, // 🔥 НОВОЕ: Способ оплаты
    status: { type: String, enum: ['new', 'confirmed', 'completed', 'cancelled'], default: 'new' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);iceInCZK) {
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

// 🔥 НОВОЕ: Виртуальное поле для главной фотографии
propertySchema.virtual('mainPhoto').get(function() {
    const mainPhoto = this.photos.find(photo => photo.isMain);
    return mainPhoto || this.photos[0] || null;
});

// 🔥 НОВОЕ: Виртуальное поле для количества фотографий
propertySchema.virtual('photosCount').get(function() {
    return this.photos.length;
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

// 🔥 НОВЫЕ МЕТОДЫ для работы с фотографиями
propertySchema.methods.addPhoto = function(photoData) {
    // Если это первая фотография, делаем её главной
    if (this.photos.length === 0) {
        photoData.isMain = true;
    }
    this.photos.push(photoData);
    return this.save();
};

propertySchema.methods.removePhoto = function(photoIndex) {
    if (photoIndex >= 0 && photoIndex < this.photos.length) {
        const removedPhoto = this.photos[photoIndex];
        this.photos.splice(photoIndex, 1);
        
        // Если удалили главную фотографию, делаем главной первую из оставшихся
        if (removedPhoto.isMain && this.photos.length > 0) {
            this.photos[0].isMain = true;
        }
        
        return this.save();
    }
    return Promise.resolve(this);
};

propertySchema.methods.setMainPhoto = function(photoIndex) {
    if (photoIndex >= 0 && photoIndex < this.photos.length) {
        // Убираем флаг isMain у всех фотографий
        this.photos.forEach(photo => photo.isMain = false);
        // Устанавливаем главной выбранную фотографию
        this.photos[photoIndex].isMain = true;
        return this.save();
    }
    return Promise.resolve(this);
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