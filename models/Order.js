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
            quantity: Number,
            weight: { type: Number, default: 500 }
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

    // Field untuk menyimpan ID Order, Resi, dan Link Tracking dari Biteship API
    biteship_order_id: { type: String, default: null },
    resi_biteship: { type: String, default: null },
    biteship_tracking_url: { type: String, default: null },

    // DITAMBAHKAN: Field untuk menyimpan resi AWB JNE API
    resi_jne: { type: String, default: null },

    status: { 
        type: String, 
        // DITAMBAHKAN: 'Diproses / Dikirim' untuk sinkronisasi pengiriman JNE & Biteship
        enum: ['Menunggu Pembayaran', 'Lunas', 'Belum Diproses', 'Diproses oleh Admin', 'Diproses / Dikirim', 'Selesai', 'Batal'], 
        default: 'Menunggu Pembayaran' 
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);