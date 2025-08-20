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
    status: { type: String, enum: ['new', 'confirmed', 'completed', 'cancelled'], default: 'new' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);