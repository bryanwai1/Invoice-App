const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const PDF_DIR = path.join(__dirname, '..', 'pdfs');
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

function generatePDF(invoice, items, company) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const filePath = path.join(PDF_DIR, `${invoice.invoice_number}.pdf`);
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    const primary = company.primary_color || '#1a56db';
    const colors = {
      primary,
      secondary: '#374151',
      light: '#f9fafb',
      border: '#e5e7eb',
      text: '#111827',
      muted: '#6b7280',
      success: '#059669',
      warning: '#d97706',
      danger: '#dc2626'
    };

    // ── Header Background
    doc.rect(0, 0, doc.page.width, 130).fill(colors.primary);

    // Logo (top-left) — if present
    const hasLogo = company.logo_path && fs.existsSync(company.logo_path);
    if (hasLogo) {
      try {
        doc.image(company.logo_path, 50, 28, { fit: [130, 70] });
      } catch (_) {} // skip on corrupt image
    }

    // Company Name (skip if logo is shown — logo carries the brand)
    const textStartY = hasLogo ? 100 : 35;
    if (!hasLogo) {
      doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold')
        .text(company.name, 50, 35);
    } else {
      // Show company name small below logo
      doc.fontSize(9).fillColor('rgba(255,255,255,0.9)').font('Helvetica-Bold')
        .text(company.name, 50, 102);
    }

    doc.fontSize(9).fillColor('rgba(255,255,255,0.85)').font('Helvetica');
    let infoY = hasLogo ? 113 : 68;
    if (company.address) { doc.text(company.address, 50, infoY); infoY += 12; }
    if (company.email)   { doc.text(company.email,   50, infoY); infoY += 12; }
    if (company.phone)   { doc.text(company.phone,   50, infoY); infoY += 12; }
    if (company.website) { doc.text(company.website, 50, infoY); }

    // INVOICE label
    doc.fontSize(30).fillColor('#ffffff').font('Helvetica-Bold')
      .text('INVOICE', 350, 35, { align: 'right', width: 195 });

    doc.fontSize(10).fillColor('rgba(255,255,255,0.9)').font('Helvetica')
      .text(`#${invoice.invoice_number}`, 350, 72, { align: 'right', width: 195 });

    // ── Status Badge
    const statusColors = {
      paid: colors.success,
      pending: colors.warning,
      overdue: colors.danger,
      draft: colors.muted
    };
    const badgeColor = statusColors[invoice.status] || colors.muted;

    doc.moveDown(4);
    const badgeY = 140;
    doc.roundedRect(50, badgeY, 70, 20, 10).fill(badgeColor);
    doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold')
      .text(invoice.status.toUpperCase(), 50, badgeY + 5, { width: 70, align: 'center' });

    // ── Invoice Meta
    const metaY = 140;
    const col = 350;
    doc.fontSize(9).fillColor(colors.muted).font('Helvetica')
      .text('Issue Date:', col, metaY, { width: 90 })
      .text('Due Date:', col, metaY + 16, { width: 90 })
      .text('PO Number:', col, metaY + 32, { width: 90 });

    doc.fillColor(colors.text).font('Helvetica-Bold')
      .text(invoice.issue_date || '-', col + 90, metaY, { width: 105, align: 'right' })
      .text(invoice.due_date || '-', col + 90, metaY + 16, { width: 105, align: 'right' })
      .text(invoice.po_number || '-', col + 90, metaY + 32, { width: 105, align: 'right' });

    // ── Bill To
    const billY = 185;
    doc.rect(50, billY, 240, 14).fill(colors.light);
    doc.fontSize(9).fillColor(colors.muted).font('Helvetica-Bold')
      .text('BILL TO', 58, billY + 3);

    doc.fontSize(13).fillColor(colors.text).font('Helvetica-Bold')
      .text(invoice.client_name, 50, billY + 22);

    doc.fontSize(9).fillColor(colors.secondary).font('Helvetica');
    let clientY = billY + 40;
    if (invoice.client_address) {
      doc.text(invoice.client_address, 50, clientY, { width: 240 });
      clientY += 14;
    }
    if (invoice.client_email) {
      doc.text(invoice.client_email, 50, clientY, { width: 240 });
      clientY += 14;
    }
    if (invoice.client_phone) {
      doc.text(invoice.client_phone, 50, clientY, { width: 240 });
    }

    // ── Items Table
    const tableY = 280;
    const cols = { desc: 50, qty: 290, price: 370, amount: 450 };
    const tableWidth = doc.page.width - 100;

    // Table Header
    doc.rect(50, tableY, tableWidth, 22).fill(colors.primary);
    doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold')
      .text('DESCRIPTION', cols.desc + 6, tableY + 7)
      .text('QTY', cols.qty, tableY + 7, { width: 60, align: 'center' })
      .text('UNIT PRICE', cols.price, tableY + 7, { width: 80, align: 'right' })
      .text('AMOUNT', cols.amount, tableY + 7, { width: 95, align: 'right' });

    // Table Rows
    let rowY = tableY + 22;
    const sym = company.currency_symbol || '$';

    items.forEach((item, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : colors.light;
      doc.rect(50, rowY, tableWidth, 24).fill(bg);
      doc.strokeColor(colors.border).lineWidth(0.5)
        .moveTo(50, rowY + 24).lineTo(50 + tableWidth, rowY + 24).stroke();

      doc.fontSize(9).fillColor(colors.text).font('Helvetica')
        .text(item.description, cols.desc + 6, rowY + 8, { width: 225 })
        .text(item.quantity.toString(), cols.qty, rowY + 8, { width: 60, align: 'center' })
        .text(`${sym}${Number(item.unit_price).toFixed(2)}`, cols.price, rowY + 8, { width: 80, align: 'right' })
        .text(`${sym}${Number(item.amount).toFixed(2)}`, cols.amount, rowY + 8, { width: 95, align: 'right' });

      rowY += 24;
    });

    // ── Totals
    const totalsX = 380;
    let totalsY = rowY + 16;

    const drawTotalRow = (label, value, bold = false, highlight = false) => {
      if (highlight) {
        doc.rect(totalsX - 10, totalsY - 4, 175, 22).fill(colors.primary);
        doc.fontSize(11).fillColor('#ffffff').font('Helvetica-Bold')
          .text(label, totalsX, totalsY, { width: 80 })
          .text(value, totalsX + 80, totalsY, { width: 85, align: 'right' });
      } else {
        doc.fontSize(9)
          .fillColor(bold ? colors.text : colors.muted)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(label, totalsX, totalsY, { width: 80 })
          .text(value, totalsX + 80, totalsY, { width: 85, align: 'right' });
        doc.strokeColor(colors.border).lineWidth(0.5)
          .moveTo(totalsX - 10, totalsY + 14).lineTo(totalsX + 165, totalsY + 14).stroke();
      }
      totalsY += highlight ? 24 : 18;
    };

    drawTotalRow('Subtotal', `${sym}${Number(invoice.subtotal).toFixed(2)}`);
    if (invoice.discount > 0) {
      drawTotalRow('Discount', `-${sym}${Number(invoice.discount).toFixed(2)}`);
    }
    if (invoice.tax_rate > 0) {
      drawTotalRow(`Tax (${invoice.tax_rate}%)`, `${sym}${Number(invoice.tax_amount).toFixed(2)}`);
    }
    drawTotalRow('TOTAL', `${sym}${Number(invoice.total).toFixed(2)}`, true, true);

    // ── Notes & Payment Terms
    let bottomY = totalsY + 20;
    if (bottomY < rowY + 20) bottomY = rowY + 20;

    if (invoice.notes || invoice.payment_terms || company.bank_details) {
      const noteX = 50;
      const noteWidth = 290;

      if (invoice.notes) {
        doc.rect(noteX, bottomY, noteWidth, 14).fill(colors.light);
        doc.fontSize(9).fillColor(colors.muted).font('Helvetica-Bold')
          .text('NOTES', noteX + 6, bottomY + 3);
        doc.fontSize(9).fillColor(colors.secondary).font('Helvetica')
          .text(invoice.notes, noteX, bottomY + 20, { width: noteWidth });
        bottomY += 50;
      }

      if (company.bank_details) {
        doc.rect(noteX, bottomY, noteWidth, 14).fill(colors.light);
        doc.fontSize(9).fillColor(colors.muted).font('Helvetica-Bold')
          .text('PAYMENT DETAILS', noteX + 6, bottomY + 3);
        doc.fontSize(9).fillColor(colors.secondary).font('Helvetica')
          .text(company.bank_details, noteX, bottomY + 20, { width: noteWidth });
      }
    }

    // ── Footer
    const footerY = doc.page.height - 50;
    doc.rect(0, footerY - 10, doc.page.width, 60).fill(colors.light);
    doc.strokeColor(colors.primary).lineWidth(2)
      .moveTo(0, footerY - 10).lineTo(doc.page.width, footerY - 10).stroke();
    doc.fontSize(8).fillColor(colors.muted).font('Helvetica')
      .text(`Thank you for your business! · ${company.name}`, 50, footerY, {
        align: 'center', width: doc.page.width - 100
      });
    if (invoice.payment_terms || company.payment_terms) {
      doc.text(`Payment Terms: ${invoice.payment_terms || company.payment_terms}`, 50, footerY + 12, {
        align: 'center', width: doc.page.width - 100
      });
    }

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

module.exports = { generatePDF, PDF_DIR };
