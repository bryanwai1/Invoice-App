const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'invoices.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'draft',
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    client_address TEXT,
    po_number TEXT,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    subtotal REAL DEFAULT 0,
    tax_rate REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    notes TEXT,
    payment_terms TEXT,
    currency TEXT DEFAULT 'USD',
    source TEXT DEFAULT 'manual',
    whatsapp_phone TEXT,
    pdf_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit_price REAL NOT NULL,
    amount REAL NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    address TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    logo_path TEXT,
    currency_symbol TEXT DEFAULT '$',
    tax_rate REAL DEFAULT 0,
    payment_terms TEXT DEFAULT 'Net 30',
    invoice_prefix TEXT DEFAULT 'INV',
    next_invoice_number INTEGER DEFAULT 1000,
    bank_details TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    status TEXT DEFAULT 'disconnected',
    qr_code TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Insert default company settings if not exists
const existing = db.prepare('SELECT id FROM company_settings WHERE id = 1').get();
if (!existing) {
  db.prepare(`
    INSERT INTO company_settings (id, name, address, email, phone, website)
    VALUES (1, ?, ?, ?, ?, ?)
  `).run(
    process.env.COMPANY_NAME || 'My Company',
    process.env.COMPANY_ADDRESS || '123 Business St',
    process.env.COMPANY_EMAIL || 'billing@mycompany.com',
    process.env.COMPANY_PHONE || '+1234567890',
    process.env.COMPANY_WEBSITE || 'www.mycompany.com'
  );
}

module.exports = db;
