const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const db = require('./database');
const { parseInvoiceMessage } = require('./messageParser');
const { extractInvoiceFromText } = require('./aiParser');
const { transcribeAudio } = require('./voiceTranscriber');

let io = null;
function setIO(socketIO) { io = socketIO; }
function emit(event, data) { if (io) io.emit(event, data); }

function getConfig() {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  return { instanceId, token, configured: !!(instanceId && token) };
}

function baseUrl() {
  return `https://api.green-api.com/waInstance${getConfig().instanceId}`;
}

async function getStatus() {
  const { token, configured } = getConfig();
  if (!configured) return { status: 'not_configured' };
  try {
    const res = await axios.get(`${baseUrl()}/getStateInstance/${token}`, { timeout: 8000 });
    const state = res.data.stateInstance;
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
    if (res.data.type === 'qrCode') {
      emit('wa:qr', { qr: res.data.message, status: 'qr_pending' });
      return res.data.message;
    }
    if (res.data.type === 'alreadyLogged') {
      emit('wa:status', { status: 'connected' });
    }
    return null;
  } catch { return null; }
}

async function sendMessage(chatId, message) {
  const { token } = getConfig();
  const id = chatId.includes('@') ? chatId : `${chatId}@c.us`;
  await axios.post(`${baseUrl()}/sendMessage/${token}`, { chatId: id, message });
}

async function sendInvoicePDF(phone, invoiceNumber, pdfPath, clientName) {
  const { token } = getConfig();
  if (!fs.existsSync(pdfPath)) throw new Error('PDF not found');
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;

  const form = new FormData();
  form.append('chatId', chatId);
  form.append('caption', `Invoice ${invoiceNumber} — ${clientName}\nThank you for your business!`);
  form.append('file', fs.createReadStream(pdfPath), {
    filename: `${invoiceNumber}.pdf`,
    contentType: 'application/pdf'
  });
  await axios.post(`${baseUrl()}/sendFileByUpload/${token}`, form, {
    headers: form.getHeaders(), timeout: 30000
  });
}

