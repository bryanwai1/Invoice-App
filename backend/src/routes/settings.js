const express = require('express');
const router = express.Router();
const db = require('../database');
const { getAuthUrl, exchangeCode, isDriveOAuthConfigured } = require('../googleDrive');
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
    drive_oauth_configured: isDriveOAuthConfigured(),
    drive_connected: !!(settings?.google_refresh_token),
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

// GET /api/settings/drive-auth — redirect user to Google consent screen
router.get('/drive-auth', (req, res) => {
  if (!isDriveOAuthConfigured()) {
    return res.status(500).send('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in Render environment.');
  }
  const redirectUri = `${req.protocol}://${req.get('host')}/api/settings/drive-callback`;
  const url = getAuthUrl(redirectUri);
  res.redirect(url);
});

// GET /api/settings/drive-callback — Google redirects here after user consents
router.get('/drive-callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`Google auth error: ${error}`);
  if (!code) return res.status(400).send('No authorization code received.');

  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/settings/drive-callback`;
    const tokens = await exchangeCode(code, redirectUri);

    if (!tokens.refresh_token) {
      return res.send(`
        <p>⚠️ No refresh token received.</p>
        <p>Go to <a href="https://myaccount.google.com/permissions">Google Account Permissions</a>,
        remove "<strong>InvoiceApp</strong>" access, then
        <a href="/api/settings/drive-auth">try connecting again</a>.</p>
      `);
    }

    db.prepare('UPDATE company_settings SET google_refresh_token=?, updated_at=CURRENT_TIMESTAMP WHERE id=1')
      .run(tokens.refresh_token);

    // Redirect back to frontend settings page
    const frontendUrl = process.env.FRONTEND_URL || '';
    const base = frontendUrl.startsWith('http') ? frontendUrl : `https://${frontendUrl}`;
    res.redirect(`${base}/settings?drive=connected`);
  } catch (err) {
    console.error('[Drive] OAuth callback error:', err.message);
    res.status(500).send(`OAuth error: ${err.message}`);
  }
});

// POST /api/settings/drive-disconnect
router.post('/drive-disconnect', (req, res) => {
  db.prepare('UPDATE company_settings SET google_refresh_token=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=1').run();
  res.json({ success: true });
});

// GET /api/settings/drive-test
router.get('/drive-test', async (req, res) => {
  const settings = db.prepare('SELECT google_refresh_token FROM company_settings WHERE id=1').get();
  if (!isDriveOAuthConfigured()) return res.json({ ok: false, error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set' });
  if (!settings?.google_refresh_token) return res.json({ ok: false, error: 'Not connected — click Connect Google Drive in Settings' });

  try {
    const { google } = require('googleapis');
    const { makeOAuth2Client } = require('../googleDrive');
    // Use a quick files.list to verify token works
    const { GoogleAuth } = require('google-auth-library');
    const { uploadInvoiceToDrive } = require('../googleDrive');

    // Write a tiny temp file and upload it
    const tmpPath = path.join(__dirname, '..', '..', 'data', '_drive_test.txt');
    fs.writeFileSync(tmpPath, `Drive test ${new Date().toISOString()}`);
    const link = await uploadInvoiceToDrive('_drive_test', tmpPath, settings.google_refresh_token);
    fs.unlinkSync(tmpPath);

    if (link) return res.json({ ok: true, test_link: link });
    return res.json({ ok: false, error: 'Upload returned null — check Render logs for [Drive] error' });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
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
