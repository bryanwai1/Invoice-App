const { format, addDays, parse, isValid } = require('date-fns');

/**
 * Parse a WhatsApp invoice message into structured data.
 * Supports formats like:
 *   INVOICE
 *   Client: John Doe
 *   Email: john@example.com
 *   Phone: +1234567890
 *   Address: 123 Main St
 *   PO: PO-2024-001
 *   Due: 2024-03-15
 *   Item: Web Design x1 @ 500
 *   Item: Hosting x12 @ 10
 *   Tax: 10
 *   Discount: 50
 *   Notes: Payment due within 30 days
 */
function parseInvoiceMessage(text, senderPhone) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = {
    client_name: '',
    client_email: '',
    client_phone: senderPhone || '',
    client_address: '',
    po_number: '',
    issue_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    items: [],
    tax_rate: 0,
    discount: 0,
    notes: '',
    payment_terms: 'Net 30'
  };

  for (const line of lines) {
    const lower = line.toLowerCase();
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    switch (key) {
      case 'client':
      case 'client name':
      case 'name':
      case 'bill to':
        result.client_name = value;
        break;

      case 'email':
      case 'client email':
        result.client_email = value;
        break;

      case 'phone':
      case 'client phone':
      case 'mobile':
      case 'tel':
        result.client_phone = value;
        break;

      case 'address':
      case 'client address':
        result.client_address = value;
        break;

      case 'po':
      case 'p.o':
      case 'p.o.':
      case 'po number':
      case 'purchase order':
        result.po_number = value;
        break;

      case 'due':
      case 'due date':
      case 'payment due': {
        const parsed = tryParseDate(value);
        if (parsed) result.due_date = parsed;
        break;
      }

      case 'issue date':
      case 'date': {
        const parsed = tryParseDate(value);
        if (parsed) result.issue_date = parsed;
        break;
      }

      case 'item':
      case 'service':
      case 'product': {
        const item = parseItem(value);
        if (item) result.items.push(item);
        break;
      }

      case 'tax':
      case 'tax rate':
      case 'vat':
        result.tax_rate = parseFloat(value) || 0;
        break;

      case 'discount':
        result.discount = parseFloat(value) || 0;
        break;

      case 'notes':
      case 'note':
      case 'remarks':
        result.notes = value;
        break;

      case 'terms':
      case 'payment terms':
        result.payment_terms = value;
        break;
    }
  }

  if (!result.client_name) return null;
  if (result.items.length === 0) return null;

  return result;
}

/**
 * Parse an item string like:
 *   "Web Design x1 @ 500"
 *   "Hosting x 12 @ 10.00"
 *   "Consulting - 5 hours @ 150"
 *   "Logo Design @250" (qty=1)
 */
function parseItem(text) {
  // Pattern: description [x qty] @ price
  const patterns = [
    // "Description x3 @ 100" or "Description x 3 @ 100"
    /^(.+?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*@\s*(\d+(?:\.\d+)?)$/,
    // "Description - 3 @ 100"
    /^(.+?)\s*-\s*(\d+(?:\.\d+)?)\s*@\s*(\d+(?:\.\d+)?)$/,
    // "Description @ 100" (qty defaults to 1)
    /^(.+?)\s*@\s*(\d+(?:\.\d+)?)$/,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match) {
      let description, quantity, unit_price;
      if (i < 2) {
        [, description, quantity, unit_price] = match;
      } else {
        [, description, unit_price] = match;
        quantity = 1;
      }
      const qty = parseFloat(quantity);
      const price = parseFloat(unit_price);
      return {
        description: description.trim(),
        quantity: qty,
        unit_price: price,
        amount: qty * price
      };
    }
  }
  return null;
}

function tryParseDate(value) {
  const formats = [
    'yyyy-MM-dd',
    'MM/dd/yyyy',
    'dd/MM/yyyy',
    'MMM dd yyyy',
    'dd MMM yyyy',
    'MMMM dd yyyy'
  ];

  for (const fmt of formats) {
    try {
      const parsed = parse(value, fmt, new Date());
      if (isValid(parsed)) {
        return format(parsed, 'yyyy-MM-dd');
      }
    } catch (_) {}
  }

  // Try native Date
  const d = new Date(value);
  if (isValid(d) && !isNaN(d.getTime())) {
    return format(d, 'yyyy-MM-dd');
  }

  return null;
}

module.exports = { parseInvoiceMessage };
