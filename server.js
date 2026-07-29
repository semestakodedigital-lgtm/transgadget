require('dotenv').config(); // Load environment variables dari file .env

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Modul axios untuk HTTP Request ke API RajaOngkir
const connectDB = require('./config/db'); // Modul koneksi MongoDB dari folder config
const Product = require('./models/Product');
const Order = require('./models/Order'); // Model MongoDB untuk Pesanan
const Banner = require('./models/Banner'); // Model MongoDB untuk Banner & Video Promosi

const app = express();
const PORT = process.env.PORT || 3000;

// Config RajaOngkir dari .env (Menggunakan process.env.ORIGIN_CITY_ID secara dinamis)
const RAJAONGKIR_API_KEY = process.env.RAJAONGKIR_API_KEY || '';
const ORIGIN_CITY_ID = process.env.ORIGIN_CITY_ID || '155'; // Default fallback ke Jakarta Utara (155)

// Middleware untuk membaca JSON dan URL-encoded data dari body request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menyediakan akses folder publik agar gambar/video bisa diakses dari browser
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// Konfigurasi Penyimpanan Multer (Simpan file fisik ke folder public/uploads)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// 1. Menjalankan Koneksi ke Database MongoDB menggunakan modul config/db.js
connectDB();

// Root Endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Selamat datang di API Transgadget' });
});

// -------------------------------------------------------------
// FITUR AUTENTIKASI ADMIN
// -------------------------------------------------------------

// Endpoint POST: Verifikasi Login Admin
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    // Kredensial Admin diambil dari .env (dengan fallback default jika belum diset)
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        return res.status(200).json({
            success: true,
            message: 'Login Admin Berhasil'
        });
    }

    return res.status(401).json({
        success: false,
        message: 'Username atau password salah!'
    });
});

// -------------------------------------------------------------
// FITUR BANNER & VIDEO PROMOSI (MONGODB ATLAS)
// -------------------------------------------------------------

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

