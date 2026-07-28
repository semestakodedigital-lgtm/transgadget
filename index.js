const express = require('express');
const mongoose = require('mongoose');
const Product = require('./models/Product');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware untuk membaca JSON dari body request
app.use(express.json());

// 1. Menyajikan file statis dari folder 'public' (Diletakkan di atas agar terbaca sebelum rute API)
app.use(express.static('public'));

// 1. Koneksi ke MongoDB Lokal
mongoose.connect('mongodb://127.0.0.1:27017/transgadget')
  .then(() => {
    console.log('MongoDB Terhubung: 127.0.0.1');
  })
  .catch((err) => {
    console.error('Koneksi MongoDB Gagal:', err.message);
  });

// Root Endpoint API dipindah ke /api agar tidak konflik dengan tampilan web
app.get('/api', (req, res) => {
  res.json({ message: 'Selamat datang di API Transgadget' });
});

// 2. Endpoint GET: Mengambil semua data produk
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 3. Endpoint POST: Menambahkan produk baru
app.post('/api/products', async (req, res) => {
  try {
    const newProduct = new Product(req.body);
    const savedProduct = await newProduct.save();
    
    res.status(201).json({
      success: true,
      message: 'Produk berhasil ditambahkan',
      data: savedProduct
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// 4. Endpoint PUT: Memperbarui produk berdasarkan ID
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProduct = await Product.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true
    });

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Produk berhasil diperbarui',
      data: updatedProduct
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// 5. Endpoint DELETE: Menghapus produk berdasarkan ID
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Produk berhasil dihapus',
      data: deletedProduct
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Menjalankan Server
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});