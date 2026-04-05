import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { invoiceApi, settingsApi } from '../api';
import toast from 'react-hot-toast';
import { format, addDays } from 'date-fns';
import { PlusCircle, Trash2, Save, ArrowLeft, Eye, Tag } from 'lucide-react';
import InvoicePreview from '../components/InvoicePreview';

// ── Currency list ─────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code: 'MYR', sym: 'RM',   label: 'MYR — Malaysian Ringgit' },
  { code: 'USD', sym: '$',    label: 'USD — US Dollar' },
  { code: 'SGD', sym: 'S$',   label: 'SGD — Singapore Dollar' },
  { code: 'EUR', sym: '€',    label: 'EUR — Euro' },
  { code: 'GBP', sym: '£',    label: 'GBP — British Pound' },
  { code: 'AUD', sym: 'A$',   label: 'AUD — Australian Dollar' },
  { code: 'JPY', sym: '¥',    label: 'JPY — Japanese Yen' },
  { code: 'CNY', sym: 'CN¥',  label: 'CNY — Chinese Yuan' },
  { code: 'THB', sym: '฿',    label: 'THB — Thai Baht' },
  { code: 'IDR', sym: 'Rp',   label: 'IDR — Indonesian Rupiah' },
  { code: 'PHP', sym: '₱',    label: 'PHP — Philippine Peso' },
  { code: 'INR', sym: '₹',    label: 'INR — Indian Rupee' },
];

