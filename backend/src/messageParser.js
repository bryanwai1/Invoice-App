const { format, addDays, parse, isValid } = require('date-fns');

// Strip currency symbols and commas → clean float
// Handles: RM1,700  |  $1,500.50  |  1,200  |  RM 500
function cleanNumber(str) {
  if (str === null || str === undefined) return 0;
  return parseFloat(String(str).replace(/[RM$€£¥,\s]/gi, '').trim()) || 0;
}

/**
 * Parse a WhatsApp invoice message into structured data.
 *
 * Handles Bryan's real-world formats:
 *
 *  Format A — keyword-structured:
 *    INVOICE
 *    Client: InfoTrek , Shin Yee
 *    Item: Trainer Fee @ 1,700
 *    Item: Transport x1 @ 500
 *
 *  Format B — semi-structured with RM amounts:
 *    Client: Infotrek
 *    Attn: Shin Yee
 *    RM1700
 *    Transport claim, RM500
 *    Description: Trainer Fee, Taaras Team Building
 *
 *  Format C — natural mix:
 *    Client: Acme / John
 *    Trainer Fee RM1,700
 *    Hotel RM350
 *    Transport RM500
 *    Due: 30 April 2026
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

  // Collect pending description from a Description: line for use with RM-only lines
  let pendingDescription = '';
  const attnParts = [];

  for (const line of lines) {
    const colonIdx = line.indexOf(':');

    // ── Lines WITHOUT a colon ────────────────────────────────────────────────
    if (colonIdx === -1) {
      // "RM1700" or "RM 1,700"  — standalone amount
      const standaloneRM = line.match(/^RM\s*([\d,]+(?:\.\d+)?)\s*$/i);
      if (standaloneRM) {
        const price = cleanNumber(standaloneRM[1]);
        if (price > 0) {
          result.items.push({
            description: pendingDescription || 'Service',
            quantity: 1,
            unit_price: price,
            amount: price
          });
          pendingDescription = '';
        }
        continue;
      }

      // "Transport claim, RM500"  or  "Hotel fees RM350"
      const descRM = line.match(/^(.+?)[,]?\s+RM\s*([\d,]+(?:\.\d+)?)\s*$/i);
      if (descRM) {
        const price = cleanNumber(descRM[2]);
        if (price > 0) {
          result.items.push({
            description: descRM[1].trim(),
            quantity: 1,
            unit_price: price,
            amount: price
          });
        }
        continue;
      }

      // Skip unrecognised lines without colon
      continue;
    }

    // ── Lines WITH a colon ───────────────────────────────────────────────────
    const key   = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();
    if (!value) continue;

    switch (key) {
      // Client name — handle "InfoTrek , Shin Yee" or "InfoTrek / Shin Yee"
      case 'client':
      case 'client name':
      case 'name':
      case 'bill to':
      case 'company': {
        // Split on ", " or " / " — first part is company, rest is contact
        const parts = value.split(/\s*[,/]\s*/);
        result.client_name = parts[0].trim();
        if (parts.length > 1) {
          attnParts.push(parts.slice(1).join(', ').trim());
        }
        break;
      }

      // Attention / contact person at client
      case 'attn':
      case 'attention':
      case 'pic':
      case 'contact':
      case 'contact person':
      case 'c/o':
        attnParts.push(value);
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
      case 'po no':
      case 'po#':
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
      case 'invoice date':
      case 'date': {
        const parsed = tryParseDate(value);
        if (parsed) result.issue_date = parsed;
        break;
      }

      // Item line — supports "Trainer Fee @ 1,700" / "Service x2 @ 500" / "Item RM1700"
      case 'item':
      case 'service':
      case 'product':
      case 'fee': {
        const item = parseItem(value);
        if (item) result.items.push(item);
        break;
      }

      // Description: can be the description for a following RM line OR a note
      case 'description':
      case 'desc':
      case 'job':
      case 'scope': {
        // If we already have items, treat as note; otherwise hold as pending description
        if (result.items.length === 0) {
          pendingDescription = value;
        }
        // Also store in notes
        result.notes = result.notes
          ? `${result.notes}\n${value}`
          : value;
        break;
      }

      case 'tax':
      case 'tax rate':
      case 'sst':
      case 'gst':
      case 'vat':
        result.tax_rate = parseFloat(value) || 0;
        break;

      case 'discount':
        result.discount = cleanNumber(value);
        break;

      case 'notes':
      case 'note':
      case 'remarks':
      case 'remark':
      case 'comment':
        result.notes = result.notes ? `${result.notes}\n${value}` : value;
        break;

      case 'terms':
      case 'payment terms':
        result.payment_terms = value;
        break;
    }
  }

  // Attach Attn info to notes so it appears on the invoice
  if (attnParts.length > 0) {
    const attnStr = `Attn: ${attnParts.join(', ')}`;
    result.notes = result.notes ? `${attnStr}\n${result.notes}` : attnStr;
  }

  // Must have at least a client name to be valid
  if (!result.client_name) return null;

  // If Description: was given but no items were parsed yet — create a single item
  if (result.items.length === 0 && pendingDescription) {
    // Can't create item without a price, so return null and let AI handle it
    return null;
  }

  if (result.items.length === 0) return null;

  return result;
}

