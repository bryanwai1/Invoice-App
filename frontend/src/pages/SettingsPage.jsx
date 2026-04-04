import React, { useEffect, useState } from 'react';
import { settingsApi } from '../api';
import toast from 'react-hot-toast';
import { Save, Upload } from 'lucide-react';

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: '', address: '', email: '', phone: '', website: '',
    currency_symbol: '$', tax_rate: 0, payment_terms: 'Net 30',
    invoice_prefix: 'INV', bank_details: ''
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    settingsApi.get().then(r => {
      const d = r.data;
      setForm({
        name: d.name || '',
        address: d.address || '',
        email: d.email || '',
        phone: d.phone || '',
        website: d.website || '',
        currency_symbol: d.currency_symbol || '$',
        tax_rate: d.tax_rate || 0,
        payment_terms: d.payment_terms || 'Net 30',
        invoice_prefix: d.invoice_prefix || 'INV',
        bank_details: d.bank_details || ''
      });
    });
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsApi.update(form);
      toast.success('Settings saved!');
    } catch {
      toast.error('Save failed');
    } finally { setSaving(false); }
  };

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await settingsApi.uploadLogo(file);
      toast.success('Logo uploaded!');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  };

  const Section = ({ title, children }) => (
    <div className="card p-5 mb-5">
      <h2 className="font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );

  return (
    <form onSubmit={handleSave} className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm">Configure your company details and invoice preferences.</p>
      </div>

      <Section title="🏢 Company Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Company Name *</label>
            <input className="input" required value={form.name}
              onChange={e => setField('name', e.target.value)} placeholder="Acme Inc." />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <textarea className="input resize-none" rows={2} value={form.address}
              onChange={e => setField('address', e.target.value)}
              placeholder="123 Business St, City, Country" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email}
              onChange={e => setField('email', e.target.value)} placeholder="billing@company.com" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone}
              onChange={e => setField('phone', e.target.value)} placeholder="+1 234 567 8900" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Website</label>
            <input className="input" value={form.website}
              onChange={e => setField('website', e.target.value)} placeholder="www.mycompany.com" />
          </div>
        </div>

        <div className="mt-4">
          <label className="label">Company Logo</label>
          <label className="btn-secondary cursor-pointer inline-flex">
            <Upload size={15} />
            {uploading ? 'Uploading...' : 'Upload Logo (PNG/JPG)'}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
          </label>
          <p className="text-xs text-gray-400 mt-1">Max 5MB. Logo will appear on invoices.</p>
        </div>
      </Section>

      <Section title="💰 Invoice Preferences">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Invoice Prefix</label>
            <input className="input" value={form.invoice_prefix}
              onChange={e => setField('invoice_prefix', e.target.value.toUpperCase())}
              placeholder="INV" maxLength={10} />
            <p className="text-xs text-gray-400 mt-1">e.g. INV → INV-2024-1000</p>
          </div>
          <div>
            <label className="label">Currency Symbol</label>
            <input className="input" value={form.currency_symbol}
              onChange={e => setField('currency_symbol', e.target.value)}
              placeholder="$" maxLength={5} />
          </div>
          <div>
            <label className="label">Default Tax Rate (%)</label>
            <input className="input" type="number" min={0} max={100} step={0.1}
              value={form.tax_rate}
              onChange={e => setField('tax_rate', e.target.value)} />
          </div>
          <div>
            <label className="label">Default Payment Terms</label>
            <input className="input" value={form.payment_terms}
              onChange={e => setField('payment_terms', e.target.value)}
              placeholder="Net 30" />
          </div>
        </div>
      </Section>

      <Section title="🏦 Bank / Payment Details">
        <label className="label">Bank Details (shown on invoice)</label>
        <textarea className="input resize-none" rows={4} value={form.bank_details}
          onChange={e => setField('bank_details', e.target.value)}
          placeholder={`Bank: National Bank\nAccount: 1234567890\nRouting: 021000021\nSWIFT: NATAAU33`} />
      </Section>

      <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-3">
        <Save size={16} />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  );
}
