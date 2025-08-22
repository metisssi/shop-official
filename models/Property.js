const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
    fileId: { type: String, required: true },
    fileName: String,
    fileSize: Number,
    isMain: { type: Boolean, default: false },
    uploadedBy: Number,
    uploadedAt: { type: Date, default: Date.now }
});

const propertySchema = new mongoose.Schema({
    categoryId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Category', 
        required: true 
    },
    name: { 
        type: String, 
        required: true, 
        trim: true 
    },
    description: { 
        type: String, 
        trim: true,
        default: ''
    },
    // Основная цена в кронах
    priceInCZK: { 
        type: Number, 
        required: true,
        min: 0 
    },
    // Валюта всегда CZK
    currency: { 
        type: String, 
        enum: ['CZK'], 
        default: 'CZK' 
    },
    // Для совместимости со старыми записями
    price: { 
        type: Number, 
        min: 0 
    },
    specifications: {
        area: Number,
        rooms: Number,
        floor: Number,
        totalFloors: Number,
        address: String
    },
    isAvailable: { 
        type: Boolean, 
        default: true 
    },
    order: { 
        type: Number, 
        default: 0 
    },
    photos: [photoSchema]
}, { timestamps: true });

// Виртуальное поле для подсчета фотографий
propertySchema.virtual('photosCount').get(function() {
    return this.photos ? this.photos.length : 0;
});

// Виртуальное поле для получения главной фотографии
propertySchema.virtual('mainPhoto').get(function() {
    if (!this.photos || this.photos.length === 0) return null;
    return this.photos.find(photo => photo.isMain) || this.photos[0];
});

// Виртуальное поле для получения цены в кронах (приоритет priceInCZK)
propertySchema.virtual('displayPrice').get(function() {
    if (this.priceInCZK) {
        return this.priceInCZK;
    } else if (this.price) {
        // Конвертируем старые цены из рублей в кроны (примерный курс 1 RUB = 0.4 CZK)
        return Math.round(this.price * 0.4);
    }
    return 0;
});

// Виртуальное поле для форматированной цены
propertySchema.virtual('formattedPrice').get(function() {
    const price = this.displayPrice;
    return `${new Intl.NumberFormat('cs-CZ').format(price)} Kč`;
});

// Методы для работы с фотографиями
propertySchema.methods.addPhoto = function(photoData) {
    this.photos.push(photoData);
    return this.save();
};

propertySchema.methods.removePhoto = function(photoIndex) {
    if (photoIndex >= 0 && photoIndex < this.photos.length) {
        this.photos.splice(photoIndex, 1);
        // Если удалили главную фотографию, назначаем первую оставшуюся
        if (this.photos.length > 0 && !this.photos.find(p => p.isMain)) {
            this.photos[0].isMain = true;
        }
    }
    return this.save();
};

propertySchema.methods.setMainPhoto = function(photoIndex) {
    if (photoIndex >= 0 && photoIndex < this.photos.length) {
        // Убираем флаг isMain у всех фотографий
        this.photos.forEach(photo => photo.isMain = false);
        // Устанавливаем главную фотографию
        this.photos[photoIndex].isMain = true;
    }
    return this.save();
};

// Middleware для обеспечения совместимости при сохранении
propertySchema.pre('save', function(next) {
    // Если указана только старая цена в рублях, конвертируем в кроны
    if (!this.priceInCZK && this.price) {
        this.priceInCZK = Math.round(this.price * 0.4);
    }
    
    // Устанавливаем валюту по умолчанию
    if (!this.currency) {
        this.currency = 'CZK';
    }
    
    next();
});

// Статические методы
propertySchema.statics.findByPriceRange = function(minPrice, maxPrice) {
    return this.find({
        priceInCZK: { $gte: minPrice, $lte: maxPrice },
        isAvailable: true
    }).populate('categoryId');
};

propertySchema.statics.findExpensive = function(limit = 10) {
    return this.find({ isAvailable: true })
        .sort({ priceInCZK: -1 })
        .limit(limit)
        .populate('categoryId');
};

propertySchema.statics.findAffordable = function(maxPrice = 2000000) {
    return this.find({
        priceInCZK: { $lte: maxPrice },
        isAvailable: true
    }).populate('categoryId');
};

// Включаем виртуальные поля в JSON
propertySchema.set('toJSON', { virtuals: true });
propertySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Property', propertySchema);