    require('dotenv').config();
    const express = require('express');
    const mongoose = require('mongoose');
    const Product = require('./models/Product'); // Sesuaikan path model Anda
    const upload = require('./middleware/upload'); // Panggil middleware upload Cloudinary

    const app = express();

    // Middleware dasar
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.set('view engine', 'ejs'); // Sesuaikan jika Anda menggunakan EJS atau template engine lain

    // Koneksi ke MongoDB Atlas
    mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch((err) => console.error('MongoDB connection error:', err));

    // ==========================================
    // ROUTE: Tambah Produk dengan Upload Cloudinary
    // ==========================================
    // 'image' di bawah ini harus sama persis dengan atribut name="..." pada tag <input type="file" name="image"> di form HTML Anda
    app.post('/products/add', upload.single('image'), async (req, res) => {
    try {
        // Pastikan file berhasil diunggah
        if (!req.file) {
        return res.status(400).send('Tidak ada file gambar yang diunggah atau format tidak didukung.');
        }

        // req.file.path berisi URL publik yang diberikan oleh Cloudinary
        const imageUrl = req.file.path;

        // Buat data produk baru ke MongoDB
        const newProduct = new Product({
        name: req.body.name,
        price: req.body.price,
        category: req.body.category,
        description: req.body.description,
        stock: req.body.stock,
        weight: req.body.weight,
        image: imageUrl, // Menyimpan URL Cloudinary langsung ke database
        });

        await newProduct.save();
        
        // Redirect kembali ke halaman produk atau dashboard setelah sukses
        res.redirect('/products');
    } catch (error) {
        console.error('Gagal menyimpan produk:', error);
        res.status(500).send('Terjadi kesalahan pada server saat mengunggah gambar.');
    }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
    });