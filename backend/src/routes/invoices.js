const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { generatePDF, PDF_DIR } = require('../invoiceGenerator');
const { sendInvoicePDF } = require('../whatsapp');
const { uploadInvoiceToDrive } = require('../googleDrive');
const path = require('path');
const fs = require('fs');

// ── Helper: generate invoice number
function nextInvoiceNumber() {
  const settings = db.prepare('SELECT invoice_prefix, next_invoice_number FROM company_settings WHERE id=1').get();
  const prefix = settings?.invoice_prefix || 'INV';
  const num = settings?.next_invoice_number || 1000;
  db.prepare("UPDATE company_settings SET next_invoice_number=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").run(num + 1);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(num).padStart(4, '0')}`;
}

// ── Helper: calculate totals
function calcTotals(items, taxRate, discount) {
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const discountAmt = parseFloat(discount) || 0;
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * ((parseFloat(taxRate) || 0) / 100);
  const total = taxable + taxAmt;
  return { subtotal, tax_amount: taxAmt, total };
}

// ── Shared invoice creation logic (used by API + WhatsApp)
async function createInvoice(data) {
  const {
    client_name, client_email = '', client_phone = '', client_address = '',
    po_number = '', issue_date, due_date = '', notes = '', payment_terms = 'Net 30',
    currency = 'USD', source = 'manual', whatsapp_phone = '',
    items = [], tax_rate = 0, discount = 0, status = 'pending'
  } = data;

  const id = uuidv4();
  const invoice_number = nextInvoiceNumber();

  // Validate items
  const validItems = (items || []).map(item => ({
    description: item.description,
    quantity: parseFloat(item.quantity) || 1,
    unit_price: parseFloat(item.unit_price) || 0,
    amount: parseFloat(item.amount) || (parseFloat(item.quantity) * parseFloat(item.unit_price))
  }));

  const { subtotal, tax_amount, total } = calcTotals(validItems, tax_rate, discount);
  const company = db.prepare('SELECT * FROM company_settings WHERE id=1').get();

  // Insert invoice
  db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, status, client_name, client_email, client_phone,
      client_address, po_number, issue_date, due_date, subtotal, tax_rate,
      tax_amount, discount, total, notes, payment_terms, currency, source, whatsapp_phone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, invoice_number, status, client_name, client_email, client_phone,
    client_address, po_number, issue_date || new Date().toISOString().split('T')[0],
    due_date, subtotal, tax_rate, tax_amount, discount, total,
    notes, payment_terms, currency, source, whatsapp_phone
  );

  // Insert items
  const insertItem = db.prepare(`
    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const item of validItems) {
    insertItem.run(id, item.description, item.quantity, item.unit_price, item.amount);
  }

  // Generate PDF
  const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  const pdfPath = await generatePDF(
    { ...invoice, currency_symbol: company?.currency_symbol || '$' },
    validItems,
    company || {}
  );

  // Upload to Google Drive using stored OAuth refresh token
  const driveLink = await uploadInvoiceToDrive(invoice_number, pdfPath, company?.google_refresh_token).catch(() => null);

  db.prepare('UPDATE invoices SET pdf_path=?, drive_link=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(pdfPath, driveLink || null, id);

  return {
    ...invoice,
    pdf_path: pdfPath,
    drive_link: driveLink,
    currency_symbol: company?.currency_symbol || '$'
  };
}

// ── GET /api/invoices — list all
router.get('/', (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  let query = 'SELECT * FROM invoices WHERE 1=1';
  const params = [];

  if (status) { query += ' AND status=?'; params.push(status); }
  if (search) {
    query += ' AND (client_name LIKE ? OR invoice_number LIKE ? OR po_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const total = db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as c')).get(...params)?.c || 0;
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const invoices = db.prepare(query).all(...params);
  res.json({ invoices, total, page: parseInt(page), limit: parseInt(limit) });
});

// ── GET /api/invoices/stats
router.get('/stats', (req, res) => {
  const stats = {
    total: db.prepare('SELECT COUNT(*) as c FROM invoices').get().c,
    pending: db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status='pending'").get().c,
    paid: db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status='paid'").get().c,
    overdue: db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status='overdue'").get().c,
    draft: db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status='draft'").get().c,
    totalRevenue: db.prepare("SELECT COALESCE(SUM(total),0) as s FROM invoices WHERE status='paid'").get().s,
    pendingAmount: db.prepare("SELECT COALESCE(SUM(total),0) as s FROM invoices WHERE status='pending'").get().s,
  };
  res.json(stats);
});