// Endpoint POST: Tambah banner/video promosi baru ke MongoDB Atlas (Mendukung Multi-File Upload)
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
            const uploadedPaths = req.files.map(file => `/uploads/${file.filename}`);
            images = images.concat(uploadedPaths);
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
            message: 'Banner/Video promosi berhasil disimpan ke MongoDB Atlas',
            data: savedBanner
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint PUT: Memperbarui banner/video berdasarkan ID (Mendukung Existing & New Files)
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

        // Menambahkan semua file baru yang diunggah ke dalam array
        if (req.files && req.files.length > 0) {
            const uploadedPaths = req.files.map(file => `/uploads/${file.filename}`);
            images = images.concat(uploadedPaths);
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
// FITUR CEK ONGKIR (RAJAONGKIR API INTEGRATION)
// -------------------------------------------------------------

const DUMMY_CITIES = [
    { city_id: '152', city_name: 'Jakarta Pusat', type: 'Kota' },
    { city_id: '151', city_name: 'Jakarta Barat', type: 'Kota' },
    { city_id: '153', city_name: 'Jakarta Selatan', type: 'Kota' },
    { city_id: '154', city_name: 'Jakarta Timur', type: 'Kota' },
    { city_id: '155', city_name: 'Jakarta Utara', type: 'Kota' },
    { city_id: '23',  city_name: 'Bandung', type: 'Kota' },
    { city_id: '501', city_name: 'Yogyakarta', type: 'Kota' },
    { city_id: '444', city_name: 'Surabaya', type: 'Kota' },
    { city_id: '114', city_name: 'Denpasar', type: 'Kota' },
    { city_id: '278', city_name: 'Medan', type: 'Kota' }
];

app.get('/api/cities', async (req, res) => {
    try {
        if (!RAJAONGKIR_API_KEY) {
            return res.status(200).json({ success: true, data: DUMMY_CITIES });
        }

        const response = await axios.get('https://api.rajaongkir.com/starter/city', {
            headers: { key: RAJAONGKIR_API_KEY },
            timeout: 4000
        });

        res.status(200).json({
            success: true,
            data: response.data.rajaongkir.results
        });
    } catch (error) {
        console.warn('RajaOngkir API gagal/timeout, mengalihkan ke data kota default:', error.message);
        res.status(200).json({ success: true, data: DUMMY_CITIES });
    }
});

app.post('/api/check-ongkir', async (req, res) => {
    try {
        const { destinationCityId, weight, courier } = req.body;

        if (!destinationCityId) {
            return res.status(400).json({ success: false, message: 'Kota tujuan harus dipilih' });
        }

        const totalWeight = Number(weight) || 1000;
        const totalKg = Math.ceil(totalWeight / 1000) || 1;
        const courierCode = (courier || 'jne').toLowerCase();

        if (!RAJAONGKIR_API_KEY) {
            const baseRate = 15000;
            const calculatedCost = totalKg * baseRate;

            return res.status(200).json({
                success: true,
                costs: [
                    {
                        service: 'REG',
                        description: `Layanan Reguler Standard (${totalWeight}g / ${totalKg} Kg)`,
                        cost: [{ value: calculatedCost, etd: '2-3', note: '' }]
                    },
                    {
                        service: 'YES',
                        description: `Yakin Esok Sampai (${totalWeight}g / ${totalKg} Kg)`,
                        cost: [{ value: calculatedCost + 12000, etd: '1-1', note: '' }]
                    }
                ]
            });
        }

        const response = await axios.post('https://api.rajaongkir.com/starter/cost', {
            origin: process.env.ORIGIN_CITY_ID || ORIGIN_CITY_ID,
            destination: destinationCityId,
            weight: totalWeight,
            courier: courierCode
        }, {
            headers: { key: RAJAONGKIR_API_KEY },
            timeout: 4000 
        });

        const results = response.data.rajaongkir.results[0].costs;
        res.status(200).json({
            success: true,
            costs: results
        });
    } catch (error) {
        console.warn('Gagal/Timeout saat memuat ongkir dari RajaOngkir:', error.message);
        
        const totalWeight = Number(req.body.weight) || 1000;
        const totalKg = Math.ceil(totalWeight / 1000) || 1;
        const baseRate = 16000;
        
        const fallbackCostReg = baseRate * totalKg;
        const fallbackCostYes = (baseRate + 12000) * totalKg;

        res.status(200).json({
            success: true,
            costs: [
                {
                    service: 'REG',
                    description: `Layanan Reguler - ${totalWeight}g (${totalKg} Kg) (Estimasi Lokal)`,
                    cost: [{ value: fallbackCostReg, etd: '2-3', note: '' }]
                },
                {
                    service: 'YES',
                    description: `Yakin Esok Sampai - ${totalWeight}g (${totalKg} Kg) (Estimasi Lokal)`,
                    cost: [{ value: fallbackCostYes, etd: '1', note: '' }]
                }
            ]
        });
    }
});

// -------------------------------------------------------------
// ENDPOINT PRODUK
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
      const imagePaths = req.files.map(file => `/uploads/${file.filename}`);
      productData.images = imagePaths;
      productData.image = imagePaths[0];
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

// Endpoint PUT: Memperbarui produk berdasarkan ID (Mendukung Existing & New Files)
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
      const newImagePaths = req.files.map(file => `/uploads/${file.filename}`);
      images = images.concat(newImagePaths);
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
        message: 'Stok tidak mencukupi untuk diproses'
      });
    }

    product.stock -= reduceQty;
    await product.save();

    res.status(200).json({
      success: true,
      message: 'Stok produk berhasil dikurangi',
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

// -------------------------------------------------------------
// ENDPOINT MANAJEMEN PESANAN (MONGODB)
// -------------------------------------------------------------

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: orders
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { 
            orderId, 
            customerName, 
            customerPhone, 
            address, 
            courier, 
            paymentMethod, 
            customer, 
            items, 
            subtotal, 
            ongkir, 
            totalAmount, 
            status 
        } = req.body;

        // Validasi dan Kurangi Stok Produk Otomatis Berdasarkan Item Keranjang
        if (items && items.length > 0) {
            for (const item of items) {
                const productId = item.productId || item._id;
                const buyQty = Number(item.quantity) || 1;

                if (productId) {
                    const product = await Product.findById(productId);
                    if (product) {
                        if (product.stock < buyQty) {
                            return res.status(400).json({
                                success: false,
                                message: `Stok untuk produk "${product.name}" tidak mencukupi (Sisa: ${product.stock})`
                            });
                        }
                        product.stock -= buyQty;
                        await product.save();
                    }
                }
            }
        }

        const newOrder = new Order({
            orderId: orderId || Math.floor(100000 + Math.random() * 900000).toString(),
            customerName: customerName || (customer && customer.name) || 'Pelanggan TransGadget',
            customerPhone: customerPhone || (customer && customer.phone) || '',
            address: address || (customer && customer.address) || '',
            courier: courier || (customer && customer.courier) || '',
            paymentMethod: paymentMethod || (customer && customer.payment) || '',
            customer: customer || {},
            items: items || [],
            subtotal: Number(subtotal) || 0,
            ongkir: Number(ongkir) || 0,
            totalAmount: Number(totalAmount) || 0,
            status: status || 'Belum Diproses'
        });

        const savedOrder = await newOrder.save();

        res.status(201).json({
            success: true,
            message: 'Pesanan berhasil disimpan dan stok produk telah diperbarui',
            data: savedOrder
        });
    } catch (error) {
        console.error('Gagal menyimpan pesanan ke MongoDB:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const updatedOrder = await Order.findByIdAndUpdate(
            id,
            { status: status || 'Diproses oleh Admin' },
            { returnDocument: 'after' }
        );

        if (!updatedOrder) {
            return res.status(404).json({
                success: false,
                message: 'Pesanan tidak ditemukan'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Status pesanan berhasil diperbarui',
            data: updatedOrder
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedOrder = await Order.findByIdAndDelete(id);

        if (!deletedOrder) {
            return res.status(404).json({
                success: false,
                message: 'Pesanan tidak ditemukan'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Pesanan berhasil dihapus dari MongoDB',
            data: deletedOrder
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/orders', async (req, res) => {
    try {
        await Order.deleteMany({});
        res.status(200).json({
            success: true,
            message: 'Semua data pesanan berhasil dihapus dari MongoDB'
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