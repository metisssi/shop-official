const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
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

module.exports = mongoose.model('Property', propertySchema);