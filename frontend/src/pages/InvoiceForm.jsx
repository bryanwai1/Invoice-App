import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { invoiceApi, settingsApi } from '../api';
import toast from 'react-hot-toast';
import { format, addDays } from 'date-fns';
import { PlusCircle, Trash2, Save, ArrowLeft, Eye } from 'lucide-react';
import InvoicePreview from '../components/InvoicePreview';

const emptyItem = () => ({ description: '', quantity: 1, unit_price: '', amount: 0 });

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
    status: 'pending', currency: 'USD', notes: '', payment_terms: 'Net 30',
    tax_rate: 0, discount: 0, items: [emptyItem()]
  });

  useEffect(() => {
    settingsApi.get().then(r => {
      setSettings(r.data);
      if (!isEdit) {
        setForm(f => ({
          ...f,
          tax_rate: r.data.tax_rate || 0,
          payment_terms: r.data.payment_terms || 'Net 30'
        }));
      }
    });

    if (isEdit) {
      invoiceApi.get(id).then(r => {
        const inv = r.data;
        setInvoiceNumber(inv.invoice_number || '');
        setForm({
          client_name: inv.client_name, client_email: inv.client_email || '',
          client_phone: inv.client_phone || '', client_address: inv.client_address || '',
          po_number: inv.po_number || '', issue_date: inv.issue_date,
          due_date: inv.due_date || '', status: inv.status, currency: inv.currency || 'USD',
          notes: inv.notes || '', payment_terms: inv.payment_terms || 'Net 30',
          tax_rate: inv.tax_rate || 0, discount: inv.discount || 0,
          items: inv.items?.length ? inv.items : [emptyItem()]
        });
      }).catch(() => toast.error('Failed to load invoice'));
    }
  }, [id, isEdit]);

  // Compute preview scale whenever panel resizes
  useEffect(() => {
    const el = previewPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const usable = entry.contentRect.width - 48; // 24px padding each side
        setPreviewScale(Math.min(0.9, Math.max(0.25, usable / 794)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const setItem = (idx, key, val) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [key]: val };
      if (key === 'quantity' || key === 'unit_price') {
        const q = parseFloat(key === 'quantity' ? val : items[idx].quantity) || 0;
        const p = parseFloat(key === 'unit_price' ? val : items[idx].unit_price) || 0;
        items[idx].amount = q * p;
      }
      return { ...f, items };
    });
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx) => setForm(f => ({
    ...f, items: f.items.filter((_, i) => i !== idx)
  }));

  const subtotal = form.items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const discountAmt = parseFloat(form.discount) || 0;
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * ((parseFloat(form.tax_rate) || 0) / 100);
  const total = taxable + taxAmt;
  const sym = settings.currency_symbol || '$';

  // Shape the live form data into what InvoicePreview expects
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
    discount: discountAmt,
    tax_rate: form.tax_rate,
    tax_amount: taxAmt,
    total,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.client_name.trim()) return toast.error('Client name required');
    if (form.items.length === 0 || !form.items[0].description) return toast.error('Add at least one item');

    const items = form.items.map(i => ({
      ...i,
      quantity: parseFloat(i.quantity) || 1,
      unit_price: parseFloat(i.unit_price) || 0,
      amount: parseFloat(i.amount) || 0
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-full">

      {/* ── FORM SIDE ── */}
      <form onSubmit={handleSubmit} className="flex-1 min-w-0 p-6">
        <div className="flex items-center gap-3 mb-6">
          <button type="button" onClick={() => navigate(-1)}
            className="btn-secondary py-2 px-3">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEdit ? 'Edit Invoice' : 'New Invoice'}
            </h1>
            <p className="text-gray-500 text-sm">Fill in the details below</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-3xl">
          {/* Left: Client + Items + Notes */}
          <div className="lg:col-span-2 space-y-5">

            {/* Client Info */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                👤 Client Information
              </h2>
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
                    placeholder="+1 234 567 8900" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Address</label>
                  <textarea className="input resize-none" rows={2} value={form.client_address}
                    onChange={e => setField('client_address', e.target.value)}
                    placeholder="123 Main St, City, Country" />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">🧾 Line Items</h2>
              <div className="space-y-3">
                <div className="hidden sm:grid grid-cols-12 gap-2 px-1">
                  <span className="col-span-5 text-xs font-medium text-gray-500">Description</span>
                  <span className="col-span-2 text-xs font-medium text-gray-500 text-center">Qty</span>
                  <span className="col-span-2 text-xs font-medium text-gray-500 text-right">Unit Price</span>
                  <span className="col-span-2 text-xs font-medium text-gray-500 text-right">Amount</span>
                  <span className="col-span-1" />
                </div>
                {form.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="input col-span-12 sm:col-span-5"
                      placeholder="Service or product description"
                      value={item.description}
                      onChange={e => setItem(idx, 'description', e.target.value)}
                    />
                    <input
                      className="input col-span-4 sm:col-span-2 text-center"
                      type="number" min="0.01" step="0.01" placeholder="1"
                      value={item.quantity}
                      onChange={e => setItem(idx, 'quantity', e.target.value)}
                    />
                    <input
                      className="input col-span-4 sm:col-span-2 text-right"
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={item.unit_price}
                      onChange={e => setItem(idx, 'unit_price', e.target.value)}
                    />
                    <div className="col-span-3 sm:col-span-2 text-right text-sm font-medium text-gray-700 pr-1">
                      {sym}{(parseFloat(item.amount) || 0).toFixed(2)}
                    </div>
                    <button type="button" onClick={() => removeItem(idx)}
                      disabled={form.items.length === 1}
                      className="col-span-1 p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30 flex justify-center">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addItem}
                className="mt-3 btn-secondary w-full justify-center border-dashed">
                <PlusCircle size={15} /> Add Item
              </button>
            </div>

            {/* Notes */}
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

          {/* Right sidebar: meta + summary + submit */}
          <div className="space-y-5">
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
              </div>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">💰 Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{sym}{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="shrink-0">Discount ({sym})</span>
                  <input className="input py-1 text-right w-24 ml-auto" type="number"
                    min="0" step="0.01" value={form.discount}
                    onChange={e => setField('discount', e.target.value)} />
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="shrink-0">Tax (%)</span>
                  <input className="input py-1 text-right w-24 ml-auto" type="number"
                    min="0" max="100" step="0.1" value={form.tax_rate}
                    onChange={e => setField('tax_rate', e.target.value)} />
                </div>
                {taxAmt > 0 && (
                  <div className="flex justify-between text-gray-500 text-xs">
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
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b border-slate-200 shrink-0">
          <Eye size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Live Preview — A4</span>
        </div>

        {/* Scaled A4 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Wrapper compensates for the gap left by transform: scale */}
          <div style={{ height: `${794 * 1.414 * previewScale}px`, position: 'relative' }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '794px',
              transform: `scale(${previewScale})`,
              transformOrigin: 'top left',
            }}>
              <InvoicePreview
                invoice={previewInvoice}
                items={form.items}
                company={settings}
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
