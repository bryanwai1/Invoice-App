import React, { useEffect, useState } from 'react';
import { settingsApi } from '../api';
import toast from 'react-hot-toast';
import { Save, Upload, Palette, HardDrive, CheckCircle, XCircle } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || '';

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: '', address: '', email: '', phone: '', website: '',
    currency_symbol: '$', tax_rate: 0, payment_terms: 'Net 30',
    invoice_prefix: 'INV', bank_details: '', primary_color: '#1a56db'
  });
  const [logoUrl, setLogoUrl] = useState(null);
  const [driveConfigured, setDriveConfigured] = useState(false);
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
        bank_details: d.bank_details || '',
        primary_color: d.primary_color || '#1a56db',
      });
      if (d.logo_url) setLogoUrl(`${BASE}${d.logo_url}?t=${Date.now()}`);
      setDriveConfigured(!!d.drive_configured);
    });
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsApi.update(form);
      toast.success('Settings saved! Regenerate existing invoice PDFs to apply the new design.');
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
      setLogoUrl(`${BASE}/api/settings/logo?t=${Date.now()}`);
      toast.success('Logo uploaded! It will appear on new invoices.');
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
        <p className="text-gray-500 text-sm">Your company details, branding, and integrations.</p>
      </div>

      {/* Brand Preview */}
      <div className="card overflow-hidden mb-5">
        <div className="p-5 flex items-center gap-4 text-white" style={{ background: form.primary_color }}>
          {logoUrl
            ? <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
            : <span className="text-2xl font-bold">{form.name || 'Company Name'}</span>
          }
          <div className="ml-auto text-right opacity-90">
            <p className="text-xl font-bold">INVOICE</p>
            <p className="text-xs">#INV-2025-1000</p>
          </div>
        </div>
        <div className="px-5 py-2 bg-gray-50 text-xs text-gray-400 text-center">
          Invoice header preview — updates as you type
        </div>
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
      </Section>

      <Section title="🎨 Brand & Design">
        {/* Logo */}
        <div className="mb-5">
          <label className="label">Company Logo</label>
          <div className="flex items-center gap-4">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="h-14 object-contain border border-gray-200 rounded-lg p-1 bg-white" />
              : <div className="h-14 w-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400">No logo</div>
            }
            <div>
              <label className="btn-secondary cursor-pointer inline-flex">
                <Upload size={15} />
                {uploading ? 'Uploading...' : 'Upload Logo'}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              </label>
              <p className="text-xs text-gray-400 mt-1">PNG or JPG, max 5MB. Shows in PDF header.</p>
            </div>
          </div>
        </div>

        {/* Brand color */}
        <div>
          <label className="label flex items-center gap-2">
            <Palette size={14} /> Brand / Accent Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.primary_color}
              onChange={e => setField('primary_color', e.target.value)}
              className="h-10 w-16 rounded border border-gray-300 cursor-pointer p-0.5"
            />
            <input
              className="input w-32 font-mono text-sm"
              value={form.primary_color}
              onChange={e => setField('primary_color', e.target.value)}
              placeholder="#1a56db"
            />
            <div className="flex gap-2">
              {['#1a56db','#059669','#7c3aed','#dc2626','#d97706','#0891b2','#111827'].map(c => (
                <button key={c} type="button" title={c}
                  onClick={() => setField('primary_color', c)}
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: form.primary_color === c ? '#000' : 'transparent' }}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">Used for the invoice header, table headers, and totals row.</p>
        </div>
      </Section>

      <Section title="💰 Invoice Preferences">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Invoice Prefix</label>
            <input className="input" value={form.invoice_prefix}
              onChange={e => setField('invoice_prefix', e.target.value.toUpperCase())}
              placeholder="INV" maxLength={10} />
            <p className="text-xs text-gray-400 mt-1">e.g. INV → INV-2025-1000</p>
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

      <Section title="☁️ Google Drive Integration">
        <div className="flex items-start gap-3 mb-4">
          {driveConfigured
            ? <CheckCircle size={20} className="text-emerald-500 mt-0.5 shrink-0" />
            : <XCircle size={20} className="text-gray-400 mt-0.5 shrink-0" />
          }
          <div>
            <p className="font-medium text-sm text-gray-900">
              {driveConfigured ? 'Connected — invoices will auto-save to Drive' : 'Not configured'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {driveConfigured
                ? 'Each new invoice PDF is automatically uploaded to your Google Drive folder.'
                : 'Add two environment variables in Render to enable auto-upload.'}
            </p>
          </div>
        </div>

        {!driveConfigured && (
          <div className="space-y-3 text-sm text-gray-700">
            <p className="font-medium">Setup steps (one-time, ~10 min):</p>
            <ol className="space-y-2 list-decimal list-inside text-sm">
              <li>Go to <span className="font-mono text-xs bg-gray-100 px-1 rounded">console.cloud.google.com</span> → create a project → enable <strong>Google Drive API</strong></li>
              <li>IAM & Admin → Service Accounts → Create → download the JSON key</li>
              <li>In Google Drive, create a folder (e.g. <em>Invoices</em>), open it, copy the ID from the URL</li>
              <li>Share that folder with the service account email (from the JSON key: <code>client_email</code>)</li>
              <li>Add these to Render → invoice-backend → Environment:</li>
            </ol>
            <div className="bg-gray-900 text-green-400 font-mono text-xs p-3 rounded-lg space-y-1">
              <p>GOOGLE_SERVICE_ACCOUNT_JSON = <span className="text-yellow-400">{'{'}"type":"service_account",...{'}'}</span></p>
              <p>GOOGLE_DRIVE_FOLDER_ID = <span className="text-yellow-400">1AbCdEfGhIjKlMnOpQrStUvWxYz</span></p>
            </div>
            <p className="text-xs text-gray-400">Paste the entire JSON file contents as the value for GOOGLE_SERVICE_ACCOUNT_JSON.</p>
          </div>
        )}
      </Section>

      <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-3">
        <Save size={16} />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  );
}
