const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const db = require('./database');
const { parseInvoiceMessage } = require('./messageParser');

let io = null;

function setIO(socketIO) { io = socketIO; }
function emit(event, data) { if (io) io.emit(event, data); }

function getConfig() {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  return { instanceId, token, configured: !!(instanceId && token) };
}

function baseUrl() {
  const { instanceId } = getConfig();
  return `https://api.green-api.com/waInstance${instanceId}`;
}

async function getStatus() {
  const { token, configured } = getConfig();
  if (!configured) return { status: 'not_configured' };
  try {
    const res = await axios.get(`${baseUrl()}/getStateInstance/${token}`, { timeout: 8000 });
    const state = res.data.stateInstance; // 'authorized' | 'notAuthorized' | 'blocked'
    const status = state === 'authorized' ? 'connected' : 'disconnected';
    emit('wa:status', { status });
    return { status };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function getQR() {
  const { token, configured } = getConfig();
  if (!configured) return null;
  try {
    const res = await axios.get(`${baseUrl()}/qr/${token}`, { timeout: 10000 });
    // Returns { type: 'qrCode', message: 'data:image/png;base64,...' }
    if (res.data.type === 'qrCode') {
      emit('wa:qr', { qr: res.data.message, status: 'qr_pending' });
      return res.data.message;
    }
    if (res.data.type === 'alreadyLogged') {
      emit('wa:status', { status: 'connected' });
      return null;
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function sendMessage(phone, message) {
  const { token } = getConfig();
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  await axios.post(`${baseUrl()}/sendMessage/${token}`, { chatId, message });
}

async function sendInvoicePDF(phone, invoiceNumber, pdfPath, clientName) {
  const { token } = getConfig();
  if (!fs.existsSync(pdfPath)) throw new Error('PDF file not found');
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;

  const form = new FormData();
  form.append('chatId', chatId);
  form.append('caption', `Invoice ${invoiceNumber} — ${clientName}\nThank you for your business!`);
  form.append('file', fs.createReadStream(pdfPath), {
    filename: `${invoiceNumber}.pdf`,
    contentType: 'application/pdf'
  });

  await axios.post(`${baseUrl()}/sendFileByUpload/${token}`, form, {
    headers: form.getHeaders(),
    timeout: 30000
  });
}

// Called by the /api/whatsapp/webhook POST route
async function handleWebhook(body) {
  try {
    if (body.typeWebhook !== 'incomingMessageReceived') return;
    if (body.messageData?.typeMessage !== 'textMessage') return;

    const text = body.messageData?.textMessageData?.textMessage?.trim();
    const from = body.senderData?.sender; // e.g. "60123456789@c.us"
    const phone = from?.replace('@c.us', '').replace('@g.us', '');

    if (!text || !phone) return;

    console.log(`[WhatsApp] Message from ${phone}: ${text.substring(0, 80)}`);

    const upper = text.toUpperCase();

    // Help message
    if (upper === 'HELP' || upper === 'HI' || upper === 'HELLO') {
      await sendMessage(phone, getHelpMessage());
      return;
    }

    // Invoice creation
    const isInvoice = upper.startsWith('INVOICE') || upper.startsWith('INV:') ||
      upper.includes('CLIENT:') || upper.includes('ITEM:') ||
      upper.includes('PO:') || upper.includes('P.O.');

    if (!isInvoice) return;

    const parsed = parseInvoiceMessage(text, phone);
    if (!parsed) {
      await sendMessage(phone, '❌ Could not parse invoice.\n\n' + getHelpMessage());
      return;
    }

    const { createInvoice } = require('./routes/invoices');
    const invoice = await createInvoice({ ...parsed, source: 'whatsapp', whatsapp_phone: phone });

    const company = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
    const sym = company?.currency_symbol || '$';

    await sendMessage(phone,
      `✅ *Invoice Created!*\n\n` +
      `📄 #${invoice.invoice_number}\n` +
      `👤 ${invoice.client_name}\n` +
      `💰 Total: ${sym}${Number(invoice.total).toFixed(2)}\n` +
      `📅 Due: ${invoice.due_date || 'N/A'}\n\n` +
      `Sending your PDF now...`
    );

    if (invoice.pdf_path && fs.existsSync(invoice.pdf_path)) {
      await sendInvoicePDF(phone, invoice.invoice_number, invoice.pdf_path, invoice.client_name);
    }
  } catch (err) {
    console.error('[WhatsApp] Webhook error:', err.message);
  }
}

function getHelpMessage() {
  return (
    `📋 *Invoice App — How to Create an Invoice*\n\n` +
    `Send a message like:\n\n` +
    `INVOICE\nClient: John Doe\nEmail: john@example.com\n` +
    `Phone: +1234567890\nPO: PO-2024-001\nDue: 2024-03-15\n` +
    `Item: Web Design x1 @ 500\nItem: Hosting x12 @ 10\n` +
    `Tax: 10\nNotes: Payment in 30 days\n\n` +
    `You'll receive your PDF invoice automatically! 🚀`
  );
}

// Legacy stubs (used by routes)
async function initialize() { return getQR(); }
async function disconnect() {
  // Green API logout
  const { token, configured } = getConfig();
  if (!configured) return;
  try {
    await axios.get(`${baseUrl()}/logout/${token}`);
  } catch (_) {}
}

module.exports = { initialize, sendMessage, sendInvoicePDF, getStatus, getQR, disconnect, setIO, handleWebhook };
