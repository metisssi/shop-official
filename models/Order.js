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
    
    // Новое поле для адреса доставки
    deliveryAddress: { 
        type: String, 
        required: true,
        trim: true 
    },
    
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    paymentMethod: { 
        type: String, 
        enum: ['card', 'cash'], 
        default: 'cash' 
    },
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'], 
        default: 'pending' 
    },
    notes: String
}, { timestamps: true });

// Виртуальное поле для форматирования информации о клиенте
orderSchema.virtual('customerInfo').get(function() {
    let info = '';
    if (this.firstName) {
        info += this.firstName;
        if (this.lastName) info += ` ${this.lastName}`;
    } else if (this.username) {
        info = `@${this.username}`;
    } else {
        info = `ID: ${this.userId}`;
    }
    return info;
});

// Виртуальное поле для форматирования способа оплаты
orderSchema.virtual('paymentMethodText').get(function() {
    return this.paymentMethod === 'card' ? '💳 Оплата на карту' : '💵 Оплата наличными';
});

// Виртуальное поле для форматирования статуса
orderSchema.virtual('statusText').get(function() {
    const statusMap = {
        pending: '⏳ Ожидает обработки',
        confirmed: '✅ Подтверждён',
        in_progress: '🚚 В доставке',
        completed: '✅ Выполнен',
        cancelled: '❌ Отменён'
    };
    return statusMap[this.status] || this.status;
});

// Метод для форматирования заказа для администраторов
orderSchema.methods.formatForAdmins = function() {
    let text = `🔔 *НОВЫЙ ЗАКАЗ #${this._id.toString().slice(-6)}*\n\n`;
    
    // Информация о клиенте
    text += `👤 *Клиент:* ${this.customerInfo}\n`;
    if (this.username) {
        text += `📱 *Username:* @${this.username}\n`;
    }
    text += `🆔 *ID:* ${this.userId}\n\n`;
    
    // Адрес доставки
    text += `📍 *Адрес доставки:*\n${this.deliveryAddress}\n\n`;
    
    // Товары
    text += `🛒 *Товары:*\n`;
    this.items.forEach((item, index) => {
        text += `${index + 1}. *${item.name}*\n`;
        text += `   📦 Количество: ${item.quantity}\n`;
        text += `   💰 Цена: ${item.price.toLocaleString('cs-CZ')} Kč\n`;
        text += `   💵 Сумма: ${item.total.toLocaleString('cs-CZ')} Kč\n\n`;
    });
    
    // Итого
    text += `💳 *Общая сумма: ${this.totalAmount.toLocaleString('cs-CZ')} Kč*\n`;
    text += `💰 *Способ оплаты:* ${this.paymentMethodText}\n`;
    text += `📅 *Дата заказа:* ${this.createdAt.toLocaleString('ru-RU')}\n\n`;
    
    text += `🔔 *Свяжитесь с клиентом для уточнения деталей!*`;
    
    return text;
};

// Включаем виртуальные поля в JSON
orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);