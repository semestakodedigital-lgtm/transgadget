require('dotenv').config(); // Load environment variables dari file .env

const express = require('express');
const http = require('http'); // Modul bawaan Node.js untuk membungkus Express
const { Server } = require('socket.io'); // Modul Socket.io
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Modul axios untuk HTTP Request ke API Biteship
const cloudinary = require('cloudinary').v2; // Modul Cloudinary
const { CloudinaryStorage } = require('multer-storage-cloudinary'); // Modul Storage Multer ke Cloudinary
const { Xendit } = require('xendit-node'); // Modul Xendit Payment Gateway
const connectDB = require('./config/db'); // Modul koneksi MongoDB dari folder config

const Product = require('./models/Product');
const Order = require('./models/Order'); // Model MongoDB untuk Pesanan
const Banner = require('./models/Banner'); // Model MongoDB untuk Banner & Video Promosi
const Transaction = require('./models/Transaction'); // MODEL: Untuk Laporan Keuangan Independen
const Chat = require('./models/Chat'); // DIPERBAIKI: Disesuaikan menjadi huruf kapital 'Chat' agar sesuai dengan nama file aslinya

const app = express();
const server = http.createServer(app); // Menggabungkan Express dengan HTTP Server
const io = new Server(server); // Inisialisasi Socket.io di dalam server

const PORT = process.env.PORT || 3000;

// Config Xendit SDK Initialization
const xenditInstance = new Xendit({
    secretKey: process.env.XENDIT_SECRET_KEY || ''
});

// Middleware untuk membaca JSON dan URL-encoded data dari body request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menyediakan akses folder publik agar file statis lain tetap bisa diakses dari browser
app.use(express.static('public'));

// -------------------------------------------------------------
// KONFIGURASI CLOUDINARY & MULTER STORAGE
// -------------------------------------------------------------
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'transgadget_uploads', // Nama folder penampung di Cloudinary Anda
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'mp4'],
        resource_type: 'auto' // Mendukung gambar maupun video (untuk banner)
    }
});

const upload = multer({ storage: storage });

// 1. Menjalankan Koneksi ke Database MongoDB
connectDB();

// Root Endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Selamat datang di API Transgadget' });
});

