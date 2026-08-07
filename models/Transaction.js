const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    totalAmount: { type: Number, required: true },
    subtotal: { type: Number },
    ongkir: { type: Number },
    completedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);