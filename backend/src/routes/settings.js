const express = require('express');
const router = express.Router();
const db = require('../database');
const { isDriveConfigured } = require('../googleDrive');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const LOGO_DIR = path.join(__dirname, '..', '..', 'data', 'logos');
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });

const upload = multer({
  dest: LOGO_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// GET /api/settings
router.get('/', (req, res) => {
  const settings = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
  res.json({
    ...(settings || {}),
    drive_configured: isDriveConfigured(),
    logo_url: (settings?.logo_path && fs.existsSync(settings.logo_path)) ? '/api/settings/logo' : null,
  });
});

// GET /api/settings/logo — serve the company logo file
router.get('/logo', (req, res) => {
  const settings = db.prepare('SELECT logo_path FROM company_settings WHERE id=1').get();
  if (!settings?.logo_path || !fs.existsSync(settings.logo_path)) {
    return res.status(404).json({ error: 'No logo uploaded' });
  }
  res.sendFile(settings.logo_path);
});

// PUT /api/settings
router.put('/', (req, res) => {
  const {
    name, address, email, phone, website,
    currency_symbol, tax_rate, payment_terms,
    invoice_prefix, bank_details, primary_color
  } = req.body;

  db.prepare(`
    UPDATE company_settings SET
      name=?, address=?, email=?, phone=?, website=?,
      currency_symbol=?, tax_rate=?, payment_terms=?,
      invoice_prefix=?, bank_details=?, primary_color=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=1
  `).run(
    name, address, email, phone, website,
    currency_symbol, parseFloat(tax_rate) || 0, payment_terms,
    invoice_prefix, bank_details,
    primary_color || '#1a56db'
  );

  res.json({ success: true });
});

// POST /api/settings/logo
router.post('/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = path.extname(req.file.originalname) || '.png';
  const newPath = path.join(LOGO_DIR, `logo${ext}`);
  fs.renameSync(req.file.path, newPath);
  db.prepare("UPDATE company_settings SET logo_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=1")
    .run(newPath);
  res.json({ success: true, logo_path: newPath });
});

module.exports = router;
