const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    customerName: { type: String, default: 'Pelanggan TransGadget' },
    customerPhone: { type: String },
    address: { type: String },
    courier: { type: String },
    paymentMethod: { type: String },
    customer: {
        name: String,
        phone: String,
        whatsapp: String,
        city: String,
        district: String,
        subdistrict: String,
        postal: String,
        address: String,
        mapsUrl: String,
        courier: String,
        payment: String
    },
    items: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            name: String,
            price: Number,
            quantity: Number
        }
    ],
    subtotal: { type: Number },
    ongkir: { type: Number },
    totalAmount: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['Belum Diproses', 'Diproses oleh Admin', 'Selesai'], 
        default: 'Belum Diproses' 
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);