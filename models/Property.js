const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    name: String,
    price: Number,
    currency: String,
    quantity: { type: Number, required: true, min: 1 },
    total: Number
});

const orderSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    username: String,
    firstName: String,
    lastName: String,
    phone: String,
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    paymentMethod: { 
        type: String, 
        enum: ['card', 'cash'], 
        default: 'cash' 
    },
    status: { 
        type: String, 
        enum: ['new', 'confirmed', 'completed', 'cancelled'], 
        default: 'new' 
    },
    notes: String
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);