// ── GET /api/invoices/:id
router.get('/:id', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(req.params.id);
  const company = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
  res.json({ ...invoice, items, company });
});

// ── POST /api/invoices
router.post('/', async (req, res) => {
  try {
    const invoice = await createInvoice(req.body);
    res.status(201).json(invoice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoices/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    const {
      client_name, client_email, client_phone, client_address,
      po_number, issue_date, due_date, notes, payment_terms,
      items, tax_rate, discount, status
    } = req.body;

    const validItems = (items || []).map(item => ({
      description: item.description,
      quantity: parseFloat(item.quantity) || 1,
      unit_price: parseFloat(item.unit_price) || 0,
      amount: parseFloat(item.amount) || (parseFloat(item.quantity) * parseFloat(item.unit_price))
    }));

    const { subtotal, tax_amount, total } = calcTotals(validItems, tax_rate, discount);

    db.prepare(`
      UPDATE invoices SET
        client_name=?, client_email=?, client_phone=?, client_address=?,
        po_number=?, issue_date=?, due_date=?, subtotal=?, tax_rate=?,
        tax_amount=?, discount=?, total=?, notes=?, payment_terms=?,
        status=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      client_name, client_email, client_phone, client_address,
      po_number, issue_date, due_date, subtotal, tax_rate,
      tax_amount, discount, total, notes, payment_terms,
      status || existing.status, id
    );

    // Replace items
    db.prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(id);
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of validItems) {
      insertItem.run(id, item.description, item.quantity, item.unit_price, item.amount);
    }

    // Regenerate PDF
    const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    const company = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
    const pdfPath = await generatePDF(
      { ...invoice, currency_symbol: company?.currency_symbol || '$' },
      validItems,
      company || {}
    );
    db.prepare('UPDATE invoices SET pdf_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(pdfPath, id);

    res.json({ ...invoice, pdf_path: pdfPath, items: validItems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/invoices/:id/status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const valid = ['draft', 'pending', 'paid', 'overdue', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare("UPDATE invoices SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(status, req.params.id);
  res.json({ success: true });
});

// ── DELETE /api/invoices/:id
router.delete('/:id', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  if (invoice.pdf_path && fs.existsSync(invoice.pdf_path)) {
    fs.unlinkSync(invoice.pdf_path);
  }
  db.prepare('DELETE FROM invoices WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── GET /api/invoices/:id/download
router.get('/:id/download', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  if (!invoice.pdf_path || !fs.existsSync(invoice.pdf_path)) {
    return res.status(404).json({ error: 'PDF not found' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
  fs.createReadStream(invoice.pdf_path).pipe(res);
});

// ── POST /api/invoices/:id/send-whatsapp
router.post('/:id/send-whatsapp', async (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });

    const phone = req.body.phone || invoice.whatsapp_phone || invoice.client_phone;
    if (!phone) return res.status(400).json({ error: 'No phone number specified' });

    if (!invoice.pdf_path || !fs.existsSync(invoice.pdf_path)) {
      return res.status(404).json({ error: 'PDF not generated yet' });
    }

    await sendInvoicePDF(phone, invoice.invoice_number, invoice.pdf_path, invoice.client_name);

    // Update status to pending if draft
    if (invoice.status === 'draft') {
      db.prepare("UPDATE invoices SET status='pending', updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(invoice.id);
    }

    res.json({ success: true, message: `Invoice sent to ${phone}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/:id/regenerate-pdf
router.post('/:id/regenerate-pdf', async (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(req.params.id);
    const company = db.prepare('SELECT * FROM company_settings WHERE id=1').get();
    const pdfPath = await generatePDF(
      { ...invoice, currency_symbol: company?.currency_symbol || '$' },
      items,
      company || {}
    );
    const driveLink = await uploadInvoiceToDrive(invoice.invoice_number, pdfPath, company?.google_refresh_token).catch(() => null);
    db.prepare('UPDATE invoices SET pdf_path=?, drive_link=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(pdfPath, driveLink || null, invoice.id);
    res.json({ success: true, pdf_path: pdfPath, drive_link: driveLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.createInvoice = createInvoice;
