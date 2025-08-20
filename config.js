const config = {
    // ⚠️ ОБЯЗАТЕЛЬНО ЗАМЕНИ НА СВОЙ ТОКЕН ОТ @BotFather
    BOT_TOKEN: "AAHHzYjcK-ZmPk6Cl3wsOBvF_4GazKbMCxc", // Замени на реальный токен

    // 🗄️ MongoDB connection string
    MONGODB_URI: "mongodb+srv://eli:JjxfiM5wNeLLfMUs@cluster0.zss7lr4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", // Или твой MongoDB Atlas URL

    // 👥 ID операторов для получения заказов
    OPERATORS: {
        "operator1": 7827060466,  // Замени на реальный Telegram ID
          // Добавь столько операторов, сколько нужно
    },

    // 📞 Список операторов для клиентов
    AVAILABLE_OPERATORS: [
        { name: "Анна", username: "@anna_operator" },      // Замени на реальные
        { name: "Михаил", username: "@mikhail_operator" }, // имена и username
        { name: "Елена", username: "@elena_operator" }     // операторов
    ]
};



// JjxfiM5wNeLLfMUs  eli