/**
 * Parse an item string. Handles:
 *   "Trainer Fee @ 1,700"          → qty 1,  price 1700
 *   "Web Design x1 @ 500"          → qty 1,  price 500
 *   "Hosting x 12 @ 25"            → qty 12, price 25
 *   "Consulting - 5 @ 150"         → qty 5,  price 150
 *   "Logo Design RM250"            → qty 1,  price 250
 *   "Transport claim, RM500"       → qty 1,  price 500
 */
function parseItem(text) {
  // Normalise: allow commas inside numbers but not as separators in the regex
  // We'll strip commas from matched number groups via cleanNumber()
  const N = '([\\d,]+(?:\\.\\d+)?)'; // number group that allows commas

  const patterns = [
    // "Description x3 @ 1,700"
    new RegExp(`^(.+?)\\s*[xX×]\\s*${N}\\s*@\\s*${N}$`),
    // "Description - 3 @ 1,700"
    new RegExp(`^(.+?)\\s*-\\s*${N}\\s*@\\s*${N}$`),
    // "Description @ 1,700"  (qty = 1)
    new RegExp(`^(.+?)\\s*@\\s*${N}$`),
    // "Description RM1,700"  or  "Description, RM1700"
    new RegExp(`^(.+?)[,]?\\s+RM\\s*${N}\\s*$`, 'i'),
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match) {
      let description, quantity, unit_price;

      if (i === 0 || i === 1) {
        // qty + price
        [, description, quantity, unit_price] = match;
        const qty   = cleanNumber(quantity);
        const price = cleanNumber(unit_price);
        return { description: description.trim(), quantity: qty, unit_price: price, amount: qty * price };
      } else {
        // price only (qty = 1)
        [, description, unit_price] = match;
        const price = cleanNumber(unit_price);
        return { description: description.trim(), quantity: 1, unit_price: price, amount: price };
      }
    }
  }
  return null;
}

function tryParseDate(value) {
  const formats = [
    'yyyy-MM-dd',
    'MM/dd/yyyy',
    'dd/MM/yyyy',
    'dd-MM-yyyy',
    'MMM dd yyyy',
    'dd MMM yyyy',
    'dd MMM yy',
    'MMMM dd yyyy',
    'dd MMMM yyyy',
    'd MMMM yyyy',
  ];

  for (const fmt of formats) {
    try {
      const parsed = parse(value, fmt, new Date());
      if (isValid(parsed)) return format(parsed, 'yyyy-MM-dd');
    } catch (_) {}
  }

  const d = new Date(value);
  if (isValid(d) && !isNaN(d.getTime())) return format(d, 'yyyy-MM-dd');

  return null;
}

module.exports = { parseInvoiceMessage };
