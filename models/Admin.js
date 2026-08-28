const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, default: 'admin' },
    password: { type: String, required: true },
    name: { type: String, default: 'Super Administrator' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Admin || mongoose.model('Admin', adminSchema);