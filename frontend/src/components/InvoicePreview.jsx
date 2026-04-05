import React from 'react';
import { format } from 'date-fns';

const BASE = import.meta.env.VITE_API_URL || '';

function fmt(date) {
  if (!date) return '—';
  try { return format(new Date(date), 'MMM d, yyyy'); } catch { return date; }
}

function StatusPill({ status }) {
  const colors = {
    paid:      'bg-emerald-100 text-emerald-700',
    pending:   'bg-amber-100 text-amber-700',
    overdue:   'bg-red-100 text-red-700',
    draft:     'bg-gray-100 text-gray-600',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${colors[status] || colors.draft}`}>
      {status}
    </span>
  );
}

function ItemsTable({ items, sym, brandColor }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ background: brandColor }} className="text-white">
          <th className="text-left px-3 py-2">Description</th>
          <th className="text-center px-3 py-2 w-14">Qty</th>
          <th className="text-right px-3 py-2 w-28">Unit Price</th>
          <th className="text-right px-3 py-2 w-28">Amount</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => {
          const hasDisc = Number(item.item_discount) > 0;
          const gross = Number(item.quantity) * Number(item.unit_price);
          return (
            <React.Fragment key={i}>
              <tr className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2.5 text-gray-900">{item.description}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{item.quantity}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{sym}{Number(item.unit_price).toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                  {hasDisc ? (
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="line-through text-gray-400 text-xs leading-none">{sym}{gross.toFixed(2)}</span>
                      <span>{sym}{Number(item.amount).toFixed(2)}</span>
                    </span>
                  ) : `${sym}${Number(item.amount).toFixed(2)}`}
                </td>
              </tr>
              {hasDisc && (
                <tr className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td colSpan={3} className="px-3 pb-2 pt-0 text-xs text-orange-500 italic">
                    Item discount applied
                  </td>
                  <td className="px-3 pb-2 pt-0 text-right text-xs text-orange-500 font-medium">
                    −{sym}{Number(item.item_discount).toFixed(2)}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function Totals({ invoice, items, sym, brandColor }) {
  const itemDiscTotal = (items || []).reduce((s, i) => s + (Number(i.item_discount) || 0), 0);
  const grossSubtotal = Number(invoice.subtotal) + itemDiscTotal;
  return (
    <div className="flex justify-end mt-4">
      <div className="w-64 text-sm space-y-1">
        {itemDiscTotal > 0 && (
          <>
            <div className="flex justify-between text-gray-500 px-2">
              <span>Gross Subtotal</span><span>{sym}{grossSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-orange-500 px-2 font-medium">
              <span>Item Discounts</span><span>−{sym}{itemDiscTotal.toFixed(2)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-gray-500 px-2">
          <span>Subtotal</span><span>{sym}{Number(invoice.subtotal).toFixed(2)}</span>
        </div>
        {Number(invoice.discount) > 0 && (
          <div className="flex justify-between text-gray-500 px-2">
            <span>Overall Discount</span><span>−{sym}{Number(invoice.discount).toFixed(2)}</span>
          </div>
        )}
        {Number(invoice.tax_rate) > 0 && (
          <div className="flex justify-between text-gray-500 px-2">
            <span>Tax ({invoice.tax_rate}%)</span><span>{sym}{Number(invoice.tax_amount).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-white px-3 py-2 rounded-lg text-base"
          style={{ background: brandColor }}>
          <span>TOTAL</span><span>{sym}{Number(invoice.total).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function Footer({ invoice, company, brandColor }) {
  return (
    <div className="mt-8 pt-4 border-t-2" style={{ borderColor: brandColor }}>
      <p className="text-xs text-gray-400 text-center">
        Thank you for your business! · {company.name}
      </p>
      {(invoice.payment_terms || company.payment_terms) && (
        <p className="text-xs text-gray-400 text-center mt-0.5">
          Payment Terms: {invoice.payment_terms || company.payment_terms}
        </p>
      )}
    </div>
  );
}

// ── Classic ───────────────────────────────────────────────────────────────────

function classicNameSize(name, sizeKey) {
  const map = { sm: 'text-sm', md: 'text-xl', lg: 'text-3xl' };
  if (sizeKey && sizeKey !== 'auto') return map[sizeKey] || 'text-3xl';
  const len = (name || '').length;
  if (len <= 18) return 'text-3xl';
  if (len <= 28) return 'text-2xl';
  if (len <= 38) return 'text-xl';
  return 'text-base';
}

function headerPaddingClass(h) {
  return { compact: 'py-3', normal: 'py-5', spacious: 'py-8' }[h] || 'py-5';
}

function ClassicTemplate({ invoice, items, company, sym, brandColor, logoUrl }) {
  const showAddress = company.header_show_address !== 0 && company.header_show_address !== false;
  const showContact = company.header_show_contact !== 0 && company.header_show_contact !== false;
  const nameSizeClass = classicNameSize(company.name, company.company_name_size);
  const padClass = headerPaddingClass(company.header_height);

  return (
    <div className="font-sans">
      {/* Header band */}
      <div className={`flex items-start gap-4 px-8 ${padClass} text-white`} style={{ background: brandColor }}>
        <div className="min-w-0 flex-1">
          {logoUrl
            ? <><img src={logoUrl} alt="Logo" className="h-14 object-contain mb-1" /><p className="text-xs font-semibold opacity-90">{company.name}</p></>
            : <p className={`${nameSizeClass} font-bold leading-tight break-words`}>{company.name}</p>
          }
          {showAddress && company.address && <p className="text-xs opacity-75 mt-2 whitespace-pre-line">{company.address}</p>}
          {showContact && company.email   && <p className="text-xs opacity-75 mt-0.5">{company.email}</p>}
          {showContact && company.phone   && <p className="text-xs opacity-75">{company.phone}</p>}
          {showContact && company.website && <p className="text-xs opacity-75">{company.website}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-bold tracking-wide">INVOICE</p>
          <p className="text-sm opacity-90 mt-0.5">#{invoice.invoice_number}</p>
          {invoice.po_number && <p className="text-xs opacity-75 mt-1">PO: {invoice.po_number}</p>}
        </div>
      </div>

      {/* Status + dates */}
      <div className="px-8 py-4 flex items-center justify-between border-b border-gray-100">
        <StatusPill status={invoice.status} />
        <div className="text-xs text-gray-500 text-right space-y-0.5">
          <div className="flex gap-6">
            <span>Issue Date:</span>
            <span className="font-semibold text-gray-800">{fmt(invoice.issue_date)}</span>
          </div>
          <div className="flex gap-6">
            <span>Due Date:</span>
            <span className="font-semibold text-gray-800">{fmt(invoice.due_date)}</span>
          </div>
          {invoice.po_number && (
            <div className="flex gap-6">
              <span>PO Number:</span>
              <span className="font-semibold text-gray-800">{invoice.po_number}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bill To */}
      <div className="px-8 pt-6 pb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Bill To</p>
        <p className="font-bold text-gray-900 text-base">{invoice.client_name}</p>
        {invoice.client_email   && <p className="text-sm text-gray-500">{invoice.client_email}</p>}
        {invoice.client_phone   && <p className="text-sm text-gray-500">{invoice.client_phone}</p>}
        {invoice.client_address && <p className="text-sm text-gray-500 whitespace-pre-line">{invoice.client_address}</p>}
      </div>

      {/* Items */}
      <div className="px-8 pb-4">
        <ItemsTable items={items} sym={sym} brandColor={brandColor} />
        <Totals invoice={invoice} items={items} sym={sym} brandColor={brandColor} />
      </div>

      {/* Notes + bank */}
      {(invoice.notes || company.bank_details) && (
        <div className="px-8 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {invoice.notes && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
          {company.bank_details && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Payment Details</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{company.bank_details}</p>
            </div>
          )}
        </div>
      )}

      <div className="px-8 pb-8">
        <Footer invoice={invoice} company={company} brandColor={brandColor} />
      </div>
    </div>
  );
}

// ── Minimal ───────────────────────────────────────────────────────────────────

function MinimalTemplate({ invoice, items, company, sym, brandColor, logoUrl }) {
  return (
    <div className="font-sans">
      {/* Thin accent bar */}
      <div className="h-1 w-full" style={{ background: brandColor }} />

      {/* Top: company left, INVOICE right */}
      <div className="px-8 pt-6 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {logoUrl
            ? <><img src={logoUrl} alt="Logo" className="h-12 object-contain mb-1" /><p className="text-xs text-gray-500">{company.name}</p></>
            : <p className="text-2xl font-bold" style={{ color: brandColor }}>{company.name}</p>
          }
          {company.address && <p className="text-xs text-gray-400 mt-1 whitespace-pre-line">{company.address}</p>}
          {company.email   && <p className="text-xs text-gray-400">{company.email}</p>}
          {company.phone   && <p className="text-xs text-gray-400">{company.phone}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-4xl font-bold" style={{ color: brandColor }}>INVOICE</p>
          <p className="text-sm text-gray-600 mt-1">#{invoice.invoice_number}</p>
          <StatusPill status={invoice.status} />
        </div>
      </div>

      <hr className="mx-8 border-gray-200" />

      {/* Bill To + meta */}
      <div className="px-8 py-5 grid grid-cols-2 gap-8">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Bill To</p>
          <p className="font-bold text-gray-900">{invoice.client_name}</p>
          {invoice.client_email   && <p className="text-xs text-gray-500">{invoice.client_email}</p>}
          {invoice.client_phone   && <p className="text-xs text-gray-500">{invoice.client_phone}</p>}
          {invoice.client_address && <p className="text-xs text-gray-500 whitespace-pre-line">{invoice.client_address}</p>}
        </div>
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Invoice Details</p>
          {[
            ['Date',    fmt(invoice.issue_date)],
            ['Due',     fmt(invoice.due_date)],
            invoice.po_number && ['PO Number', invoice.po_number],
            ['Terms',   invoice.payment_terms || company.payment_terms || '—'],
          ].filter(Boolean).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs mb-0.5">
              <span className="text-gray-400 w-20 shrink-0">{k}</span>
              <span className="font-semibold text-gray-800">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <hr className="mx-8 border-gray-200" />

      {/* Items */}
      <div className="px-8 py-4">
        <ItemsTable items={items} sym={sym} brandColor={brandColor} />
        <Totals invoice={invoice} items={items} sym={sym} brandColor={brandColor} />
      </div>

      {/* Notes + bank */}
      {(invoice.notes || company.bank_details) && (
        <div className="px-8 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {invoice.notes && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Notes</p>
              <p className="text-xs text-gray-600 whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
          {company.bank_details && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Payment Details</p>
              <p className="text-xs text-gray-600 whitespace-pre-line">{company.bank_details}</p>
            </div>
          )}
        </div>
      )}

      {/* Bottom accent line */}
      <div className="px-8 pb-8 mt-4">
        <div className="h-0.5 w-full mb-3" style={{ background: brandColor }} />
        <p className="text-xs text-gray-400 text-center">
          Thank you for your business! · {company.name}
        </p>
      </div>
    </div>
  );
}

// ── Modern ────────────────────────────────────────────────────────────────────

function ModernTemplate({ invoice, items, company, sym, brandColor, logoUrl }) {
  return (
    <div className="font-sans flex min-h-full">
      {/* Sidebar */}
      <div className="w-44 shrink-0 text-white px-4 py-6 flex flex-col gap-4" style={{ background: brandColor }}>
        {/* Logo / name */}
        <div>
          {logoUrl
            ? <><img src={logoUrl} alt="Logo" className="h-10 object-contain mb-1 brightness-0 invert" /><p className="text-xs font-semibold opacity-90">{company.name}</p></>
            : <p className="text-sm font-bold leading-tight">{company.name}</p>
          }
          {company.address && <p className="text-xs opacity-60 mt-1 whitespace-pre-line">{company.address}</p>}
          {company.email   && <p className="text-xs opacity-60 mt-0.5">{company.email}</p>}
          {company.phone   && <p className="text-xs opacity-60">{company.phone}</p>}
        </div>

        <div className="border-t border-white/20" />

        {/* Meta */}
        <div className="space-y-3 text-xs">
          {[
            ['Invoice #', invoice.invoice_number],
            ['Date',      fmt(invoice.issue_date)],
            ['Due',       fmt(invoice.due_date)],
            invoice.po_number && ['PO #', invoice.po_number],
          ].filter(Boolean).map(([k, v]) => (
            <div key={k}>
              <p className="opacity-50 uppercase tracking-wide text-[10px]">{k}</p>
              <p className="font-semibold">{v}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-white/20" />

        {/* Status */}
        <div>
          <p className="opacity-50 uppercase tracking-wide text-[10px] mb-1">Status</p>
          <span className="inline-block bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase">
            {invoice.status}
          </span>
        </div>

        {/* Bank details in sidebar */}
        {company.bank_details && (
          <>
            <div className="border-t border-white/20" />
            <div>
              <p className="opacity-50 uppercase tracking-wide text-[10px] mb-1">Payment</p>
              <p className="text-xs opacity-75 whitespace-pre-line">{company.bank_details}</p>
            </div>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 px-6 py-6 flex flex-col">
        <p className="text-3xl font-bold mb-1" style={{ color: brandColor }}>INVOICE</p>

        {/* Bill To */}
        <div className="mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Bill To</p>
          <p className="font-bold text-gray-900">{invoice.client_name}</p>
          {invoice.client_email   && <p className="text-xs text-gray-500">{invoice.client_email}</p>}
          {invoice.client_phone   && <p className="text-xs text-gray-500">{invoice.client_phone}</p>}
          {invoice.client_address && <p className="text-xs text-gray-500 whitespace-pre-line">{invoice.client_address}</p>}
        </div>

        <hr className="border-gray-100 mb-4" />

        {/* Items */}
        <ItemsTable items={items} sym={sym} brandColor={brandColor} />
        <Totals invoice={invoice} items={items} sym={sym} brandColor={brandColor} />

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-4 bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Notes</p>
            <p className="text-xs text-gray-600 whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}

        <div className="mt-auto pt-6">
          <div className="h-0.5" style={{ background: brandColor }} />
          <p className="text-xs text-gray-400 text-center mt-2">
            Thank you for your business! · {company.name}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export default function InvoicePreview({ invoice, items, company }) {
  const sym        = company?.currency_symbol || '$';
  const brandColor = company?.primary_color   || '#1a56db';
  const logoUrl    = company?.logo_path ? `${BASE}/api/settings/logo` : null;
  const template   = company?.template_style  || 'classic';

  const props = { invoice, items, company, sym, brandColor, logoUrl };

  return (
    // Paper-like container
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
      {template === 'modern'  && <ModernTemplate  {...props} />}
      {template === 'minimal' && <MinimalTemplate {...props} />}
      {template === 'classic' && <ClassicTemplate {...props} />}
      {!['modern','minimal','classic'].includes(template) && <ClassicTemplate {...props} />}
    </div>
  );
}