// ── Main webhook handler
async function handleWebhook(body) {
  try {
    const { typeWebhook } = body;

    // Process incoming messages AND manually-sent outgoing messages
    // Ignore API-sent messages (bot's own replies) to avoid loops
    const allowed = ['incomingMessageReceived', 'outgoingMessageReceived'];
    if (!allowed.includes(typeWebhook)) return;
    if (typeWebhook === 'outgoingAPIMessageReceived') return;

    const msgType = body.messageData?.typeMessage;
    const chatId = body.senderData?.chatId;   // group: @g.us | direct: @c.us
    const sender = body.senderData?.sender;   // actual person's number
    const senderPhone = sender?.replace('@c.us', '');
    const isGroup = chatId?.endsWith('@g.us');

    // Get configured group ID from DB settings (optional filter)
    const settings = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
    const configuredGroup = settings?.group_chat_id;

    // If a group is configured, only process messages from that group
    if (isGroup && configuredGroup && chatId !== configuredGroup) return;

    // Auto-save group ID on first group message if not configured yet
    if (isGroup && !configuredGroup) {
      db.prepare("UPDATE company_settings SET group_chat_id=?, updated_at=datetime('now') WHERE id=1")
        .run(chatId);
      console.log('[WhatsApp] Group ID auto-saved:', chatId);
    }

    let text = null;

    // ── Text / extended text message
    if (msgType === 'textMessage') {
      text = body.messageData.textMessageData?.textMessage?.trim();
    } else if (msgType === 'extendedTextMessage') {
      text = body.messageData.extendedTextMessageData?.text?.trim();
    }

    // ── Voice / audio message → transcribe
    else if (msgType === 'audioMessage' || msgType === 'pttMessage') {
      const fileData = body.messageData.fileMessageData;
      const downloadUrl = fileData?.downloadUrl;
      if (downloadUrl) {
        await sendMessage(chatId, '🎤 Got your voice message! Transcribing...');
        text = await transcribeAudio(downloadUrl, getConfig().token);
        if (text) {
          await sendMessage(chatId, `📝 Transcribed: "${text}"\n\nProcessing invoice...`);
        } else {
          await sendMessage(chatId, '❌ Could not transcribe voice message. Please type the invoice details instead.');
          return;
        }
      }
    }

    // ── Document / PO file
    else if (msgType === 'documentMessage') {
      const caption = body.messageData.fileMessageData?.caption?.trim();
      if (caption) {
        text = caption;
        await sendMessage(chatId, `📎 Got your document. Processing invoice from caption...`);
      } else {
        await sendMessage(chatId, `📎 Document received! Please include invoice details in the caption, or type them in the chat.`);
        return;
      }
    }

    if (!text) return;

    console.log(`[WhatsApp] ${isGroup ? 'Group' : 'DM'} message from ${senderPhone}: ${text.substring(0, 80)}`);

    const upper = text.toUpperCase();

    // Help command
    if (upper === 'HELP' || upper === 'HI' || upper === 'HELLO') {
      await sendMessage(chatId, getHelpMessage());
      return;
    }

    // Quick status check
    if (upper === 'STATUS' || upper === 'INVOICES') {
      const stats = {
        total: db.prepare('SELECT COUNT(*) as c FROM invoices').get().c,
        pending: db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status='pending'").get().c,
        paid: db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status='paid'").get().c,
      };
      await sendMessage(chatId,
        `📊 *Invoice Summary*\n\n` +
        `Total: ${stats.total}\nPending: ${stats.pending}\nPaid: ${stats.paid}`
      );
      return;
    }

    // ── Parse invoice — try structured format first, then AI
    let parsed = parseInvoiceMessage(text, senderPhone);

    if (!parsed && process.env.ANTHROPIC_API_KEY) {
      console.log('[WhatsApp] Falling back to AI parser...');
      parsed = await extractInvoiceFromText(text, senderPhone);
    }

    if (!parsed) {
      // Only reply if it looks like an invoice attempt
      const looksLikeInvoice = upper.includes('INVOICE') || upper.includes('CLIENT') ||
        upper.includes('ITEM') || upper.includes('PO') || upper.includes('BILL');
      if (looksLikeInvoice) {
        await sendMessage(chatId, '❌ Could not extract invoice details.\n\n' + getHelpMessage());
      }
      return;
    }

    await sendMessage(chatId, `⏳ Creating invoice for *${parsed.client_name}*...`);

    try {
      const { createInvoice } = require('./routes/invoices');
      const invoice = await createInvoice({ ...parsed, source: 'whatsapp', whatsapp_phone: senderPhone });

      const company = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
      const sym = company?.currency_symbol || '$';

      await sendMessage(chatId,
        `✅ *Invoice Created!*\n\n` +
        `📄 #${invoice.invoice_number}\n` +
        `👤 ${invoice.client_name}\n` +
        `💰 Total: ${sym}${Number(invoice.total).toFixed(2)}\n` +
        `📅 Due: ${invoice.due_date || 'N/A'}\n\n` +
        `Sending PDF...`
      );

      if (invoice.pdf_path && fs.existsSync(invoice.pdf_path)) {
        await sendInvoicePDF(chatId, invoice.invoice_number, invoice.pdf_path, invoice.client_name);
      } else {
        console.error('[WhatsApp] PDF not found at:', invoice.pdf_path);
        await sendMessage(chatId, '⚠️ Invoice created but PDF generation failed. Check the web app.');
      }
    } catch (invoiceErr) {
      console.error('[WhatsApp] Invoice creation failed:', invoiceErr.message);
      console.error(invoiceErr.stack);
      await sendMessage(chatId, `❌ Invoice creation failed: ${invoiceErr.message}`);
    }

  } catch (err) {
    console.error('[WhatsApp] Webhook error:', err.message);
  }
}

function getHelpMessage() {
  return (
    `📋 *Invoice App — Voice or Type*\n\n` +
    `You can speak or type naturally, for example:\n\n` +
    `_"Create invoice for John Doe, web design 1500, hosting 12 months at 25 each, due next month"_\n\n` +
    `Or use the structured format:\n` +
    `INVOICE\nClient: John Doe\nItem: Web Design x1 @ 1500\nDue: 2024-05-01\n\n` +
    `Commands: HELP · STATUS`
  );
}

async function initialize() { return getQR(); }
async function disconnect() {
  const { token, configured } = getConfig();
  if (!configured) return;
  try { await axios.get(`${baseUrl()}/logout/${token}`); } catch (_) {}
}

module.exports = { initialize, sendMessage, sendInvoicePDF, getStatus, getQR, disconnect, setIO, handleWebhook };
