# Invoice App — Project Context

## Repo & Deployment
- **GitHub**: `bryanwai1/Invoice-App`, branch `claude/whatsapp-invoice-app-RNGNI`
- **Frontend**: Render static site — `invoice-frontend` (Vite + React)
- **Backend**: Render web service — `invoice-backend` (Node/Express)
- **Database**: SQLite via `better-sqlite3`, stored at `/data/invoices.db` (Render persistent disk)
- **PDFs**: stored at `/data/pdfs/`, logos at `/data/logos/`
- **Env vars on Render** (backend):
  - `PERSIST_DIR=/data`
  - `FRONTEND_URL=<render frontend url>`
  - `BACKEND_URL=<render backend url>`
  - `GREEN_API_INSTANCE_ID`, `GREEN_API_TOKEN` — WhatsApp via Green API
  - `GEMINI_API_KEY` (or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) — AI invoice parsing
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_FOLDER_ID` — Drive OAuth

---

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS, React Router, lucide-react, date-fns, axios, react-hot-toast |
| Backend | Node.js + Express, better-sqlite3, PDFKit, multer, sharp |
| WhatsApp | Green API (webhook-based), no socket library |
| AI Parsing | Gemini 1.5 Flash (primary), fallback OpenAI/Anthropic |
| PDF Storage | Local disk + Google Drive OAuth2 auto-upload |

---

## Key Files

### Backend
| File | Purpose |
|---|---|
| `backend/src/database.js` | SQLite init, table creation, all migrations |
| `backend/src/routes/invoices.js` | CRUD, stats, breakdown endpoint, PDF download |
| `backend/src/routes/settings.js` | Company settings, logo upload, Google Drive OAuth |
| `backend/src/invoiceGenerator.js` | PDFKit PDF rendering — Classic / Minimal / Modern templates |
| `backend/src/whatsapp.js` | Green API webhook handler, bot_mode gating, retrieval logic |
| `backend/src/aiParser.js` | Gemini/AI prompt for parsing WhatsApp messages into invoices |
| `backend/src/messageParser.js` | Regex-based fallback parser for Bryan's real message formats |
| `backend/src/googleDrive.js` | OAuth2 client, PDF upload to Drive folder |

### Frontend
| File | Purpose |
|---|---|
| `frontend/src/pages/Dashboard.jsx` | Stats cards, Revenue by Client, Revenue by Item Type, client filter |
| `frontend/src/pages/InvoiceForm.jsx` | New/Edit invoice form with live A4 preview panel |
| `frontend/src/pages/InvoiceList.jsx` | Invoice list with quick actions + By Client grouped view |
| `frontend/src/pages/SettingsPage.jsx` | All settings + live A4 invoice preview (replaces drag editor) |
| `frontend/src/pages/WhatsAppPage.jsx` | WhatsApp connection, bot mode tiles, group lock |
| `frontend/src/components/InvoicePreview.jsx` | Shared HTML invoice preview — Classic / Minimal / Modern |
| `frontend/src/api.js` | All axios API calls |

---

## Database Schema

### `invoices`
Standard fields: `id, invoice_number, status, client_name, client_email, client_phone, client_address, po_number, issue_date, due_date, subtotal, tax_rate, tax_amount, discount, total, notes, payment_terms, currency, source, whatsapp_phone, pdf_path, drive_link`

### `invoice_items`
`id, invoice_id, description, quantity, unit_price, amount, item_discount`

### `company_settings` (single row, id=1)
`name, address, email, phone, website, logo_path, currency_symbol, tax_rate, payment_terms, invoice_prefix, next_invoice_number, bank_details, primary_color, template_style, logo_position, header_layout, header_height, company_name_size, header_show_address, header_show_contact, bot_mode, group_chat_id, google_refresh_token`

> Migrations run automatically in `database.js` — safe to add new `ALTER TABLE` blocks there.

---

## Features Built

### Invoice Form (`InvoiceForm.jsx`)
- Live A4 preview panel (ResizeObserver scales to fit, `transform: scale()`)
- **Currency picker**: 12-currency dropdown (MYR default) + editable symbol input
- **Per-item discount**: Tag icon toggles discount row per line; shows strikethrough gross → net
- Summary breakdown: Gross Subtotal → Item Discounts → Subtotal → Overall Discount → Tax → Total

### Invoice List (`InvoiceList.jsx`)
- Always-visible quick actions per row: ✓ Paid, Download, Edit, Delete
- Optimistic status updates (no page reload)
- View toggle: **List** | **By Client** (collapsible client groups)

### Dashboard (`Dashboard.jsx`)
- Client dropdown filter — scopes stats + recent invoices + category breakdown
- **Revenue by Client** panel: clickable rows, paid% progress bar
- **Revenue by Item Type** panel: groups all item descriptions (Training Fee, Design Fee, Claims, etc.) with share bar; re-fetches when client filter changes
- Backend endpoint: `GET /api/invoices/breakdown?client=X`

### Settings (`SettingsPage.jsx`)
- **Live A4 invoice preview** at top — replaces the removed drag-and-drop header layout editor
- Preview updates in real time as template, colour, name, header options change
- **Currency picker** (same component as InvoiceForm)
- Header Design controls (Classic template): Company Name Size, Header Height, Show Address toggle, Show Email & Phone toggle
- Google Drive OAuth connect/disconnect

### PDF Generator (`invoiceGenerator.js`)
- Three templates: **Classic** (coloured header band), **Minimal** (white + accent line), **Modern** (sidebar)
- Classic adaptive font: `resolveNameFontSize()` shrinks 22→17→13→11pt for long names
- Classic dynamic header height: compact=110 / normal=130 / spacious=160pt
- Dynamic `infoY`: uses `estimateLines()` so address never overlaps name
- Per-item discount rows in PDF: strikethrough gross + orange `disc: -RM X` label
- Totals section: shows Gross Subtotal + Item Discounts rows when applicable

### WhatsApp Bot (`whatsapp.js`)
- **Bot mode gating**: `bot_mode` column — `all` | `group_only` | `dm_only`
- **Group lock**: first group message locks `group_chat_id`; subsequent group messages from other groups are ignored
- **Invoice retrieval**: "send me invoice for Acme" → searches DB/Drive, resends without creating new
- Sends PDF file + Drive link (or inline if no Drive)
- Help message on "help" / "?" commands

### AI/Message Parser
- `aiParser.js`: Gemini prompt understands Bryan's real formats — no "create invoice" prefix required
- `messageParser.js` regex fallback handles:
  - Standalone `RM 1,700` lines (no colon)
  - `Description, RM 500` format
  - `Attn:` / `PIC:` / `Contact:` → appended to notes
  - Comma-separated numbers (`1,700` → 1700)
  - RM prefix on amounts

---

## Bryan's Real WhatsApp Invoice Format
```
Client: Pixels and Purpose Enterprise / Attn: Bryan
Training Fee, RM 1,700
Travel Claims, RM 300
Due: 2025-04-30
```
- Client line: first part = client_name, after ` / ` = attn (goes to notes)
- Items: `Description, RM amount` or standalone `RM amount` lines
- Amounts may have commas: `RM 1,700`
- No "create invoice" trigger needed — any message with client + items is parsed

---

## Commit History (latest first)
```
b0b8c7f feat: live A4 preview in Settings + Dashboard client & category filters
7621d52 chore: add breakdown endpoint to invoiceApi
a18e962 feat: currency picker dropdown + per-item discounts
40cfb08 Fix Classic template text overlay + add header design controls
bd59522 Add bot response mode control to stop replying in every conversation
ec5c8f9 Fix invoice parsing for Bryan's real WhatsApp message patterns
66b89dd Add invoice retrieval via WhatsApp — find & resend existing invoices
7d76e85 Add quick action buttons and By Client grouped view to InvoiceList
ff07aa4 Add live A4 invoice preview panel to InvoiceForm
aebec1a Fix render.yaml: correct disk mount path and PERSIST_DIR
```

---

## Known / Potential Next Steps
- Voice note parsing (WhatsApp sends audio — transcribe → parse)
- Invoice PDF regeneration button visible in the invoice detail view
- Email sending (SMTP) for invoice delivery
- Recurring invoice scheduler
- Mobile-friendly layout improvements
- Payment tracking / partial payment support
