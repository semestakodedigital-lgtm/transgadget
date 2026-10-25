require('dotenv').config(); // Load environment variables dari file .env

const express = require('express');
const http = require('http'); // Modul bawaan Node.js untuk membungkus Express
const { Server } = require('socket.io'); // Modul Socket.io
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Modul axios untuk HTTP Request ke API Biteship & JNE
const cloudinary = require('cloudinary').v2; // Modul Cloudinary
const { CloudinaryStorage } = require('multer-storage-cloudinary'); // Modul Storage Multer ke Cloudinary
const bcrypt = require('bcrypt'); // Modul enkripsi password admin
const mongoose = require('mongoose'); // Modul Mongoose (Dipindahkan ke atas agar siap digunakan seluruh model)
const XLSX = require('xlsx'); // Modul untuk membaca file Excel JNE (list_dest.xlsx, dll)
const connectDB = require('./config/db'); // Modul koneksi MongoDB dari folder config

// Import Konfigurasi Midtrans dari folder config/midtrans.js
const { snap, coreApi } = require('./config/midtrans');

const Product = require('./models/Product');
const Order = require('./models/Order'); // Model MongoDB untuk Pesanan
const Banner = require('./models/Banner'); // Model MongoDB untuk Banner & Video Promosi
const Transaction = require('./models/Transaction'); // MODEL: Untuk Laporan Keuangan Independen
const Chat = require('./models/Chat'); // MODEL: Untuk Live Chat

