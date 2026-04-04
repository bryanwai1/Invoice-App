const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const db = require('./database');
const { parseInvoiceMessage } = require('./messageParser');
const path = require('path');
const fs = require('fs');

let client = null;
let currentQR = null;
let status = 'disconnected';
let io = null; // Socket.IO instance (injected)

function setIO(socketIO) {
  io = socketIO;
}

function emit(event, data) {
  if (io) io.emit(event, data);
}

function getStatus() {
  return { status, qr: currentQR };
}

async function initialize() {
  if (client) {
    try { await client.destroy(); } catch (_) {}
    client = null;
  }

  status = 'initializing';
  emit('wa:status', { status });

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, '..', 'data', '.wwebjs_auth')
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', async (qr) => {
    status = 'qr_pending';
    qrcode.generate(qr, { small: true });
    try {
      currentQR = await QRCode.toDataURL(qr);
    } catch (_) {
      currentQR = null;
    }
    emit('wa:qr', { qr: currentQR, status });
    console.log('[WhatsApp] QR code generated — scan with your phone');
  });

  client.on('authenticated', () => {
    status = 'authenticated';
    currentQR = null;
    emit('wa:status', { status });
    console.log('[WhatsApp] Authenticated');
  });

  client.on('ready', () => {
    status = 'connected';
    const info = client.info;
    emit('wa:status', { status, phone: info?.wid?.user });
    console.log('[WhatsApp] Ready:', info?.wid?.user);

    db.prepare(`
      INSERT OR REPLACE INTO whatsapp_sessions (id, phone, status, updated_at)
      VALUES (1, ?, 'connected', datetime('now'))
    `).run(info?.wid?.user || 'unknown');
  });

  client.on('disconnected', (reason) => {
    status = 'disconnected';
    emit('wa:status', { status, reason });
    console.log('[WhatsApp] Disconnected:', reason);

    db.prepare(`UPDATE whatsapp_sessions SET status='disconnected', updated_at=datetime('now') WHERE id=1`).run();
  });

  client.on('message', async (message) => {
    await handleIncomingMessage(message);
  });

  await client.initialize();
}

async function handleIncomingMessage(message) {
  const body = message.body?.trim();
  if (!body) return;

  const from = message.from; // e.g. "1234567890@c.us"
  const phone = from.replace('@c.us', '').replace('@g.us', '');

  console.log(`[WhatsApp] Message from ${phone}: ${body.substring(0, 80)}`);

  // Check if this looks like an invoice creation request
  const upperBody = body.toUpperCase();
  const isInvoiceRequest =
    upperBody.startsWith('INVOICE') ||
    upperBody.startsWith('INV:') ||
    upperBody.startsWith('CREATE INVOICE') ||
    upperBody.includes('CLIENT:') ||
    upperBody.includes('ITEM:') ||
    upperBody.includes('PO:') ||
    upperBody.includes('P.O.');

  if (!isInvoiceRequest) {
    // Help message
    if (upperBody === 'HELP' || upperBody === 'HI' || upperBody === 'HELLO') {
      await message.reply(getHelpMessage());
    }
    return;
  }

  try {
    const parsed = parseInvoiceMessage(body, phone);
    if (!parsed) {
      await message.reply(
        '❌ Could not parse your invoice request.\n\n' + getHelpMessage()
      );
      return;
    }

    // Generate invoice
    const { createInvoice } = require('./routes/invoices');
    const invoice = await createInvoice({ ...parsed, source: 'whatsapp', whatsapp_phone: phone });

    const replyMsg =
      `✅ *Invoice Created Successfully!*\n\n` +
      `📄 Invoice #: *${invoice.invoice_number}*\n` +
      `👤 Client: ${invoice.client_name}\n` +
      `💰 Total: ${invoice.currency_symbol}${Number(invoice.total).toFixed(2)}\n` +
      `📅 Due: ${invoice.due_date || 'N/A'}\n\n` +
      `Your invoice PDF is being sent...`;

    await message.reply(replyMsg);

    // Send PDF
    if (invoice.pdf_path && fs.existsSync(invoice.pdf_path)) {
      const media = MessageMedia.fromFilePath(invoice.pdf_path);
      await client.sendMessage(from, media, {
        caption: `Invoice ${invoice.invoice_number} — ${invoice.client_name}`
      });
    }

  } catch (err) {
    console.error('[WhatsApp] Error creating invoice:', err);
    await message.reply('❌ Error creating invoice. Please try again or use the web app.');
  }
}

function getHelpMessage() {
  return (
    `📋 *Invoice App — How to Create an Invoice*\n\n` +
    `Send a message in this format:\n\n` +
    `INVOICE\n` +
    `Client: John Doe\n` +
    `Email: john@example.com\n` +
    `Phone: +1234567890\n` +
    `Address: 123 Main St\n` +
    `PO: PO-2024-001\n` +
    `Due: 2024-03-15\n` +
    `Item: Web Design x1 @ 500\n` +
    `Item: Hosting x12 @ 10\n` +
    `Tax: 10\n` +
    `Discount: 50\n` +
    `Notes: Payment due within 30 days\n\n` +
    `You'll receive your PDF invoice automatically! 🚀`
  );
}

async function sendMessage(phone, message) {
  if (!client || status !== 'connected') {
    throw new Error('WhatsApp not connected');
  }
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  return client.sendMessage(chatId, message);
}

async function sendInvoicePDF(phone, invoiceNumber, pdfPath, clientName) {
  if (!client || status !== 'connected') {
    throw new Error('WhatsApp not connected');
  }
  if (!fs.existsSync(pdfPath)) {
    throw new Error('PDF file not found');
  }
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  const media = MessageMedia.fromFilePath(pdfPath);
  await client.sendMessage(chatId, media, {
    caption: `📄 Invoice ${invoiceNumber} — ${clientName}\nThank you for your business!`
  });
}

async function disconnect() {
  if (client) {
    await client.destroy();
    client = null;
    status = 'disconnected';
    currentQR = null;
  }
}

module.exports = { initialize, sendMessage, sendInvoicePDF, getStatus, disconnect, setIO };
