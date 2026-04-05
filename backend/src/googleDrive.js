const { google } = require('googleapis');
const fs = require('fs');

// OAuth2 client — used for both auth flow and uploads
function makeOAuth2Client(redirectUri) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || 'https://placeholder.invalid/callback' // redirect URI only needed for auth flow
  );
}

// Generate the Google consent-screen URL
function getAuthUrl(redirectUri) {
  const client = makeOAuth2Client(redirectUri);
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent', // always return refresh_token
  });
}

// Exchange auth code for tokens
async function exchangeCode(code, redirectUri) {
  const client = makeOAuth2Client(redirectUri);
  if (!client) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set');
  const { tokens } = await client.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date }
}

// Upload PDF to Drive using the stored refresh token
async function uploadInvoiceToDrive(invoiceNumber, pdfPath, refreshToken) {
  if (!refreshToken || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
  if (!fs.existsSync(pdfPath)) { console.error('[Drive] PDF not found:', pdfPath); return null; }

  try {
    const auth = makeOAuth2Client();
    auth.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: 'v3', auth });

    const requestBody = { name: `${invoiceNumber}.pdf` };
    if (process.env.GOOGLE_DRIVE_FOLDER_ID) requestBody.parents = [process.env.GOOGLE_DRIVE_FOLDER_ID];

    const file = await drive.files.create({
      requestBody,
      media: { mimeType: 'application/pdf', body: fs.createReadStream(pdfPath) },
      fields: 'id, webViewLink',
    });

    // Make the file viewable by anyone with the link
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    console.log(`[Drive] Uploaded ${invoiceNumber} → ${file.data.webViewLink}`);
    return file.data.webViewLink;
  } catch (err) {
    console.error('[Drive] Upload failed:', err.message);
    return null;
  }
}

function isDriveOAuthConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

module.exports = { getAuthUrl, exchangeCode, uploadInvoiceToDrive, isDriveOAuthConfigured };
