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
    price: { 
        type: Number, 
        required: true, 
        min: 0 
    },
    priceInCZK: { 
        type: Number, 
        min: 0 
    },
    currency: { 
        type: String, 
        enum: ['RUB', 'CZK'], 
        default: 'RUB' 
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

// Включаем виртуальные поля в JSON
propertySchema.set('toJSON', { virtuals: true });
propertySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Property', propertySchema);