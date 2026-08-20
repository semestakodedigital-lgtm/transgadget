const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    sender: { 
        type: String, 
        required: true,
        default: 'Customer' // Bisa disesuaikan jadi 'Admin' atau nama user
    },
    message: { 
        type: String, 
        required: true 
    },
    timestamp: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Chat', chatSchema);