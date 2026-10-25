const midtransClient = require('midtrans-client');

// Membersihkan spasi atau karakter tersembunyi (\r) dari file .env
const serverKey = process.env.MIDTRANS_SERVER_KEY ? process.env.MIDTRANS_SERVER_KEY.trim() : '';
const clientKey = process.env.MIDTRANS_CLIENT_KEY ? process.env.MIDTRANS_CLIENT_KEY.trim() : '';
const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true' || process.env.MIDTRANS_IS_PRODUCTION === true;

const snap = new midtransClient.Snap({
    isProduction: isProduction,
    serverKey: serverKey,
    clientKey: clientKey
});

const coreApi = new midtransClient.CoreApi({
    isProduction: isProduction,
    serverKey: serverKey,
    clientKey: clientKey
});

module.exports = { snap, coreApi };