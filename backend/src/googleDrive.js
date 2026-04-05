const { google } = require('googleapis');
const fs = require('fs');

function isDriveConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_FOLDER_ID);
}

function getDriveClient() {
  if (!isDriveConfigured()) return null;
  try {
    const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    return { drive: google.drive({ version: 'v3', auth }), folderId: process.env.GOOGLE_DRIVE_FOLDER_ID };
  } catch (err) {
    console.error('[Drive] Failed to init client:', err.message);
    return null;
  }
}

/**
 * Upload a PDF to the configured Google Drive folder.
 * Returns the public view link, or null if Drive is not configured / upload fails.
 */
async function uploadInvoiceToDrive(invoiceNumber, pdfPath) {
  const client = getDriveClient();
  if (!client) return null;
  if (!fs.existsSync(pdfPath)) { console.error('[Drive] PDF not found:', pdfPath); return null; }

  try {
    const { drive, folderId } = client;

    const file = await drive.files.create({
      requestBody: { name: `${invoiceNumber}.pdf`, parents: [folderId] },
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

module.exports = { uploadInvoiceToDrive, isDriveConfigured };