// Combobox: pick from list OR type a custom symbol
function CurrencyPicker({ sym, code, onChangeSym, onChangeCode }) {
  const isPreset = CURRENCIES.some(c => c.code === code);
  return (
    <div className="space-y-2">
      <div>
        <label className="label">Currency</label>
        <select
          className="input"
          value={isPreset ? code : '__custom__'}
          onChange={e => {
            const c = CURRENCIES.find(x => x.code === e.target.value);
            if (c) { onChangeCode(c.code); onChangeSym(c.sym); }
          }}
        >
          {CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
          {!isPreset && <option value="__custom__">Custom / Other</option>}
        </select>
      </div>
      <div>
        <label className="label">
          Symbol <span className="text-gray-400 font-normal ml-1">(editable)</span>
        </label>
        <input
          className="input font-mono"
          value={sym}
          onChange={e => { onChangeSym(e.target.value); onChangeCode('__custom__'); }}
          placeholder="RM / $ / €"
          maxLength={6}
        />
        <p className="text-xs text-gray-400 mt-1">Change the symbol above for any custom currency not in the list.</p>
      </div>
    </div>
  );
}

// ── Item factory ──────────────────────────────────────────────────────────────
const emptyItem = () => ({
  description: '', quantity: 1, unit_price: '',
  amount: 0, item_discount: 0, show_discount: false,
});

// ── Component ─────────────────────────────────────────────────────────────────
export default function InvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const previewPanelRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(0.55);

  const [form, setForm] = useState({
    client_name: '', client_email: '', client_phone: '',
    client_address: '', po_number: '',
    issue_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    status: 'pending',
    currency: 'MYR', currency_symbol: 'RM',
    notes: '', payment_terms: 'Net 30',
    tax_rate: 0, discount: 0, items: [emptyItem()],
  });

  // ── Load settings + invoice ──
  useEffect(() => {
    settingsApi.get().then(r => {
      setSettings(r.data);
      if (!isEdit) {
        // Detect default currency from settings symbol
        const defSym  = r.data.currency_symbol || 'RM';
        const defCode = CURRENCIES.find(c => c.sym === defSym)?.code || 'MYR';
        setForm(f => ({
          ...f,
          tax_rate: r.data.tax_rate || 0,
          payment_terms: r.data.payment_terms || 'Net 30',
          currency_symbol: defSym,
          currency: defCode,
        }));
      }
    });

    if (isEdit) {
      invoiceApi.get(id).then(r => {
        const inv = r.data;
        setInvoiceNumber(inv.invoice_number || '');
        const sym  = inv.currency_symbol || inv.currency_symbol || 'RM';
        const code = CURRENCIES.find(c => c.sym === sym)?.code || inv.currency || 'MYR';
        setForm({
          client_name: inv.client_name, client_email: inv.client_email || '',
          client_phone: inv.client_phone || '', client_address: inv.client_address || '',
          po_number: inv.po_number || '', issue_date: inv.issue_date,
          due_date: inv.due_date || '', status: inv.status,
          currency: code, currency_symbol: sym,
          notes: inv.notes || '', payment_terms: inv.payment_terms || 'Net 30',
          tax_rate: inv.tax_rate || 0, discount: inv.discount || 0,
          items: inv.items?.length
            ? inv.items.map(i => ({
                ...i,
                item_discount: i.item_discount || 0,
                show_discount: (i.item_discount || 0) > 0,
              }))
            : [emptyItem()],
        });
      }).catch(() => toast.error('Failed to load invoice'));
    }
  }, [id, isEdit]);

  // ── Resize observer for preview ──
  useEffect(() => {
    const el = previewPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const usable = entry.contentRect.width - 48;
        setPreviewScale(Math.min(0.9, Math.max(0.25, usable / 794)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Field helpers ──
  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const setItem = (idx, key, val) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [key]: val };
      // Recalculate net amount after any change
      const q = parseFloat(items[idx].quantity) || 0;
      const p = parseFloat(items[idx].unit_price) || 0;
      const d = parseFloat(items[idx].item_discount) || 0;
      items[idx].amount = Math.max(0, q * p - d);
      return { ...f, items };
    });
  };

  const toggleDiscount = (idx) => {
    setForm(f => {
      const items = [...f.items];
      const next = !items[idx].show_discount;
      items[idx] = { ...items[idx], show_discount: next, item_discount: next ? items[idx].item_discount : 0 };
      // Recalculate
      const q = parseFloat(items[idx].quantity) || 0;
      const p = parseFloat(items[idx].unit_price) || 0;
      const d = next ? parseFloat(items[idx].item_discount) || 0 : 0;
      items[idx].amount = Math.max(0, q * p - d);
      return { ...f, items };
    });
  };

  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  // ── Calculations ──
  const sym = form.currency_symbol || settings.currency_symbol || 'RM';

  const grossSubtotal    = form.items.reduce((s, i) => s + ((parseFloat(i.quantity)||0) * (parseFloat(i.unit_price)||0)), 0);
  const itemDiscountTotal = form.items.reduce((s, i) => s + (parseFloat(i.item_discount)||0), 0);
  const subtotal         = form.items.reduce((s, i) => s + (parseFloat(i.amount)||0), 0); // net
  const overallDiscount  = parseFloat(form.discount) || 0;
  const taxable          = subtotal - overallDiscount;
  const taxAmt           = taxable * ((parseFloat(form.tax_rate)||0) / 100);
  const total            = Math.max(0, taxable + taxAmt);

  // ── Preview invoice shape ──
  const previewInvoice = {
    invoice_number: invoiceNumber || '—',
    po_number: form.po_number,
    issue_date: form.issue_date,
    due_date: form.due_date,
    status: form.status,
    client_name: form.client_name || 'Client Name',
    client_email: form.client_email,
    client_phone: form.client_phone,
    client_address: form.client_address,
    notes: form.notes,
    payment_terms: form.payment_terms,
    subtotal,
    discount: overallDiscount,
    tax_rate: form.tax_rate,
    tax_amount: taxAmt,
    total,
  };

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.client_name.trim()) return toast.error('Client name required');
    if (!form.items[0]?.description) return toast.error('Add at least one item');

    const items = form.items.map(i => ({
      description: i.description,
      quantity: parseFloat(i.quantity) || 1,
      unit_price: parseFloat(i.unit_price) || 0,
      amount: parseFloat(i.amount) || 0,
      item_discount: parseFloat(i.item_discount) || 0,
    }));

    setSaving(true);
    try {
      if (isEdit) {
        await invoiceApi.update(id, { ...form, items });
        toast.success('Invoice updated');
        navigate(`/invoices/${id}`);
      } else {
        const res = await invoiceApi.create({ ...form, items });
        toast.success('Invoice created!');
        navigate(`/invoices/${res.data.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  // ── Render ──
  return (
    <div className="flex min-h-full">

      {/* ── FORM SIDE ── */}
      <form onSubmit={handleSubmit} className="flex-1 min-w-0 p-6">
        <div className="flex items-center gap-3 mb-6">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary py-2 px-3">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>
            <p className="text-gray-500 text-sm">Fill in the details below</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-3xl">

          {/* ── Left column ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Client Info */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">👤 Client Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Client Name *</label>
                  <input className="input" required value={form.client_name}
                    onChange={e => setField('client_name', e.target.value)}
                    placeholder="John Doe / Acme Corp" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.client_email}
                    onChange={e => setField('client_email', e.target.value)}
                    placeholder="client@example.com" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={form.client_phone}
                    onChange={e => setField('client_phone', e.target.value)}
                    placeholder="+60 12 345 6789" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Address</label>
                  <textarea className="input resize-none" rows={2} value={form.client_address}
                    onChange={e => setField('client_address', e.target.value)}
                    placeholder="123 Main St, City, Country" />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">🧾 Line Items</h2>

              {/* Column headers */}
              <div className="hidden sm:grid gap-2 px-1 mb-1" style={{ gridTemplateColumns: '1fr 70px 100px 90px 56px' }}>
                <span className="text-xs font-medium text-gray-500">Description</span>
                <span className="text-xs font-medium text-gray-500 text-center">Qty</span>
                <span className="text-xs font-medium text-gray-500 text-right">Unit Price</span>
                <span className="text-xs font-medium text-gray-500 text-right">Amount</span>
                <span />
              </div>

              <div className="space-y-2">
                {form.items.map((item, idx) => {
                  const gross = (parseFloat(item.quantity)||0) * (parseFloat(item.unit_price)||0);
                  const net   = parseFloat(item.amount) || 0;
                  return (
                    <div key={idx} className="rounded-lg border border-gray-100 bg-gray-50/50 p-2 space-y-2">
                      {/* Main row */}
                      <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 70px 100px 90px 56px' }}>
                        <input
                          className="input"
                          placeholder="Service or product description"
                          value={item.description}
                          onChange={e => setItem(idx, 'description', e.target.value)}
                        />
                        <input
                          className="input text-center"
                          type="number" min="0.01" step="0.01" placeholder="1"
                          value={item.quantity}
                          onChange={e => setItem(idx, 'quantity', e.target.value)}
                        />
                        <input
                          className="input text-right"
                          type="number" min="0" step="0.01" placeholder="0.00"
                          value={item.unit_price}
                          onChange={e => setItem(idx, 'unit_price', e.target.value)}
                        />
                        <div className="text-right pr-1">
                          {item.show_discount && item.item_discount > 0 ? (
                            <>
                              <span className="line-through text-gray-400 text-xs block">{sym}{gross.toFixed(2)}</span>
                              <span className="text-sm font-semibold text-gray-800">{sym}{net.toFixed(2)}</span>
                            </>
                          ) : (
                            <span className="text-sm font-semibold text-gray-800">{sym}{net.toFixed(2)}</span>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleDiscount(idx)}
                            title={item.show_discount ? 'Remove item discount' : 'Add item discount'}
                            className={`p-1.5 rounded-md text-xs font-bold transition-colors ${
                              item.show_discount
                                ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-orange-50 hover:text-orange-500'
                            }`}
                          >
                            <Tag size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            disabled={form.items.length === 1}
                            className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Discount row — expands when tag icon clicked */}
                      {item.show_discount && (
                        <div className="flex items-center gap-3 pl-1 border-t border-orange-100 pt-2">
                          <span className="text-xs text-orange-600 font-medium flex items-center gap-1 shrink-0">
                            <Tag size={11} /> Item discount ({sym})
                          </span>
                          <input
                            className="input text-right ml-auto w-32"
                            type="number" min="0" step="0.01" placeholder="0.00"
                            value={item.item_discount || ''}
                            onChange={e => setItem(idx, 'item_discount', e.target.value)}
                          />
                          {item.item_discount > 0 && gross > 0 && (
                            <span className="text-xs text-orange-500 shrink-0">
                              ({((item.item_discount / gross) * 100).toFixed(1)}% off)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button type="button" onClick={addItem}
                className="mt-3 btn-secondary w-full justify-center border-dashed">
                <PlusCircle size={15} /> Add Item
              </button>
            </div>

            {/* Notes & Terms */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">📝 Notes & Terms</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Payment Terms</label>
                  <input className="input" value={form.payment_terms}
                    onChange={e => setField('payment_terms', e.target.value)}
                    placeholder="Net 30" />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status}
                    onChange={e => setField('status', e.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Notes</label>
                  <textarea className="input resize-none" rows={3} value={form.notes}
                    onChange={e => setField('notes', e.target.value)}
                    placeholder="Any additional notes for the client..." />
                </div>
              </div>
            </div>
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-5">

            {/* Invoice Details */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">📋 Invoice Details</h2>
              <div className="space-y-3">
                <div>
                  <label className="label">PO Number</label>
                  <input className="input" value={form.po_number}
                    onChange={e => setField('po_number', e.target.value)}
                    placeholder="PO-2024-001" />
                </div>
                <div>
                  <label className="label">Issue Date</label>
                  <input className="input" type="date" value={form.issue_date}
                    onChange={e => setField('issue_date', e.target.value)} />
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input className="input" type="date" value={form.due_date}
                    onChange={e => setField('due_date', e.target.value)} />
                </div>
                {/* Currency picker */}
                <CurrencyPicker
                  sym={form.currency_symbol}
                  code={form.currency}
                  onChangeSym={v => setField('currency_symbol', v)}
                  onChangeCode={v => setField('currency', v)}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">💰 Summary</h2>
              <div className="space-y-2 text-sm">

                {/* Gross subtotal */}
                {itemDiscountTotal > 0 ? (
                  <>
                    <div className="flex justify-between text-gray-500">
                      <span>Gross Subtotal</span>
                      <span>{sym}{grossSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-orange-600">
                      <span>Item Discounts</span>
                      <span>− {sym}{itemDiscountTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 border-t border-gray-100 pt-1">
                      <span>Subtotal</span>
                      <span>{sym}{subtotal.toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{sym}{subtotal.toFixed(2)}</span>
                  </div>
                )}

                {/* Overall discount */}
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="shrink-0">Overall Discount ({sym})</span>
                  <input className="input py-1 text-right w-24 ml-auto" type="number"
                    min="0" step="0.01" value={form.discount}
                    onChange={e => setField('discount', e.target.value)} />
                </div>

                {/* Tax */}
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="shrink-0">Tax (%)</span>
                  <input className="input py-1 text-right w-24 ml-auto" type="number"
                    min="0" max="100" step="0.1" value={form.tax_rate}
                    onChange={e => setField('tax_rate', e.target.value)} />
                </div>
                {taxAmt > 0 && (
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>Tax ({form.tax_rate}%)</span>
                    <span>{sym}{taxAmt.toFixed(2)}</span>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-base text-gray-900">
                  <span>Total</span>
                  <span>{sym}{total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-3">
              <Save size={16} />
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Invoice'}
            </button>
          </div>
        </div>
      </form>

      {/* ── PREVIEW SIDE ── */}
      <div
        ref={previewPanelRef}
        className="hidden xl:flex flex-col w-[480px] shrink-0 sticky top-0 h-screen overflow-y-auto bg-slate-100 border-l border-gray-200"
      >
        <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b border-slate-200 shrink-0">
          <Eye size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Live Preview — A4</span>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div style={{ height: `${794 * 1.414 * previewScale}px`, position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '794px',
              transform: `scale(${previewScale})`, transformOrigin: 'top left',
            }}>
              <InvoicePreview
                invoice={previewInvoice}
                items={form.items}
                company={{ ...settings, currency_symbol: sym }}
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
