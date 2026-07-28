const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Ganti URL di bawah dengan Connection String dari MongoDB Atlas Anda
        // Contoh: const conn = await mongoose.connect('mongodb+srv://username:password@cluster.mongodb.net/transgadget?retryWrites=true&w=majority');
        const conn = await mongoose.connect('mongodb://127.0.0.1:27017/transgadget');
        console.log(`MongoDB Terhubung: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;