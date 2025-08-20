const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    lastName: String,
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);