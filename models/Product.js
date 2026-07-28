const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Nama produk wajib diisi']
    },
    category: {
        type: String,
        default: 'Action Figure'
    },
    description: {
        type: String,
        required: [true, 'Deskripsi produk wajib diisi']
    },
    price: {
        type: Number,
        required: [true, 'Harga produk wajib diisi'],
        default: 0
    },
    stock: {
        type: Number,
        required: [true, 'Stok produk wajib diisi'],
        default: 0
    },
    weight: {
        type: Number,
        required: [true, 'Berat produk wajib diisi'],
        default: 500
    },
    image: {
        type: String,
        required: false
    },
    images: {
        type: [String],
        required: false
    }
}, {
    timestamps: true // Otomatis mencatat createdAt dan updatedAt
});

module.exports = mongoose.model('Product', productSchema);