// -------------------------------------------------------------
// FUNGSI HELPER: OTOMATIS BUAT PESANAN KURIR KE BITESHIP
// -------------------------------------------------------------
async function createBiteshipOrder(orderData, orderIdRef) {
    try {
        const biteshipApiKey = process.env.BITESHIP_API_KEY || '';
        if (!biteshipApiKey) {
            console.warn('API Key Biteship tidak ditemukan di environment. Pembuatan kurir otomatis dilewati.');
            return null;
        }

        const originLat = Number(process.env.ORIGIN_LATITUDE) || -6.1158;
        const originLng = Number(process.env.ORIGIN_LONGITUDE) || 106.7431;

        const response = await axios.post('https://api.biteship.com/v1/orders', {
            shipper_contact_name: "TransGadget Store",
            shipper_contact_phone: "08119238168",
            origin_contact_name: "Admin TransGadget",
            origin_contact_phone: "08119238168",
            origin_address: "Ruko Elang Laut Boulevard Blok C No. 42, PIK, Jakarta Utara",
            origin_latitude: originLat,
            origin_longitude: originLng,
            
            destination_contact_name: orderData.customer?.name || "Pelanggan TransGadget",
            destination_contact_phone: orderData.customer?.phone || "08123456789",
            destination_address: orderData.customer?.address || "Alamat Tujuan Pelanggan",
            destination_latitude: Number(orderData.destinationLatitude) || -6.2000,
            destination_longitude: Number(orderData.destinationLongitude) || 106.8160,
            
            courier_company: orderData.courierCompany || 'gojek', // Contoh: 'gojek' atau 'grab'
            courier_type: orderData.courierType || 'instant',      // Contoh: 'instant' atau 'sameday'
            delivery_type: 'now',
            items: (orderData.items || []).map(item => ({
                name: item.name || 'Produk Mainan',
                description: item.name || 'Produk Mainan',
                value: Number(item.price) || 0,
                quantity: Number(item.quantity) || 1,
                weight: Number(item.weight || 500)
            }))
        }, {
            headers: {
                'Authorization': `Bearer ${biteshipApiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        const result = response.data;
        if (result.success || result.id) {
            console.log(`Berhasil membuat order Biteship untuk Order ID ${orderIdRef}, Resi/ID Biteship:`, result.id || result.waybill_id);
            return result;
        } else {
            console.error("Gagal membuat order Biteship:", result);
            return null;
        }
    } catch (err) {
        console.error("Error API Biteship Create Order:", err.response?.data || err.message);
        return null;
    }
}

// -------------------------------------------------------------
// MODEL MONGODB: ADMIN (Didefinisikan langsung untuk mencegah error import Router)
// -------------------------------------------------------------
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, default: 'admin' },
    password: { type: String, required: true },
    name: { type: String, default: 'Super Administrator' },
    createdAt: { type: Date, default: Date.now }
});
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

// -------------------------------------------------------------
// MODEL MONGODB: REVIEW / ULASAN PRODUK
// -------------------------------------------------------------
const reviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.Mixed, required: true }, // Menggunakan Mixed agar fleksibel mendukung ObjectId atau String
    productName: { type: String, default: 'Produk Mainan' },
    customerName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    adminReply: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);

const app = express();
const server = http.createServer(app); // Menggabungkan Express dengan HTTP Server
const io = new Server(server); // Inisialisasi Socket.io di dalam server

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middleware untuk membaca JSON dan URL-encoded data dari body request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menyediakan akses folder publik agar file statis lain tetap bisa diakses dari browser
app.use(express.static('public'));

// Untuk sitemap.xml
app.use(express.static(path.join(__dirname, 'public')));

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
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv'],
        resource_type: 'auto' // Mendukung gambar maupun video (untuk banner dan produk)
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
// FITUR MANAJEMEN AKUN & PASSWORD ADMIN API (MONGODB STORAGE)
// -------------------------------------------------------------

// Endpoint POST: Autentikasi Login Admin
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        let admin = await Admin.findOne({ username: username ? username.trim() : 'admin' });
        
        if (!admin) {
            if (username === 'admin' && password === 'admin123') {
                return res.status(200).json({ success: true, message: 'Login berhasil (Default)' });
            }
            return res.status(400).json({ success: false, message: 'Username atau password salah!' });
        }

        let isMatch = false;
        if (admin.password && (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'))) {
            isMatch = await bcrypt.compare(password, admin.password);
        } else {
            isMatch = (password === admin.password);
        }

        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Username atau password salah!' });
        }

        res.status(200).json({ success: true, message: 'Login berhasil' });
    } catch (error) {
        console.error('Error admin login:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint GET: Ambil daftar profil admin
app.get('/api/admin/profile', async (req, res) => {
    try {
        let admins = await Admin.find({}, '-password');
        if (admins.length === 0) {
            // Buat default admin jika belum ada
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);
            const defaultAdmin = new Admin({
                username: 'admin',
                password: hashedPassword,
                name: 'Super Administrator'
            });
            await defaultAdmin.save();
            admins = await Admin.find({}, '-password');
        }
        res.status(200).json({ success: true, data: admins });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint PUT: Perbarui username atau password admin (DENGAN BCRYPT HASHING)
app.put('/api/admin/update-credentials', async (req, res) => {
    try {
        const { oldPassword, newPassword, newUsername } = req.body;
        
        let admin = await Admin.findOne();
        
        if (!admin) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword || 'admin123', salt);
            admin = new Admin({
                username: newUsername ? newUsername.trim() : 'admin',
                password: hashedPassword,
                name: newUsername ? newUsername.trim() : 'Super Administrator'
            });
            await admin.save();
            return res.status(200).json({ success: true, message: 'Akun admin baru berhasil diinisialisasi dan diperbarui' });
        }

        // Jika form mengirimkan password lama & baru untuk verifikasi
        if (oldPassword && newPassword) {
            let isMatch = false;
            if (admin.password && (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'))) {
                isMatch = await bcrypt.compare(oldPassword, admin.password);
            } else {
                isMatch = (oldPassword === admin.password);
            }

            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Password lama salah' });
            }
            
            // Enkripsi password baru dengan bcrypt sebelum disimpan
            const salt = await bcrypt.genSalt(10);
            admin.password = await bcrypt.hash(newPassword, salt);
        } else if (newPassword && !oldPassword) {
            // Enkripsi password baru jika tidak ada validasi password lama
            const salt = await bcrypt.genSalt(10);
            admin.password = await bcrypt.hash(newPassword, salt);
        }

        if (newUsername && newUsername.trim() !== '') {
            admin.username = newUsername.trim();
            admin.name = newUsername.trim();
        }

        await admin.save();
        res.status(200).json({ success: true, message: 'Kredensial admin berhasil diperbarui' });
    } catch (error) {
        console.error('Error updating admin credentials:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------------------------------------------
// FITUR ULASAN PRODUK API (MONGODB STORAGE & ADMIN CONTROL)
// -------------------------------------------------------------

// Endpoint GET: Ambil seluruh ulasan atau filter berdasarkan productId query (?productId=...)
app.get('/api/reviews', async (req, res) => {
    try {
        const { productId } = req.query;
        let query = {};
        if (productId) {
            let queryId = productId;
            try {
                if (mongoose.Types.ObjectId.isValid(productId)) {
                    queryId = new mongoose.Types.ObjectId(productId);
                }
            } catch (e) {}

            query = {
                $or: [
                    { productId: queryId },
                    { productId: productId }
                ]
            };
        }
        const reviews = await Review.find(query).populate('productId', 'name image category').sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint GET: Ambil ulasan berdasarkan ID produk tertentu di URL parameter
app.get('/api/reviews/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        let queryId = productId;
        try {
            if (mongoose.Types.ObjectId.isValid(productId)) {
                queryId = new mongoose.Types.ObjectId(productId);
            }
        } catch (e) {}

        const reviews = await Review.find({ 
            $or: [
                { productId: queryId },
                { productId: productId }
            ]
        }).sort({ createdAt: -1 });
        
        res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint POST: Kirim ulasan baru dari pelanggan
app.post('/api/reviews', async (req, res) => {
    try {
        const { productId, productName, customerName, rating, comment } = req.body;
        if (!productId || !customerName || !comment) {
            return res.status(400).json({ success: false, message: 'Data ulasan tidak lengkap' });
        }
        const newReview = new Review({ 
            productId, 
            productName: productName || 'Produk Mainan',
            customerName, 
            rating: Number(rating) || 5, 
            comment 
        });
        const savedReview = await newReview.save();
        
        // Kirim notifikasi real-time via Socket.io ke admin dashboard
        io.emit('new_review_notification', savedReview);

        res.status(201).json({ success: true, data: savedReview });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// get sitemap.xml
app.get('/sitemap.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

// Endpoint PUT: Admin membalas ulasan pelanggan
app.put('/api/reviews/:id/reply', async (req, res) => {
    try {
        const { adminReply } = req.body;
        const updatedReview = await Review.findByIdAndUpdate(
            req.params.id,
            { adminReply: adminReply || '' },
            { returnDocument: 'after' }
        );
        if (!updatedReview) {
            return res.status(404).json({ success: false, message: 'Ulasan tidak ditemukan' });
        }
        res.status(200).json({ success: true, data: updatedReview });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint DELETE: Hapus ulasan oleh Admin berdasarkan ID Review
app.delete('/api/reviews/:id', async (req, res) => {
    try {
        const deletedReview = await Review.findByIdAndDelete(req.params.id);
        if (!deletedReview) {
            return res.status(404).json({ success: false, message: 'Ulasan tidak ditemukan' });
        }
        res.status(200).json({ success: true, message: 'Ulasan berhasil dihapus oleh admin' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------------------------------------------
// FITUR LIVE CHAT API (MONGODB STORAGE)
// -------------------------------------------------------------
app.get('/api/chats', async (req, res) => {
    try {
        const { room } = req.query;
        let query = {};
        if (room) {
            query.room = room.trim();
        }
        const chats = await Chat.find(query).sort({ timestamp: 1 });
        res.status(200).json({ success: true, data: chats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------------------------------------------
// FITUR LIVE CHAT (SOCKET.IO) - TERINTEGRASI MONGODB (DENGAN EDIT & HAPUS)
// -------------------------------------------------------------
io.on('connection', (socket) => {
    console.log('User terhubung ke Live Chat dengan ID:', socket.id);

    socket.on('join_room', (room) => {
        if (room) {
            const cleanRoom = room.trim();
            socket.join(cleanRoom);
            console.log(`Socket ${socket.id} bergabung ke room: ${cleanRoom}`);
        }
    });

    socket.on('send_message', async (data) => {
        try {
            const senderName = (data.sender || 'Customer').trim();
            const roomName = (data.room || (senderName === 'Admin' ? 'General' : senderName)).trim();

            const newChat = new Chat({
                sender: senderName,
                room: roomName,
                message: data.message
            });
            const savedChat = await newChat.save();

            io.to(roomName).emit('receive_message', savedChat);
            io.emit('receive_message', savedChat);
        } catch (error) {
            console.error('Gagal menyimpan dan mengirim pesan chat:', error);
        }
    });

    socket.on('edit_message', async (data) => {
        try {
            const { messageId, newMessage } = data;
            const updatedChat = await Chat.findByIdAndUpdate(
                messageId,
                { message: newMessage, edited: true },
                { returnDocument: 'after' }
            );

            if (updatedChat) {
                const roomName = (updatedChat.room || '').trim();
                if (roomName) {
                    io.to(roomName).emit('message_updated', updatedChat);
                }
                io.emit('message_updated', updatedChat);
            }
        } catch (error) {
            console.error('Gagal mengedit pesan chat:', error);
        }
    });

    socket.on('delete_message', async (data) => {
        try {
            const { messageId } = data;
            const deletedChat = await Chat.findByIdAndDelete(messageId);

            if (deletedChat) {
                const roomName = (deletedChat.room || '').trim();
                if (roomName) {
                    io.to(roomName).emit('message_deleted', messageId);
                }
                io.emit('message_deleted', messageId);
            }
        } catch (error) {
            console.error('Gagal menghapus pesan chat:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User terputus dari Live Chat:', socket.id);
    });
});

// -------------------------------------------------------------
// FITUR PEMBAYARAN MIDTRANS (CREATE SNAP TRANSACTION)
// -------------------------------------------------------------
app.post('/api/create-midtrans-transaction', async (req, res) => {
    try {
        const { orderId, amount, customerEmail, customerName, customerPhone, itemDetails } = req.body;

        const generatedOrderId = orderId ? `${orderId}` : `INV-${Date.now()}`;

        let calculatedItemTotal = 0;
        let formattedItems = [];

        if (itemDetails && itemDetails.length > 0) {
            formattedItems = itemDetails.map(item => {
                const itemPrice = Number(item.price) || 0;
                const itemQty = Number(item.quantity) || 1;
                calculatedItemTotal += (itemPrice * itemQty);

                return {
                    id: String(item.id || item._id || 'ITEM-01'),
                    price: itemPrice,
                    quantity: itemQty,
                    name: String(item.name || 'Produk TransGadget').substring(0, 50)
                };
            });
        }

        const totalTagihan = Number(amount) || calculatedItemTotal;
        const selisihOngkir = totalTagihan - calculatedItemTotal;

        if (selisihOngkir > 0) {
            formattedItems.push({
                id: 'BIAYA-PENGIRIMAN',
                price: selisihOngkir,
                quantity: 1,
                name: 'Biaya Pengiriman Kurir'
            });
        }

        const parameter = {
            transaction_details: {
                order_id: generatedOrderId,
                gross_amount: totalTagihan
            },
            customer_details: {
                first_name: customerName || 'Pelanggan TransGadget',
                email: customerEmail || 'customer@transgadget.com',
                phone: customerPhone || '08123456789'
            },
            item_details: formattedItems.length > 0 ? formattedItems : [
                {
                    id: 'ITEM-01',
                    price: totalTagihan,
                    quantity: 1,
                    name: 'Pembayaran Pesanan TransGadget'
                }
            ]
        };

        let transaction = await snap.createTransaction(parameter);

        res.status(200).json({
            success: true,
            token: transaction.token,
            redirectUrl: transaction.redirect_url,
            orderId: generatedOrderId
        });
    } catch (error) {
        console.error('Gagal membuat Midtrans Transaction:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint: Midtrans Notification Webhook Handler (Terintegrasi Pembuatan Order Biteship Otomatis)
app.post('/api/midtrans/notification', async (req, res) => {
    try {
        const statusResponse = await coreApi.transaction.notification(req.body);
        const orderId = statusResponse.order_id;
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        console.log(`Midtrans Notification: Order ID ${orderId} is ${transactionStatus}`);

        if (transactionStatus == 'settlement' || (transactionStatus == 'capture' && fraudStatus == 'accept')) {
            // Cari pesanan di database berdasarkan orderId
            const existingOrder = await Order.findOne({ orderId: orderId });
            
            if (existingOrder && existingOrder.status !== 'Selesai' && existingOrder.status !== 'Diproses Kurir') {
                // Perbarui status pesanan menjadi Selesai / Dibayar
                existingOrder.status = 'Selesai';
                await existingOrder.save();

                // Catat ke Laporan Keuangan jika belum ada
                const existingTx = await Transaction.findOne({ orderId: orderId });
                if (!existingTx) {
                    await Transaction.create({
                        orderId: orderId,
                        subtotal: existingOrder.subtotal || 0,
                        ongkir: existingOrder.ongkir || 0,
                        totalAmount: existingOrder.totalAmount
                    });
                }

                // Trigger otomatis buat pesanan ke Biteship jika menggunakan kurir instant/goshop
                if (existingOrder.customer?.courier && (existingOrder.customer.courier.toLowerCase().includes('gojek') || existingOrder.customer.courier.toLowerCase().includes('grab'))) {
                    // Tentukan perusahaan kurir & tipe layanan dari teks kurir
                    const courierLower = existingOrder.customer.courier.toLowerCase();
                    const company = courierLower.includes('grab') ? 'grab' : 'gojek';
                    const type = courierLower.includes('sameday') ? 'sameday' : 'instant';

                    await createBiteshipOrder({
                        customer: {
                            name: existingOrder.customer.name,
                            phone: existingOrder.customer.phone,
                            address: existingOrder.customer.address
                        },
                        destinationLatitude: existingOrder.destinationLatitude || -6.2000,
                        destinationLongitude: existingOrder.destinationLongitude || 106.8160,
                        courierCompany: company,
                        courierType: type,
                        items: existingOrder.items
                    }, orderId);
                }
            }
        }

        res.status(200).json({ status: 'OK' });
    } catch (error) {
        console.error('Midtrans Webhook Error:', error);
        res.status(500).json({ error: error.message });
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
// PROXY ENDPOINT: PENCARIAN AREA BITESHIP (MENGHINDARI CORS ERROR DI BROWSER)
// -------------------------------------------------------------
app.get('/api/biteship/areas', async (req, res) => {
    try {
        const keyword = req.query.input || '';
        const biteshipApiKey = process.env.BITESHIP_API_KEY || '';
        
        const response = await axios.get(`https://api.biteship.com/v1/maps/areas?input=${encodeURIComponent(keyword)}&countries=ID`, {
            headers: {
                'Authorization': `Bearer ${biteshipApiKey}`
            },
            timeout: 7000
        });
        
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Gagal mengambil data area Biteship:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------------------------------------------
// FITUR PENGIRIMAN INSTAN & JNE (BITESHIP API INTEGRATION - DENGAN SANITIZASI & FALLBACK)
// -------------------------------------------------------------
const ratesCache = {}; // Penyimpanan cache sementara untuk menghemat kuota API Biteship

app.post('/api/check-ongkir', async (req, res) => {
    try {
        const { destinationLatitude, destinationLongitude, destinationArea, destinationPostalCode, couriers, items } = req.body;
        const biteshipApiKey = process.env.BITESHIP_API_KEY || '';

        // Clean & Sanitize courier string dari frontend agar diterima Biteship API
        let activeCouriers = 'jne,sicepat,jnt';
        if (couriers && typeof couriers === 'string') {
            const cLower = couriers.toLowerCase();
            if (cLower.includes('jne')) activeCouriers = 'jne';
            else if (cLower.includes('sicepat')) activeCouriers = 'sicepat';
            else if (cLower.includes('jnt')) activeCouriers = 'jnt';
            else if (cLower.includes('gojek') || cLower.includes('grab')) activeCouriers = 'gojek,grab';
            else activeCouriers = cLower.replace(/\s+/g, '');
        }

        // Pengecekan Kurir Instan (Gojek / Grab via Koordinat)
        if (!destinationLatitude || !destinationLongitude) {
            return res.status(400).json({ success: false, message: 'Koordinat lokasi tujuan belum lengkap' });
        }

        const originLat = Number(process.env.ORIGIN_LATITUDE) || -6.1158;
        const originLng = Number(process.env.ORIGIN_LONGITUDE) || 106.7431;

        try {
            const response = await axios.post('https://api.biteship.com/v1/rates/couriers', {
                origin_latitude: originLat,
                origin_longitude: originLng,
                destination_latitude: Number(destinationLatitude),
                destination_longitude: Number(destinationLongitude),
                couriers: 'gojek,grab',
                items: items && items.length > 0 ? items : [{ name: 'Produk TransGadget', value: 199000, quantity: 1, weight: 700 }]
            }, {
                headers: {
                    'Authorization': `Bearer ${biteshipApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (response.data && response.data.pricing && response.data.pricing.length > 0) {
                return res.status(200).json({
                    success: true,
                    pricing: response.data.pricing,
                    source: 'biteship_api_instant'
                });
            }
        } catch (instantErr) {
            console.warn('Biteship Instant Rate Error:', instantErr.response?.data || instantErr.message);
        }

        return res.status(200).json({
            success: true,
            pricing: [
                { courier_name: 'Gojek', courier_service_name: 'Instant', price: 15000, duration: '1-3 jam' },
                { courier_name: 'Grab', courier_service_name: 'Instant', price: 17000, duration: '1-3 jam' }
            ],
            source: 'fallback_instant'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
        const { guest_id } = req.query;
        let query = {};
        
        // Filter pesanan berdasarkan guest_id jika tersedia dari frontend
        if (guest_id) {
            query.guest_id = guest_id;
        }

        const orders = await Order.find(query).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { orderId, guest_id, customer, items, subtotal, ongkir, totalAmount, status, destinationLatitude, destinationLongitude, courierCompany, courierType } = req.body;
        
        if (items && items.length > 0) {
            for (const item of items) {
                const product = await Product.findById(item.productId || item._id);
                if (product) {
                    product.stock -= Number(item.quantity);
                    await product.save();
                }
            }
        }

        const newOrder = new Order({ 
            orderId, 
            guest_id, // Menyimpan guest_id pelanggan ke database
            customer, 
            items, 
            subtotal, 
            ongkir, 
            totalAmount, 
            status,
            destinationLatitude,
            destinationLongitude,
            courierCompany,
            courierType
        });
        const savedOrder = await newOrder.save();
        
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

        io.emit('new_order_notification', savedOrder);

        res.status(201).json({ success: true, data: savedOrder });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

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

// -------------------------------------------------------------
// INTEGRASI FILE EXCEL JNE (list_dest.xlsx) DI SERVER
// -------------------------------------------------------------
let jneDestData = [];
try {
    const destFilePath = path.join(__dirname, 'list_dest.xlsx');
    if (fs.existsSync(destFilePath)) {
        const workbook = XLSX.readFile(destFilePath);
        const sheetName = workbook.SheetNames[0];
        jneDestData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        console.log(`[JNE] Berhasil memuat ${jneDestData.length} data destinasi dari list_dest.xlsx.`);
    } else {
        console.warn("[JNE] File list_dest.xlsx tidak ditemukan di direktori utama.");
    }
} catch (e) {
        console.warn("[JNE] Gagal membaca file list_dest.xlsx:", e.message);
}

// ENDPOINT JNE: CEK RESI (API TRACE TRACKING)
app.post('/api/shipping/jne-track', async (req, res) => {
    try {
        const { awb } = req.body; 

        if (!awb) {
            return res.status(400).json({ success: false, message: "Nomor resi (AWB) tidak boleh kosong" });
        }

        const trackingUrl = `${process.env.JNE_TRACKING_ENDPOINT}${awb}`;
        
        const params = new URLSearchParams();
        params.append('username', process.env.JNE_USERNAME || '');
        params.append('api_key', process.env.JNE_API_KEY || '');

        const response = await axios.post(trackingUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        res.status(200).json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error("Gagal melacak resi JNE:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: "Gagal melacak resi JNE",
            error: error.response?.data || error.message
        });
    }
});

// ENDPOINT JNE: CEK ONGKOS KIRIM (API TARIFF) - MENGGUNAKAN PENCOCOKAN list_dest.xlsx
app.post('/api/shipping/jne-cost', async (req, res) => {
    try {
        const { thru, weight, city, district, postalCode } = req.body;

        let targetTariffCode = "CGK10000"; // Default Jakarta jika tidak ditemukan

        if (jneDestData.length > 0) {
            const queryCity = (city || '').toUpperCase().trim();
            const queryDistrict = (district || thru || '').toUpperCase().trim();
            const queryPostal = String(postalCode || '').trim();

            let matched = jneDestData.find(item => {
                const itemZip = String(item.ZIP_CODE || '').trim();
                const itemDist = String(item.DISTRICT_NAME || '').toUpperCase().trim();
                const itemCity = String(item.CITY_NAME || '').toUpperCase().trim();

                return (queryPostal && itemZip === queryPostal) ||
                       (queryDistrict && itemDist.includes(queryDistrict)) ||
                       (queryCity && itemCity.includes(queryCity));
            });

            if (matched && matched.TARIFF_CODE) {
                targetTariffCode = String(matched.TARIFF_CODE).trim();
                console.log(`[JNE Lookup] Berhasil mencocokkan '${queryDistrict || queryCity}' dengan TARIFF_CODE: ${targetTariffCode}`);
            }
        }

        const params = new URLSearchParams();
        params.append('username', process.env.JNE_USERNAME || '');
        params.append('api_key', process.env.JNE_API_KEY || '');
        params.append('from', 'CGK10000'); 
        params.append('thru', targetTariffCode); // Mengirimkan kode tarif resmi hasil lookup Excel
        params.append('weight', weight || 1);

        let rates = [];

        try {
            const response = await axios.post(process.env.JNE_TARIFF_ENDPOINT, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 8000
            });

            const responseData = response.data;
            let rawPriceList = [];

            if (responseData) {
                if (Array.isArray(responseData)) {
                    rawPriceList = responseData;
                } else if (Array.isArray(responseData.price)) {
                    rawPriceList = responseData.price;
                } else if (responseData.data) {
                    if (Array.isArray(responseData.data)) {
                        rawPriceList = responseData.data;
                    } else if (Array.isArray(responseData.data.price)) {
                        rawPriceList = responseData.data.price;
                    }
                }
            }

            if (rawPriceList.length > 0) {
                rates = rawPriceList.map(item => ({
                    service_display: item.service_display || item.service || item.service_code || 'REG',
                    price: Number(item.price || item.amount || 25000),
                    etd_from: item.etd_from || item.etd || '2',
                    etd_thru: item.etd_thru || item.etd || '3'
                }));
            }
        } catch (apiErr) {
            console.warn('API JNE Resmi timeout/gagal, mengaktifkan fallback:', apiErr.message);
        }

        if (!rates || rates.length === 0) {
            rates = [
                { service_display: 'REG (Sistem Default)', price: 25000, etd_from: '2', etd_thru: '3' },
                { service_display: 'YES (Sistem Default)', price: 45000, etd_from: '1', etd_thru: '1' }
            ];
        }

        res.status(200).json({
            success: true,
            price: rates, 
            data: rates
        });

    } catch (error) {
        console.error("Kesalahan sistem pada Endpoint Tarif JNE:", error.message);
        
        const errorRates = [
            { service_display: 'REG (Error Koneksi)', price: 25000, etd_from: '2', etd_thru: '3' },
            { service_display: 'YES (Error Koneksi)', price: 45000, etd_from: '1', etd_thru: '1' }
        ];

        res.status(200).json({
            success: true,
            price: errorRates,
            data: errorRates
        });
    }
});

// ENDPOINT JNE: GENERATE AIRWAYBILL (BUAT RESI OTOMATIS)
app.post('/api/shipping/jne-generate-awb', async (req, res) => {
    try {
        const { order_id, destination_code, weight, qty, receiver_name, receiver_phone, receiver_address } = req.body;

        if (!order_id || !destination_code) {
            return res.status(400).json({ success: false, message: "Data order_id atau destination_code tidak boleh kosong" });
        }

        const generateUrl = process.env.JNE_GENERATE_AWB_ENDPOINT;

        const params = new URLSearchParams();
        params.append('username', process.env.JNE_USERNAME || '');
        params.append('api_key', process.env.JNE_API_KEY || '');
        params.append('OLID', order_id);
        params.append('ORIGIN', 'CGK10000');
        params.append('DESTINATION', destination_code);
        params.append('WEIGHT', weight || 1);
        params.append('QTY', qty || 1);
        params.append('RECEIVER_NAME', receiver_name || 'Pelanggan TransGadget');
        params.append('RECEIVER_ADDR1', receiver_address || '-');
        params.append('RECEIVER_CITY', '-');
        params.append('RECEIVER_ZIP', '-');
        params.append('RECEIVER_PHONE', receiver_phone || '-');
        params.append('SHIPPER_NAME', 'TransGadget');
        params.append('SHIPPER_ADDR1', 'Ruko Elang Laut Boulevard');
        params.append('SHIPPER_CITY', 'Jakarta Utara');
        params.append('SHIPPER_ZIP', '14470');
        params.append('SHIPPER_PHONE', '08119238168');
        params.append('GOODS_DESC', 'Produk Mainan');
        params.append('GOODS_AMOUNT', '100000');
        params.append('SERVICE_CODE', 'REG');

        const response = await axios.post(generateUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        res.status(200).json({
            success: true,
            message: "Resi JNE berhasil di-generate",
            data: response.data
        });

    } catch (error) {
        console.error("Gagal Generate AWB JNE:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: "Gagal mencetak resi JNE",
            error: error.response?.data || error.message
        });
    }
});

// HARUS menggunakan server.listen agar Socket.io berfungsi dengan Express
server.listen(PORT, () => {
    console.log(`Server berjalan di ${BASE_URL}`);
});