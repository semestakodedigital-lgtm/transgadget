const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    sender: { 
        type: String, 
        required: true,
        default: 'Customer' // Bisa 'Admin' atau nama user
    },
    room: { 
        type: String, 
        required: true,
        default: 'General' // Identitas ruang chat atau ID pelanggan
    },
    message: { 
        type: String, 
        required: true 
    },
    edited: {
        type: Boolean,
        default: false
    },
    timestamp: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Chat', chatSchema);