const mongoose = require('mongoose');
const config = require('./config/config');
const Category = require('./models/Category');
const Property = require('./models/Property');
const Order = require('./models/Order');
const User = require('./models/User');


class Database {
    constructor() {
        this.connect();
    }

    async connect() {
        try {
            await mongoose.connect(config.MONGODB_URI);
            console.log('✅ Подключение к MongoDB успешно');
            await this.seedData();
        } catch (error) {
            console.error('❌ Ошибка подключения к MongoDB:', error);
            process.exit(1);
        }
    }

    async seedData() {
        try {
            // Проверяем, есть ли уже данные
            const categoriesCount = await Category.countDocuments();
            if (categoriesCount > 0) return;

            // Создаем категории
            const categories = await Category.insertMany([
                { name: 'Дома', description: 'Частные дома и коттеджи', order: 1 },
                { name: 'Квартиры', description: 'Квартиры различной планировки', order: 2 },
                { name: 'Пентхаусы', description: 'Элитные пентхаусы с панорамным видом', order: 3 }
            ]);

            // Создаем недвижимость
            const properties = [
                {
                    categoryId: categories[0]._id,
                    name: 'Коттедж "Сосновый"',
                    description: 'Уютный коттедж в сосновом бору площадью 200 кв.м',
                    price: 15000000,
                    specifications: {
                        area: 200,
                        rooms: 4,
                        address: 'Московская область, пос. Сосновка'
                    },
                    order: 1
                },
                {
                    categoryId: categories[0]._id,
                    name: 'Дом "Семейный"',
                    description: 'Просторный дом для большой семьи площадью 300 кв.м',
                    price: 12000000,
                    specifications: {
                        area: 300,
                        rooms: 6,
                        address: 'Подмосковье, д. Семейкино'
                    },
                    order: 2
                },
                {
                    categoryId: categories[1]._id,
                    name: '2-комн. "Комфорт"',
                    description: 'Современная 2-комнатная квартира в новостройке',
                    price: 8000000,
                    specifications: {
                        area: 65,
                        rooms: 2,
                        floor: 10,
                        totalFloors: 25,
                        address: 'Москва, ул. Примерная, д. 1'
                    },
                    order: 1
                },
                {
                    categoryId: categories[1]._id,
                    name: '3-комн. "Премиум"',
                    description: 'Просторная квартира в центре с ремонтом',
                    price: 12000000,
                    specifications: {
                        area: 90,
                        rooms: 3,
                        floor: 15,
                        totalFloors: 30,
                        address: 'Москва, Центральный р-н'
                    },
                    order: 2
                },
                {
                    categoryId: categories[2]._id,
                    name: 'Пентхаус "Элит"',
                    description: 'Роскошный пентхаус с террасой и панорамным видом',
                    price: 25000000,
                    specifications: {
                        area: 250,
                        rooms: 5,
                        floor: 30,
                        totalFloors: 30,
                        address: 'Москва, Деловой центр'
                    },
                    order: 1
                }
            ];

            await Property.insertMany(properties);
            console.log('✅ Тестовые данные добавлены');
        } catch (error) {
            console.error('❌ Ошибка при добавлении тестовых данных:', error);
        }
    }

    // Методы для работы с категориями
    async getCategories() {
        return await Category.find({ isActive: true }).sort({ order: 1, name: 1 });
    }

    async getCategoryById(categoryId) {
        return await Category.findById(categoryId);
    }

    // Методы для работы с недвижимостью
    async getPropertiesByCategory(categoryId) {
        return await Property.find({ 
            categoryId: categoryId, 
            isAvailable: true 
        })
        .populate('categoryId')
        .sort({ order: 1, name: 1 });
    }

    async getPropertyById(propertyId) {
        return await Property.findById(propertyId).populate('categoryId');
    }

    async getAllProperties() {
        return await Property.find({ isAvailable: true })
            .populate('categoryId')
            .sort({ order: 1, name: 1 });
    }

    // Методы для работы с пользователями
    async createOrUpdateUser(userData) {
        const { userId, username, firstName, lastName } = userData;
        
        return await User.findOneAndUpdate(
            { userId: userId },
            {
                username,
                firstName,
                lastName,
                lastActivity: new Date()
            },
            { 
                upsert: true, 
                new: true 
            }
        );
    }

    async getUserById(userId) {
        return await User.findOne({ userId: userId });
    }

    // Методы для работы с заказами
    async createOrder(orderData) {
        const order = new Order(orderData);
        const savedOrder = await order.save();

        // Обновляем статистику пользователя
        await User.findOneAndUpdate(
            { userId: orderData.userId },
            {
                $inc: { 
                    totalOrders: 1,
                    totalSpent: orderData.totalAmount 
                }
            }
        );

        return savedOrder;
    }

    async getOrderById(orderId) {
        return await Order.findById(orderId)
            .populate('items.propertyId');
    }

    async getOrdersByUser(userId) {
        return await Order.find({ userId: userId })
            .populate('items.propertyId')
            .sort({ createdAt: -1 });
    }

    async getAllOrders(status = null) {
        const filter = status ? { status } : {};
        return await Order.find(filter)
            .populate('items.propertyId')
            .sort({ createdAt: -1 });
    }

    async updateOrderStatus(orderId, status, notes = null) {
        const updateData = { status };
        if (notes) updateData.notes = notes;
        
        return await Order.findByIdAndUpdate(orderId, updateData, { new: true });
    }
}

module.exports = Database;