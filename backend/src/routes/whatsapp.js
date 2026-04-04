const express = require('express');
const router = express.Router();
const wa = require('../whatsapp');

// GET /api/whatsapp/status
router.get('/status', async (req, res) => {
  const status = await wa.getStatus();
  res.json(status);
});

// GET /api/whatsapp/qr
router.get('/qr', async (req, res) => {
  const qr = await wa.getQR();
  res.json({ qr });
});

// POST /api/whatsapp/connect  (fetch QR)
router.post('/connect', async (req, res) => {
  try {
    const qr = await wa.getQR();
    const status = await wa.getStatus();
    res.json({ ...status, qr });
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

// POST /api/whatsapp/webhook  ← Green API sends incoming messages here
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately
  await wa.handleWebhook(req.body);
});

module.exports = router;
