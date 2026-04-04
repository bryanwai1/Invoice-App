const express = require('express');
const router = express.Router();
const wa = require('../whatsapp');

// GET /api/whatsapp/status
router.get('/status', (req, res) => {
  res.json(wa.getStatus());
});

// POST /api/whatsapp/connect
router.post('/connect', async (req, res) => {
  try {
    wa.initialize(); // fire-and-forget; QR sent via socket
    res.json({ message: 'WhatsApp initialization started. Watch for QR code.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    await wa.disconnect();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/send
router.post('/send', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
  try {
    await wa.sendMessage(phone, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
