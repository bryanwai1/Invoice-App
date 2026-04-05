const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const PERSIST_DIR = process.env.PERSIST_DIR || path.join(__dirname, '..', 'data');
const PDF_DIR = path.join(PERSIST_DIR, 'pdfs');
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function logoX(position, logoW, pageW, margin) {
  if (position === 'center') return (pageW - logoW) / 2;
  if (position === 'right')  return pageW - margin - logoW;
  return margin; // left (default)
}

function drawLogo(doc, company, x, y, maxH = 60) {
  if (!company.logo_path || !fs.existsSync(company.logo_path)) return 0;
  try {
    const img = doc.openImage(company.logo_path);
    const scale = Math.min(1, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    doc.image(company.logo_path, x, y, { width: w, height: h });
    return h;
  } catch { return 0; }
}

function statusColor(status) {
  return { paid: '#059669', pending: '#d97706', overdue: '#dc2626', draft: '#6b7280' }[status] || '#6b7280';
}

function drawTotals(doc, invoice, company, x, y) {
  const sym = company.currency_symbol || '$';
  const primary = company.primary_color || '#1a56db';
  const w = 175;

  const row = (label, value, highlight) => {
    if (highlight) {
      doc.rect(x - 10, y - 4, w, 22).fill(primary);
      doc.fontSize(11).fillColor('#fff').font('Helvetica-Bold')
        .text(label, x, y, { width: 80 })
        .text(value, x + 80, y, { width: 85, align: 'right' });
      y += 24;
    } else {
      doc.fontSize(9).fillColor('#6b7280').font('Helvetica')
        .text(label, x, y, { width: 80 })
        .text(value, x + 80, y, { width: 85, align: 'right' });
      doc.strokeColor('#e5e7eb').lineWidth(0.5)
        .moveTo(x - 10, y + 14).lineTo(x + w - 10, y + 14).stroke();
      y += 18;
    }
    return y;
  };

  y = row('Subtotal', `${sym}${Number(invoice.subtotal).toFixed(2)}`);
  if (invoice.discount > 0) y = row('Discount', `-${sym}${Number(invoice.discount).toFixed(2)}`);
  if (invoice.tax_rate > 0)  y = row(`Tax (${invoice.tax_rate}%)`, `${sym}${Number(invoice.tax_amount).toFixed(2)}`);
  row('TOTAL', `${sym}${Number(invoice.total).toFixed(2)}`, true);
}

function drawItemsTable(doc, items, company, startY) {
  const primary = company.primary_color || '#1a56db';
  const sym = company.currency_symbol || '$';
  const pageW = doc.page.width;
  const margin = 50;
  const tableW = pageW - margin * 2;
  const cols = { desc: margin, qty: margin + 240, price: margin + 310, amount: margin + 390 };

  // Header
  doc.rect(margin, startY, tableW, 22).fill(primary);
  doc.fontSize(9).fillColor('#fff').font('Helvetica-Bold')
    .text('DESCRIPTION', cols.desc + 6, startY + 7)
    .text('QTY',        cols.qty,   startY + 7, { width: 60, align: 'center' })
    .text('UNIT PRICE', cols.price, startY + 7, { width: 80, align: 'right' })
    .text('AMOUNT',     cols.amount,startY + 7, { width: 95, align: 'right' });

  let rowY = startY + 22;
  items.forEach((item, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
    doc.rect(margin, rowY, tableW, 24).fill(bg);
    doc.strokeColor('#e5e7eb').lineWidth(0.5)
      .moveTo(margin, rowY + 24).lineTo(margin + tableW, rowY + 24).stroke();
    doc.fontSize(9).fillColor('#111827').font('Helvetica')
      .text(item.description,                   cols.desc + 6, rowY + 8, { width: 225 })
      .text(String(item.quantity),              cols.qty,      rowY + 8, { width: 60, align: 'center' })
      .text(`${sym}${Number(item.unit_price).toFixed(2)}`, cols.price, rowY + 8, { width: 80, align: 'right' })
      .text(`${sym}${Number(item.amount).toFixed(2)}`,     cols.amount,rowY + 8, { width: 95, align: 'right' });
    rowY += 24;
  });

  return rowY;
}

function drawFooter(doc, invoice, company) {
  const pageW = doc.page.width;
  const y = doc.page.height - 50;
  doc.rect(0, y - 10, pageW, 60).fill('#f9fafb');
  doc.strokeColor(company.primary_color || '#1a56db').lineWidth(2)
    .moveTo(0, y - 10).lineTo(pageW, y - 10).stroke();
  doc.fontSize(8).fillColor('#6b7280').font('Helvetica')
    .text(`Thank you for your business! · ${company.name}`, 50, y, { align: 'center', width: pageW - 100 });
  if (invoice.payment_terms || company.payment_terms) {
    doc.text(`Payment Terms: ${invoice.payment_terms || company.payment_terms}`, 50, y + 12,
      { align: 'center', width: pageW - 100 });
  }
}

// ── Template: Classic ─────────────────────────────────────────────────────────

// Estimate rendered line count for a string at a given font size and column width
function estimateLines(text, fontSize, colWidth) {
  const avgCharW = fontSize * 0.52; // Helvetica average
  const charsPerLine = Math.max(1, Math.floor(colWidth / avgCharW));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

// Resolve company name font size — 'auto' shrinks for long names
function resolveNameFontSize(name, sizeKey) {
  const map = { sm: 11, md: 16, lg: 22 };
  if (sizeKey && sizeKey !== 'auto') return map[sizeKey] || 22;
  const len = (name || '').length;
  if (len <= 18) return 22;
  if (len <= 28) return 17;
  if (len <= 38) return 13;
  return 11;
}

function renderClassic(doc, invoice, items, company) {
  const primary = company.primary_color || '#1a56db';
  const pageW = doc.page.width;
  const margin = 50;
  const position = company.logo_position || 'left';

  // Design settings
  const headerHeightMap = { compact: 110, normal: 130, spacious: 160 };
  const headerH = headerHeightMap[company.header_height] || 130;
  const showAddress = company.header_show_address !== 0 && company.header_show_address !== false;
  const showContact = company.header_show_contact !== 0 && company.header_show_contact !== false;

  // Layout positions from drag editor
  const layout = company.header_layout
    ? (typeof company.header_layout === 'string' ? JSON.parse(company.header_layout) : company.header_layout)
    : {};
  const companyX = layout.company_x ?? margin;
  const companyY = layout.company_y ?? 22;
  const titleX   = layout.title_x   ?? 350;
  const titleY   = layout.title_y   ?? 28;

  // Header band — dynamic height
  doc.rect(0, 0, pageW, headerH).fill(primary);

  const hasLogo  = company.logo_path && fs.existsSync(company.logo_path);
  const leftColW = Math.max(100, titleX - companyX - 10);
  const nameFontSize = resolveNameFontSize(company.name, company.company_name_size);

  let infoY;
  if (hasLogo) {
    const lx = logoX(position, 130, pageW / 2, companyX);
    drawLogo(doc, company, lx, companyY + 6, 55);
    doc.fontSize(9).fillColor('rgba(255,255,255,0.9)').font('Helvetica-Bold')
      .text(company.name, companyX, companyY + 66, { width: leftColW });
    infoY = companyY + 82;
  } else {
    doc.fontSize(nameFontSize).fillColor('#fff').font('Helvetica-Bold')
      .text(company.name, companyX, companyY, { width: leftColW });
    // Dynamically calculate infoY based on how many lines the name actually takes
    const nameLines = estimateLines(company.name || '', nameFontSize, leftColW);
    const nameBlockH = nameLines * (nameFontSize * 1.25);
    infoY = companyY + nameBlockH + 8;
  }

  doc.fontSize(9).fillColor('rgba(255,255,255,0.8)').font('Helvetica');
  if (showAddress && company.address) { doc.text(company.address, companyX, infoY, { width: leftColW }); infoY += 12; }
  if (showContact && company.email)   { doc.text(company.email,   companyX, infoY, { width: leftColW }); infoY += 11; }
  if (showContact && company.phone)   { doc.text(company.phone,   companyX, infoY, { width: leftColW }); }

  // Invoice label — right column, position from drag editor
  const rightColW = pageW - titleX - margin;
  doc.fontSize(28).fillColor('#fff').font('Helvetica-Bold')
    .text('INVOICE', titleX, titleY, { align: 'right', width: rightColW });
  doc.fontSize(10).fillColor('rgba(255,255,255,0.9)').font('Helvetica')
    .text(`#${invoice.invoice_number}`, titleX, titleY + 36, { align: 'right', width: rightColW });

  // Status badge — sits just below header band
  const badgeY = headerH + 12;
  doc.roundedRect(margin, badgeY, 70, 20, 10).fill(statusColor(invoice.status));
  doc.fontSize(9).fillColor('#fff').font('Helvetica-Bold')
    .text(invoice.status.toUpperCase(), margin, badgeY + 5, { width: 70, align: 'center' });

  // Meta (right side)
  const metaY = badgeY; const metaX = 350;
  doc.fontSize(9).fillColor('#6b7280').font('Helvetica')
    .text('Issue Date:', metaX, metaY,      { width: 90 })
    .text('Due Date:',   metaX, metaY + 16, { width: 90 })
    .text('PO Number:',  metaX, metaY + 32, { width: 90 });
  doc.fillColor('#111827').font('Helvetica-Bold')
    .text(invoice.issue_date || '-', metaX + 90, metaY,      { width: 105, align: 'right' })
    .text(invoice.due_date   || '-', metaX + 90, metaY + 16, { width: 105, align: 'right' })
    .text(invoice.po_number  || '-', metaX + 90, metaY + 32, { width: 105, align: 'right' });

  // Bill To
  const billY = headerH + 60;
  doc.rect(margin, billY, 240, 14).fill('#f9fafb');
  doc.fontSize(9).fillColor('#6b7280').font('Helvetica-Bold').text('BILL TO', margin + 8, billY + 3);
  doc.fontSize(13).fillColor('#111827').font('Helvetica-Bold').text(invoice.client_name, margin, billY + 20);
  doc.fontSize(9).fillColor('#374151').font('Helvetica');
  let cy = billY + 38;
  if (invoice.client_address) { doc.text(invoice.client_address, margin, cy, { width: 240 }); cy += 14; }
  if (invoice.client_email)   { doc.text(invoice.client_email,   margin, cy, { width: 240 }); cy += 14; }
  if (invoice.client_phone)   { doc.text(invoice.client_phone,   margin, cy, { width: 240 }); }

  // Items table
  const afterTable = drawItemsTable(doc, items, company, headerH + 155);

  // Totals
  drawTotals(doc, invoice, company, 380, afterTable + 16);

  // Notes + bank
  let notesY = afterTable + 20;
  if (invoice.notes) {
    doc.rect(margin, notesY, 290, 14).fill('#f9fafb');
    doc.fontSize(9).fillColor('#6b7280').font('Helvetica-Bold').text('NOTES', margin + 6, notesY + 3);
    doc.fontSize(9).fillColor('#374151').font('Helvetica').text(invoice.notes, margin, notesY + 20, { width: 290 });
    notesY += 50;
  }
  if (company.bank_details) {
    doc.rect(margin, notesY, 290, 14).fill('#f9fafb');
    doc.fontSize(9).fillColor('#6b7280').font('Helvetica-Bold').text('PAYMENT DETAILS', margin + 6, notesY + 3);
    doc.fontSize(9).fillColor('#374151').font('Helvetica').text(company.bank_details, margin, notesY + 20, { width: 290 });
  }

  drawFooter(doc, invoice, company);
}

// ── Template: Minimal ─────────────────────────────────────────────────────────

function renderMinimal(doc, invoice, items, company) {
  const primary = company.primary_color || '#1a56db';
  const pageW = doc.page.width;
  const margin = 50;
  const position = company.logo_position || 'left';

  // Thin accent line at top
  doc.rect(0, 0, pageW, 4).fill(primary);

  // Logo / company name — top left
  const hasLogo = company.logo_path && fs.existsSync(company.logo_path);
  let headerBottom = 30;
  if (hasLogo) {
    const lx = logoX(position, 150, pageW, margin);
    const h = drawLogo(doc, company, lx, 20, 55);
    headerBottom = 20 + h + 4;
    doc.fontSize(8).fillColor('#6b7280').font('Helvetica').text(company.name, margin, headerBottom);
    headerBottom += 10;
  } else {
    doc.fontSize(22).fillColor(primary).font('Helvetica-Bold').text(company.name, margin, 18);
    headerBottom = 46;
  }
  doc.fontSize(8).fillColor('#9ca3af').font('Helvetica');
  let infoY = headerBottom;
  if (company.address) { doc.text(company.address, margin, infoY); infoY += 9; }
  if (company.email)   { doc.text(company.email,   margin, infoY); infoY += 9; }
  if (company.phone)   { doc.text(company.phone,   margin, infoY); }

  // INVOICE title — top right
  doc.fontSize(32).fillColor(primary).font('Helvetica-Bold')
    .text('INVOICE', 0, 18, { align: 'right', width: pageW - margin });
  doc.fontSize(10).fillColor('#374151').font('Helvetica')
    .text(`#${invoice.invoice_number}`, 0, 58, { align: 'right', width: pageW - margin });

  // Divider
  const divY = Math.max(infoY, 75) + 10;
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(margin, divY).lineTo(pageW - margin, divY).stroke();

  // Bill To + meta in two columns
  const col2 = pageW / 2 + 10;
  const billY = divY + 14;
  doc.fontSize(8).fillColor('#9ca3af').font('Helvetica-Bold').text('BILL TO', margin, billY);
  doc.fontSize(12).fillColor('#111827').font('Helvetica-Bold').text(invoice.client_name, margin, billY + 12);
  doc.fontSize(8).fillColor('#6b7280').font('Helvetica');
  let by = billY + 28;
  if (invoice.client_address) { doc.text(invoice.client_address, margin, by, { width: 200 }); by += 10; }
  if (invoice.client_email)   { doc.text(invoice.client_email,   margin, by, { width: 200 }); by += 10; }
  if (invoice.client_phone)   { doc.text(invoice.client_phone,   margin, by, { width: 200 }); }

  // Meta right
  doc.fontSize(8).fillColor('#9ca3af').font('Helvetica-Bold').text('INVOICE DETAILS', col2, billY);
  const meta = [
    ['Date', invoice.issue_date || '-'],
    ['Due',  invoice.due_date   || '-'],
    ['PO',   invoice.po_number  || '-'],
    ['Status', invoice.status?.toUpperCase() || '-'],
  ];
  let my = billY + 12;
  meta.forEach(([k, v]) => {
    doc.fontSize(8).fillColor('#6b7280').font('Helvetica').text(k, col2, my, { width: 60 });
    doc.fillColor('#111827').font('Helvetica-Bold').text(v, col2 + 60, my, { width: 180 });
    my += 12;
  });

  // Second divider
  const div2Y = Math.max(by, my) + 10;
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(margin, div2Y).lineTo(pageW - margin, div2Y).stroke();

  // Items
  const afterTable = drawItemsTable(doc, items, company, div2Y + 10);

  // Totals
  drawTotals(doc, invoice, company, 380, afterTable + 16);

  // Notes + bank
  let notesY = afterTable + 16;
  if (invoice.notes) {
    doc.fontSize(8).fillColor('#9ca3af').font('Helvetica-Bold').text('NOTES', margin, notesY);
    doc.fontSize(8).fillColor('#374151').font('Helvetica').text(invoice.notes, margin, notesY + 10, { width: 290 });
    notesY += 36;
  }
  if (company.bank_details) {
    doc.fontSize(8).fillColor('#9ca3af').font('Helvetica-Bold').text('PAYMENT DETAILS', margin, notesY);
    doc.fontSize(8).fillColor('#374151').font('Helvetica').text(company.bank_details, margin, notesY + 10, { width: 290 });
  }

  drawFooter(doc, invoice, company);
}

// ── Template: Modern (sidebar) ────────────────────────────────────────────────

function renderModern(doc, invoice, items, company) {
  const primary = company.primary_color || '#1a56db';
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const sideW = 160;
  const margin = 20;
  const contentX = sideW + 20;
  const contentW = pageW - contentX - margin;
  const sym = company.currency_symbol || '$';

  // Sidebar background
  doc.rect(0, 0, sideW, pageH).fill(primary);

  // Logo in sidebar
  const hasLogo = company.logo_path && fs.existsSync(company.logo_path);
  if (hasLogo) {
    drawLogo(doc, company, margin, 24, 50);
    doc.fontSize(9).fillColor('rgba(255,255,255,0.9)').font('Helvetica-Bold').text(company.name, margin, 80);
  } else {
    doc.fontSize(14).fillColor('#fff').font('Helvetica-Bold').text(company.name, margin, 24, { width: sideW - margin * 2 });
  }

  // Company info in sidebar
  doc.fontSize(8).fillColor('rgba(255,255,255,0.7)').font('Helvetica');
  let sy = hasLogo ? 92 : 60;
  if (company.address) { doc.text(company.address, margin, sy, { width: sideW - margin * 2 }); sy += 20; }
  if (company.email)   { doc.text(company.email,   margin, sy, { width: sideW - margin * 2 }); sy += 10; }
  if (company.phone)   { doc.text(company.phone,   margin, sy, { width: sideW - margin * 2 }); sy += 10; }

  // Sidebar divider
  sy += 10;
  doc.strokeColor('rgba(255,255,255,0.3)').lineWidth(0.5)
    .moveTo(margin, sy).lineTo(sideW - margin, sy).stroke();
  sy += 14;

  // Invoice meta in sidebar
  const sideLabel = (k, v) => {
    doc.fontSize(7).fillColor('rgba(255,255,255,0.55)').font('Helvetica-Bold').text(k.toUpperCase(), margin, sy, { width: sideW - margin * 2 });
    sy += 9;
    doc.fontSize(9).fillColor('#fff').font('Helvetica').text(v || '-', margin, sy, { width: sideW - margin * 2 });
    sy += 16;
  };
  sideLabel('Invoice #', invoice.invoice_number);
  sideLabel('Date',      invoice.issue_date);
  sideLabel('Due',       invoice.due_date);
  if (invoice.po_number) sideLabel('PO #', invoice.po_number);

  // Status pill in sidebar
  sy += 4;
  doc.roundedRect(margin, sy, sideW - margin * 2, 18, 9).fill(statusColor(invoice.status));
  doc.fontSize(8).fillColor('#fff').font('Helvetica-Bold')
    .text(invoice.status.toUpperCase(), margin, sy + 4, { width: sideW - margin * 2, align: 'center' });

  // ── Main content area ──
  const cx = contentX;
  const cw = contentW;

  // "INVOICE" heading
  doc.fontSize(32).fillColor(primary).font('Helvetica-Bold').text('INVOICE', cx, 30, { width: cw });

  // Bill to
  const billY = 75;
  doc.fontSize(8).fillColor('#9ca3af').font('Helvetica-Bold').text('BILL TO', cx, billY);
  doc.fontSize(13).fillColor('#111827').font('Helvetica-Bold').text(invoice.client_name, cx, billY + 12);
  doc.fontSize(8).fillColor('#6b7280').font('Helvetica');
  let by = billY + 28;
  if (invoice.client_address) { doc.text(invoice.client_address, cx, by, { width: cw }); by += 10; }
  if (invoice.client_email)   { doc.text(invoice.client_email,   cx, by, { width: cw }); by += 10; }
  if (invoice.client_phone)   { doc.text(invoice.client_phone,   cx, by, { width: cw }); }

  // Divider
  const div1 = Math.max(by, 120) + 8;
  doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(cx, div1).lineTo(cx + cw, div1).stroke();

  // Items (compact, no outer margin)
  const tableStartY = div1 + 10;
  // Header row
  doc.rect(cx, tableStartY, cw, 20).fill(primary);
  doc.fontSize(8).fillColor('#fff').font('Helvetica-Bold')
    .text('DESCRIPTION', cx + 4,      tableStartY + 6)
    .text('QTY',         cx + cw - 175, tableStartY + 6, { width: 35, align: 'center' })
    .text('PRICE',       cx + cw - 135, tableStartY + 6, { width: 65, align: 'right' })
    .text('AMOUNT',      cx + cw - 65,  tableStartY + 6, { width: 65, align: 'right' });

  let ry = tableStartY + 20;
  items.forEach((item, i) => {
    doc.rect(cx, ry, cw, 22).fill(i % 2 === 0 ? '#fff' : '#f9fafb');
    doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(cx, ry + 22).lineTo(cx + cw, ry + 22).stroke();
    doc.fontSize(8).fillColor('#111827').font('Helvetica')
      .text(item.description,                     cx + 4,        ry + 7, { width: cw - 185 })
      .text(String(item.quantity),               cx + cw - 175, ry + 7, { width: 35, align: 'center' })
      .text(`${sym}${Number(item.unit_price).toFixed(2)}`, cx + cw - 135, ry + 7, { width: 65, align: 'right' })
      .text(`${sym}${Number(item.amount).toFixed(2)}`,     cx + cw - 65,  ry + 7, { width: 65, align: 'right' });
    ry += 22;
  });

  // Totals (right-aligned in content area)
  drawTotals(doc, invoice, company, cx + cw - 175, ry + 14);

  // Notes
  let nY = ry + 14;
  if (invoice.notes) {
    doc.fontSize(8).fillColor('#9ca3af').font('Helvetica-Bold').text('NOTES', cx, nY);
    doc.fontSize(8).fillColor('#374151').font('Helvetica').text(invoice.notes, cx, nY + 10, { width: cw - 195 });
    nY += 36;
  }
  if (company.bank_details) {
    doc.fontSize(8).fillColor('#9ca3af').font('Helvetica-Bold').text('PAYMENT DETAILS', cx, nY);
    doc.fontSize(8).fillColor('#374151').font('Helvetica').text(company.bank_details, cx, nY + 10, { width: cw - 195 });
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

function generatePDF(invoice, items, company) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const filePath = path.join(PDF_DIR, `${invoice.invoice_number}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const style = company.template_style || 'classic';
    if      (style === 'minimal') renderMinimal(doc, invoice, items, company);
    else if (style === 'modern')  renderModern (doc, invoice, items, company);
    else                          renderClassic(doc, invoice, items, company);

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

module.exports = { generatePDF, PDF_DIR };
