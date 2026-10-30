const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    guest_id: { type: String }, // ID unik untuk melacak pelanggan (Guest)
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
    
    // Field untuk mendukung API Biteship (Kurir Instan)
    destinationLatitude: { type: Number },
    destinationLongitude: { type: Number },
    courierCompany: { type: String },
    courierType: { type: String },

    // DITAMBAHKAN: Field untuk menyimpan resi AWB JNE API
    resi_jne: { type: String, default: null },

    status: { 
        type: String, 
        // DITAMBAHKAN: 'Diproses / Dikirim' untuk sinkronisasi pengiriman JNE
        enum: ['Menunggu Pembayaran', 'Lunas', 'Belum Diproses', 'Diproses oleh Admin', 'Diproses / Dikirim', 'Selesai', 'Batal'], 
        default: 'Menunggu Pembayaran' 
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);