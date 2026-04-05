const express = require('express');
const router = express.Router();
const db = require('../database');
const { getAuthUrl, exchangeCode, isDriveOAuthConfigured } = require('../googleDrive');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PERSIST_DIR = process.env.PERSIST_DIR || path.join(__dirname, '..', '..', 'data');
const LOGO_DIR = path.join(PERSIST_DIR, 'logos');
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });

const upload = multer({
  dest: LOGO_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG, SVG or WebP allowed'));
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
    header_layout: settings?.header_layout ? JSON.parse(settings.header_layout) : null,
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

// Build the exact redirect URI (must match Google Cloud Console exactly)
function getRedirectUri(req) {
  // Use BACKEND_URL env var if set, otherwise derive from request (may be http on Render proxy)
  const base = process.env.BACKEND_URL
    || `https://${req.get('host')}`;
  return `${base}/api/settings/drive-callback`;
}

// GET /api/settings/drive-auth — redirect user to Google consent screen
router.get('/drive-auth', (req, res) => {
  if (!isDriveOAuthConfigured()) {
    return res.status(500).send('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in Render environment.');
  }
  const redirectUri = getRedirectUri(req);
  const url = getAuthUrl(redirectUri);
  res.redirect(url);
});

// GET /api/settings/drive-callback — Google redirects here after user consents
router.get('/drive-callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`Google auth error: ${error}`);
  if (!code) return res.status(400).send('No authorization code received.');

  try {
    const redirectUri = getRedirectUri(req);
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
    invoice_prefix, bank_details, primary_color,
    template_style, logo_position, header_layout
  } = req.body;

  db.prepare(`
    UPDATE company_settings SET
      name=?, address=?, email=?, phone=?, website=?,
      currency_symbol=?, tax_rate=?, payment_terms=?,
      invoice_prefix=?, bank_details=?, primary_color=?,
      template_style=?, logo_position=?, header_layout=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=1
  `).run(
    name, address, email, phone, website,
    currency_symbol, parseFloat(tax_rate) || 0, payment_terms,
    invoice_prefix, bank_details,
    primary_color || '#1a56db',
    template_style || 'classic',
    logo_position || 'left',
    header_layout ? JSON.stringify(header_layout) : null
  );

  res.json({ success: true });
});

// POST /api/settings/logo
router.post('/logo', upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const isSVG = req.file.mimetype === 'image/svg+xml';
    const finalPath = path.join(LOGO_DIR, 'logo.png');

    if (isSVG) {
      // Convert SVG → PNG so PDFKit can render it
      const sharp = require('sharp');
      await sharp(req.file.path).png().toFile(finalPath);
      fs.unlinkSync(req.file.path);
    } else {
      // Resize/optimise to max 400px wide, keep PNG
      const sharp = require('sharp');
      await sharp(req.file.path).resize({ width: 400, withoutEnlargement: true }).png().toFile(finalPath);
      fs.unlinkSync(req.file.path);
    }

    db.prepare("UPDATE company_settings SET logo_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=1")
      .run(finalPath);
    res.json({ success: true, logo_path: finalPath });
  } catch (err) {
    console.error('[Logo] Upload error:', err.message);
    res.status(500).json({ error: 'Logo processing failed: ' + err.message });
  }
});

module.exports = router;