// -------------------------------------------------------------
// FITUR LIVE CHAT (SOCKET.IO)
// -------------------------------------------------------------
io.on('connection', (socket) => {
    console.log('User terhubung ke Live Chat dengan ID:', socket.id);

    // Kirim riwayat pesan lama saat user pertama kali buka chat
    Chat.find().sort({ timestamp: 1 }).limit(50) // Ambil 50 pesan terakhir
        .then(messages => {
            socket.emit('load_old_messages', messages);
        })
        .catch(err => console.error('Gagal memuat riwayat pesan:', err));

    // Tangkap pesan baru dari frontend
    socket.on('send_message', async (data) => {
        try {
            // Simpan ke database
            const newChat = new Chat({
                sender: data.sender || 'Customer',
                message: data.message
            });
            await newChat.save();

            // Pancarkan pesan ke semua orang yang terkoneksi (termasuk admin)
            io.emit('receive_message', newChat);
        } catch (error) {
            console.error('Gagal menyimpan pesan:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User terputus dari Live Chat:', socket.id);
    });
});

// -------------------------------------------------------------
// FITUR PEMBAYARAN XENDIT (CREATE INVOICE)
// -------------------------------------------------------------

app.post('/api/create-xendit-invoice', async (req, res) => {
    try {
        const { orderId, amount, customerEmail, customerName, description } = req.body;

        const response = await xenditInstance.Invoice.createInvoice({
            data: {
                externalId: orderId ? `INV-${orderId}-${Date.now()}` : `INV-${Date.now()}`,
                amount: Number(amount) || 10000,
                payerEmail: customerEmail || 'customer@transgadget.com',
                description: description || 'Pembayaran Pesanan TransGadget Store',
                customer: {
                    givenNames: customerName || 'Pelanggan TransGadget'
                },
                successRedirectUrl: `${req.protocol}://${req.get('host')}/customer.html?status=success`,
                failureRedirectUrl: `${req.protocol}://${req.get('host')}/customer.html?status=failed`,
            }
        });

        res.status(200).json({
            success: true,
            invoiceUrl: response.invoiceUrl,
            externalId: response.externalId,
            status: response.status
        });
    } catch (error) {
        console.error('Gagal membuat Xendit Invoice:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint GET: Ambil daftar banner/video dari MongoDB Atlas
app.get('/api/banners', async (req, res) => {
    try {
        let banners = await Banner.find().sort({ createdAt: -1 });
        
        if (banners.length === 0) {
            const defaultBanners = [
                {
                    title: 'Video Showcase Koleksi Mainan',
                    subtitle: 'Saksikan review singkat dan keseruan action figure eksklusif kami.',
                    badge: 'Video Spotlight',
                    url: 'https://assets.mixkit.co/videos/preview/mixkit-hands-holding-a-videogame-controller-41295-large.mp4',
                    image: 'https://assets.mixkit.co/videos/preview/mixkit-hands-holding-a-videogame-controller-41295-large.mp4',
                    images: ['https://assets.mixkit.co/videos/preview/mixkit-hands-holding-a-videogame-controller-41295-large.mp4'],
                    isActive: true
                },
                {
                    title: 'Official Toy Collector Space',
                    subtitle: 'Temukan koleksi Action Figure, Gundam, dan Board Game original terlengkap.',
                    badge: 'New Collection',
                    url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1200&q=80',
                    image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1200&q=80',
                    images: ['https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1200&q=80'],
                    isActive: true
                }
            ];
            await Banner.insertMany(defaultBanners);
            banners = await Banner.find().sort({ createdAt: -1 });
        }

        res.status(200).json({
            success: true,
            data: banners
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint POST: Tambah banner/video promosi baru ke MongoDB Atlas (Cloudinary URL)
app.post('/api/banners', upload.array('imageFile', 10), async (req, res) => {
    try {
        const { title, subtitle, badge, existingImages } = req.body;
        let images = [];
        
        if (existingImages) {
            try {
                images = typeof existingImages === 'string' ? JSON.parse(existingImages) : existingImages;
            } catch (e) {
                images = [];
            }
        }

        if (req.files && req.files.length > 0) {
            const uploadedUrls = req.files.map(file => file.path);
            images = images.concat(uploadedUrls);
        }

        const primaryImage = images[0] || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1200&q=80';

        const newBanner = new Banner({
            title: title || 'Promo Spesial TransGadget',
            subtitle: subtitle || 'Dapatkan penawaran mainan terbaik minggu ini.',
            badge: badge || 'Promo',
            image: primaryImage,
            url: primaryImage,
            images: images.length > 0 ? images : [primaryImage],
            isActive: true
        });

        const savedBanner = await newBanner.save();
        res.status(201).json({
            success: true,
            message: 'Banner/Video promosi berhasil disimpan ke MongoDB Atlas via Cloudinary',
            data: savedBanner
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint PUT: Memperbarui banner/video berdasarkan ID
app.put('/api/banners/:id', upload.array('imageFile', 10), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subtitle, badge, existingImages } = req.body;
        
        let images = [];
        
        if (existingImages) {
            try {
                images = typeof existingImages === 'string' ? JSON.parse(existingImages) : existingImages;
            } catch (e) {
                images = [];
            }
        }

        if (req.files && req.files.length > 0) {
            const uploadedUrls = req.files.map(file => file.path);
            images = images.concat(uploadedUrls);
        }

        const primaryImage = images[0] || '';

        const updateData = {
            title,
            subtitle,
            badge,
            image: primaryImage,
            url: primaryImage,
            images: images.length > 0 ? images : [primaryImage]
        };

        const updatedBanner = await Banner.findByIdAndUpdate(id, updateData, {
            returnDocument: 'after',
            runValidators: true
        });

        if (!updatedBanner) {
            return res.status(404).json({
                success: false,
                message: 'Banner tidak ditemukan'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Banner berhasil diperbarui',
            data: updatedBanner
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint DELETE: Menghapus banner berdasarkan ID
app.delete('/api/banners/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedBanner = await Banner.findByIdAndDelete(id);

        if (!deletedBanner) {
            return res.status(404).json({
                success: false,
                message: 'Banner tidak ditemukan'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Banner berhasil dihapus dari database',
            data: deletedBanner
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -------------------------------------------------------------
// FITUR PENGIRIMAN INSTAN (BITESHIP API INTEGRATION - GOJEK & GRAB)
// -------------------------------------------------------------
const BITESHIP_API_KEY = process.env.BITESHIP_API_KEY || '';

// Endpoint Cek Ongkir Kurir Instan (Gojek / Grab) via Biteship
app.post('/api/check-ongkir', async (req, res) => {
    try {
        const { originLatitude, originLongitude, destinationLatitude, destinationLongitude, items } = req.body;

        if (!destinationLatitude || !destinationLongitude) {
            return res.status(400).json({ success: false, message: 'Koordinat lokasi tujuan belum lengkap' });
        }

        // Jika API Key Biteship belum diset di .env, berikan data fallback simulasi instan
        if (!BITESHIP_API_KEY) {
            return res.status(200).json({
                success: true,
                costs: [
                    {
                        courier_name: 'Gojek',
                        service_type: 'instant',
                        description: 'GoSend Instant (Estimasi 1-3 Jam)',
                        price: 25000,
                        etd: '1-3 hours'
                    },
                    {
                        courier_name: 'Grab',
                        service_type: 'instant',
                        description: 'GrabExpress Instant (Estimasi 1-3 Jam)',
                        price: 24000,
                        etd: '1-3 hours'
                    }
                ]
            });
        }

        // Request langsung ke Biteship API untuk kurir gojek & grab
        const response = await axios.post('https://api.biteship.com/v1/rates/couriers', {
            origin_latitude: originLatitude || Number(process.env.ORIGIN_LATITUDE) || -6.175110,
            origin_longitude: originLongitude || Number(process.env.ORIGIN_LONGITUDE) || 106.865039,
            destination_latitude: destinationLatitude,
            destination_longitude: destinationLongitude,
            couriers: 'gojek,grab', // Hanya memanggil kurir Gojek dan Grab
            items: items || [{ name: 'Barang Belanjaan', value: 50000, quantity: 1, weight: 1000 }]
        }, {
            headers: {
                'Authorization': `Bearer ${BITESHIP_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 8000
        });

        res.status(200).json({
            success: true,
            pricing: response.data.pricing
        });
    } catch (error) {
        console.warn('Gagal memuat tarif kurir dari Biteship:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || error.message
        });
    }
});

// -------------------------------------------------------------
// ENDPOINT PRODUK & PESANAN (DENGAN LAPORAN KEUANGAN MANDIRI)
// -------------------------------------------------------------

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

app.post('/api/products', upload.array('imageFile', 10), async (req, res) => {
  try {
    const { name, category, price, stock, weight, description } = req.body;

    const productData = {
        name,
        category: category || 'Action Figure',
        price: Number(price) || 0,
        stock: Number(stock) || 0,
        weight: Number(weight) || 500,
        description
    };

    if (req.files && req.files.length > 0) {
      const imageUrls = req.files.map(file => file.path);
      productData.images = imageUrls;
      productData.image = imageUrls[0];
    }

    const newProduct = new Product(productData);
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

app.put('/api/products/:id', upload.array('imageFile', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price, stock, weight, description, existingImages } = req.body;

    let images = [];

    if (existingImages) {
        try {
            images = typeof existingImages === 'string' ? JSON.parse(existingImages) : existingImages;
        } catch (e) {
            images = [];
        }
    }

    if (req.files && req.files.length > 0) {
      const newImageUrls = req.files.map(file => file.path);
      images = images.concat(newImageUrls);
    }

    const primaryImage = images[0] || '';

    const updateData = {
        name,
        category,
        price: Number(price),
        stock: Number(stock),
        weight: Number(weight) || 500,
        description,
        image: primaryImage,
        images: images.length > 0 ? images : [primaryImage]
    };

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      returnDocument: 'after',
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

app.put('/api/products/:id/reduce-stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan'
      });
    }

    const reduceQty = Number(quantity) || 1;
    if (product.stock < reduceQty) {
      return res.status(400).json({
        success: false,
        message: 'Stok tidak mencukupi'
      });
    }

    product.stock -= reduceQty;
    await product.save();

    res.status(200).json({
      success: true,
      message: 'Stok berhasil dikurangi',
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await Product.findByIdAndDelete(id);
    if (!deletedProduct) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }
    res.status(200).json({ success: true, message: 'Produk berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { orderId, customer, items, subtotal, ongkir, totalAmount, status } = req.body;
        
        if (items && items.length > 0) {
            for (const item of items) {
                const product = await Product.findById(item.productId || item._id);
                if (product) {
                    product.stock -= Number(item.quantity);
                    await product.save();
                }
            }
        }

        const newOrder = new Order({ orderId, customer, items, subtotal, ongkir, totalAmount, status });
        const savedOrder = await newOrder.save();
        
        // Jika pesanan langsung dibuat dengan status Selesai
        if (status === 'Selesai') {
            const existingTx = await Transaction.findOne({ orderId: savedOrder.orderId });
            if (!existingTx) {
                await Transaction.create({
                    orderId: savedOrder.orderId,
                    subtotal: savedOrder.subtotal || 0,
                    ongkir: savedOrder.ongkir || 0,
                    totalAmount: savedOrder.totalAmount
                });
            }
        }

        // PANCARKAN REAL-TIME NOTIFIKASI KE ADMIN
        io.emit('new_order_notification', savedOrder);

        res.status(201).json({ success: true, data: savedOrder });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// UPDATE STATUS PESANAN (Mencatat ke Transaction jika status "Selesai")
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id, 
            { status }, 
            { returnDocument: 'after' }
        );

        if (!updatedOrder) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
        }

        // JIKA STATUS BERUBAH MENJADI SELESAI, CATAT KE TABEL TRANSAKSI KEUANGAN
        if (status === 'Selesai') {
            const existingTx = await Transaction.findOne({ orderId: updatedOrder.orderId });
            if (!existingTx) {
                await Transaction.create({
                    orderId: updatedOrder.orderId,
                    subtotal: updatedOrder.subtotal || 0,
                    ongkir: updatedOrder.ongkir || 0,
                    totalAmount: updatedOrder.totalAmount
                });
            }
        }

        res.status(200).json({ success: true, data: updatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Pesanan dihapus' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------------------------------------------
// ENDPOINT LAPORAN KEUANGAN
// -------------------------------------------------------------
app.get('/api/financial-report', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ completedAt: -1 });
        
        const totalPendapatanKotor = transactions.reduce((acc, curr) => acc + (curr.subtotal || 0), 0);
        const totalOngkir = transactions.reduce((acc, curr) => acc + (curr.ongkir || 0), 0);
        const totalTransaksi = transactions.length;

        res.status(200).json({
            success: true,
            totalPendapatanKotor,
            totalOngkir,
            totalTransaksi,
            data: transactions
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// HARUS menggunakan server.listen agar Socket.io berfungsi dengan Express
server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});