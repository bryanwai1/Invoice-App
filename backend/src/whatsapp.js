const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const db = require('./database');
const { parseInvoiceMessage } = require('./messageParser');
const { extractInvoiceFromText, extractRetrievalQuery } = require('./aiParser');
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

// ── Retrieval helpers ─────────────────────────────────────────────────────────

// Returns true when the message is clearly asking to retrieve/resend an invoice
function isRetrievalRequest(text) {
  const t = text.toLowerCase();
  const retrieveWords = ['send me', 'resend', 'retrieve', 'get me', 'find', 'look up',
    'fetch', 'share', 'forward', 'can you send', 'can i get', 'send the invoice',
    'get the invoice', 'find the invoice', 'pull up'];
  const hasRetrieve = retrieveWords.some(w => t.includes(w));
  const hasInvoice  = t.includes('invoice') || t.includes('receipt') || /\bINV-?\d/i.test(text);
  return hasRetrieve && hasInvoice;
}

// Search the SQLite DB for invoices matching the query
function searchInvoicesDB(query, type) {
  const like = `%${query}%`;

  if (type === 'number') {
    const exact = db.prepare('SELECT * FROM invoices WHERE UPPER(invoice_number)=? LIMIT 1').get(query.toUpperCase());
    if (exact) return [exact];
  }

  if (type === 'po') {
    const rows = db.prepare('SELECT * FROM invoices WHERE UPPER(po_number)=? ORDER BY created_at DESC LIMIT 5').all(query.toUpperCase());
    if (rows.length) return rows;
  }

  // Client name fuzzy search
  const byClient = db.prepare(
    'SELECT * FROM invoices WHERE client_name LIKE ? ORDER BY created_at DESC LIMIT 5'
  ).all(like);
  if (byClient.length) return byClient;

  // Invoice number fuzzy
  const byNum = db.prepare(
    'SELECT * FROM invoices WHERE invoice_number LIKE ? ORDER BY created_at DESC LIMIT 5'
  ).all(like);
  if (byNum.length) return byNum;

  // Fallback: any field
  return db.prepare(
    'SELECT * FROM invoices WHERE client_name LIKE ? OR invoice_number LIKE ? OR po_number LIKE ? ORDER BY created_at DESC LIMIT 5'
  ).all(like, like, like);
}

// Ensure the invoice has a PDF on disk; regenerate if missing
async function ensurePDF(invoice) {
  if (invoice.pdf_path && fs.existsSync(invoice.pdf_path)) return invoice.pdf_path;

  // Regenerate
  const { generatePDF } = require('./invoiceGenerator');
  const items   = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(invoice.id);
  const company = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
  const pdfPath = await generatePDF(
    { ...invoice, currency_symbol: company?.currency_symbol || '$' },
    items,
    company || {}
  );
  db.prepare('UPDATE invoices SET pdf_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(pdfPath, invoice.id);
  return pdfPath;
}

// Main retrieval handler — called when the message looks like a retrieval request
async function handleRetrieval(chatId, text) {
  const company = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
  const sym     = company?.currency_symbol || '$';

  // Extract search terms
  const { query, type } = await extractRetrievalQuery(text);
  if (!query) {
    await sendMessage(chatId,
      '🔍 I couldn\'t figure out which invoice you need.\n\n' +
      'Try: _"Send me the invoice for Acme Corp"_ or _"Resend INV-2024-1001"_'
    );
    return;
  }

  const results = searchInvoicesDB(query, type);

  if (!results.length) {
    await sendMessage(chatId,
      `🔍 No invoices found matching *"${query}"*.\n\nDouble-check the client name or invoice number and try again.`
    );
    return;
  }

  // Multiple results — list them and send the most recent one
  if (results.length > 1) {
    const list = results.map((inv, i) =>
      `${i + 1}. *${inv.invoice_number}* — ${inv.client_name} — ${sym}${Number(inv.total).toFixed(2)} — _${inv.status}_`
    ).join('\n');
    await sendMessage(chatId,
      `🔍 Found ${results.length} invoices matching *"${query}"*:\n\n${list}\n\nSending the most recent one now...`
    );
  }

  const invoice = results[0];

  // Check Google Drive link first (fastest — no file needed)
  if (invoice.drive_link) {
    await sendMessage(chatId,
      `📄 *${invoice.invoice_number}*\n` +
      `👤 ${invoice.client_name}\n` +
      `💰 ${sym}${Number(invoice.total).toFixed(2)} — _${invoice.status}_\n\n` +
      `🔗 Google Drive: ${invoice.drive_link}`
    );
    return;
  }

  // Fall back to sending the PDF file directly
  try {
    const pdfPath = await ensurePDF(invoice);
    await sendMessage(chatId,
      `📄 Found it! Sending *${invoice.invoice_number}* for *${invoice.client_name}*...`
    );
    await sendInvoicePDF(chatId, invoice.invoice_number, pdfPath, invoice.client_name);
  } catch (err) {
    console.error('[WhatsApp] Retrieval send failed:', err.message);
    await sendMessage(chatId,
      `⚠️ Found the invoice but couldn't send the PDF: ${err.message}\n\nCheck the web app for the details.`
    );
  }
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

    const settings = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
    const configuredGroup = settings?.group_chat_id;
    const botMode = settings?.bot_mode || 'all'; // 'all' | 'group_only' | 'dm_only'

    // ── Mode gating ──────────────────────────────────────────────────────────
    // Bot completely disabled — ignore everything
    if (botMode === 'off') return;

    if (botMode === 'group_only') {
      // Ignore every DM
      if (!isGroup) return;
      // Once a group is locked, it is IMMOVABLE — only cleared explicitly via UI
      if (configuredGroup && chatId !== configuredGroup) return;
      // No group locked yet — auto-lock to the first group that messages us
      if (!configuredGroup) {
        db.prepare("UPDATE company_settings SET group_chat_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=1")
          .run(chatId);
        console.log('[WhatsApp] Group locked:', chatId);
      }
    } else if (botMode === 'dm_only') {
      // Ignore all group chats — only respond to DMs
      if (isGroup) return;
    } else {
      // 'all' mode — respond everywhere, but honour an existing lock if set
      // IMPORTANT: never auto-save in 'all' mode; only the user sets the lock via UI
      if (isGroup && configuredGroup && chatId !== configuredGroup) return;
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

    // ── Retrieval request — find & resend an existing invoice
    if (isRetrievalRequest(text)) {
      await handleRetrieval(chatId, text);
      return;
    }

    // ── Parse invoice — try structured format first, then AI
    let parsed = parseInvoiceMessage(text, senderPhone);

    const hasAI = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
    if (!parsed && hasAI) {
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
    `*Create an invoice:*\n` +
    `_"Invoice for Acme Corp, web design 1500, hosting 25/month x12, due next month"_\n\n` +
    `*Retrieve & resend an existing invoice:*\n` +
    `_"Send me the invoice for Acme Corp"_\n` +
    `_"Resend INV-2024-1001"_\n` +
    `_"Find the latest invoice for John"_\n\n` +
    `*Commands:* HELP · STATUS`
  );
}

async function initialize() { return getQR(); }
async function disconnect() {
  const { token, configured } = getConfig();
  if (!configured) return;
  try { await axios.get(`${baseUrl()}/logout/${token}`); } catch (_) {}
}

module.exports = { initialize, sendMessage, sendInvoicePDF, getStatus, getQR, disconnect, setIO, handleWebhook };
