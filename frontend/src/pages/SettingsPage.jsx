import React, { useEffect, useState } from 'react';
import { settingsApi } from '../api';
import toast from 'react-hot-toast';
import { Save, Upload, Palette, CheckCircle, XCircle, ExternalLink, Unlink } from 'lucide-react';
import InvoiceLayoutEditor from '../components/InvoiceLayoutEditor';

const BASE = import.meta.env.VITE_API_URL || '';

// ── Currency list (matches InvoiceForm) ───────────────────────────────────────
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

// Dropdown + editable symbol input
function CurrencyPicker({ value, onChange }) {
  const matched = CURRENCIES.find(c => c.sym === value);
  return (
    <div className="space-y-2">
      <select
        className="input"
        value={matched ? matched.code : '__custom__'}
        onChange={e => {
          const c = CURRENCIES.find(x => x.code === e.target.value);
          if (c) onChange(c.sym);
        }}
      >
        {CURRENCIES.map(c => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
        {!matched && <option value="__custom__">Custom / Other</option>}
      </select>
      <input
        className="input font-mono"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="RM / $ / €"
        maxLength={6}
      />
      <p className="text-xs text-gray-400">Edit the symbol above for any currency not in the list.</p>
    </div>
  );
}

const TEMPLATE_OPTIONS = [
  {
    id: 'classic',
    label: 'Classic',
    desc: 'Colored header band with logo, clean rows',
    preview: (color) => (
      <svg viewBox="0 0 120 80" className="w-full h-full">
        <rect width="120" height="80" fill="#f9fafb" rx="2" />
        <rect width="120" height="22" fill={color} rx="2" />
        <rect x="8" y="6" width="30" height="10" fill="rgba(255,255,255,0.3)" rx="1" />
        <rect x="70" y="6" width="42" height="5" fill="rgba(255,255,255,0.5)" rx="1" />
        <rect x="70" y="14" width="30" height="3" fill="rgba(255,255,255,0.3)" rx="1" />
        <rect x="8" y="28" width="50" height="3" fill="#d1d5db" rx="1" />
        <rect x="8" y="34" width="35" height="2" fill="#e5e7eb" rx="1" />
        <rect x="8" y="44" width="104" height="6" fill={color} rx="1" />
        <rect x="8" y="53" width="104" height="3" fill="#f3f4f6" rx="1" />
        <rect x="8" y="58" width="104" height="3" fill="#f3f4f6" rx="1" />
        <rect x="70" y="67" width="42" height="8" fill={color} rx="1" />
      </svg>
    ),
  },
  {
    id: 'minimal',
    label: 'Minimal',
    desc: 'White background, thin accent line, two-column',
    preview: (color) => (
      <svg viewBox="0 0 120 80" className="w-full h-full">
        <rect width="120" height="80" fill="#fff" rx="2" />
        <rect width="120" height="3" fill={color} rx="1" />
        <rect x="8" y="9" width="30" height="8" fill="#e5e7eb" rx="1" />
        <rect x="70" y="9" width="42" height="5" fill="#e5e7eb" rx="1" />
        <rect x="70" y="16" width="25" height="3" fill="#f3f4f6" rx="1" />
        <rect x="8" y="22" width="40" height="2" fill={color} rx="1" />
        <rect x="8" y="27" width="55" height="2" fill="#e5e7eb" rx="1" />
        <rect x="8" y="32" width="35" height="2" fill="#f3f4f6" rx="1" />
        <rect x="8" y="40" width="104" height="5" fill="#f3f4f6" rx="1" />
        <rect x="8" y="48" width="104" height="2" fill="#f3f4f6" rx="1" />
        <rect x="8" y="53" width="104" height="2" fill="#f3f4f6" rx="1" />
        <rect x="70" y="60" width="42" height="6" fill={color} rx="1" />
        <rect x="8" y="72" width="104" height="1" fill={color} rx="1" />
      </svg>
    ),
  },
  {
    id: 'modern',
    label: 'Modern',
    desc: 'Colored sidebar with company info on left',
    preview: (color) => (
      <svg viewBox="0 0 120 80" className="w-full h-full">
        <rect width="120" height="80" fill="#f9fafb" rx="2" />
        <rect width="35" height="80" fill={color} rx="2" />
        <rect x="5" y="8" width="25" height="10" fill="rgba(255,255,255,0.3)" rx="1" />
        <rect x="5" y="22" width="25" height="2" fill="rgba(255,255,255,0.4)" rx="1" />
        <rect x="5" y="27" width="20" height="2" fill="rgba(255,255,255,0.3)" rx="1" />
        <rect x="5" y="32" width="22" height="2" fill="rgba(255,255,255,0.3)" rx="1" />
        <rect x="5" y="45" width="25" height="2" fill="rgba(255,255,255,0.4)" rx="1" />
        <rect x="5" y="50" width="18" height="2" fill="rgba(255,255,255,0.3)" rx="1" />
        <rect x="5" y="55" width="20" height="2" fill="rgba(255,255,255,0.3)" rx="1" />
        <rect x="42" y="8" width="70" height="6" fill="#d1d5db" rx="1" />
        <rect x="42" y="17" width="70" height="4" fill="#e5e7eb" rx="1" />
        <rect x="42" y="24" width="70" height="4" fill="#e5e7eb" rx="1" />
        <rect x="42" y="33" width="70" height="5" fill="#d1d5db" rx="1" />
        <rect x="42" y="41" width="70" height="3" fill="#f3f4f6" rx="1" />
        <rect x="42" y="47" width="70" height="3" fill="#f3f4f6" rx="1" />
        <rect x="72" y="58" width="40" height="8" fill={color} rx="1" />
      </svg>
    ),
  },
];

function Section({ title, children }) {
  return (
    <div className="card p-5 mb-5">
      <h2 className="font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: '', address: '', email: '', phone: '', website: '',
    currency_symbol: '$', tax_rate: 0, payment_terms: 'Net 30',
    invoice_prefix: 'INV', bank_details: '', primary_color: '#1a56db',
    template_style: 'classic', logo_position: 'left', header_layout: null,
    header_height: 'normal', company_name_size: 'auto',
    header_show_address: true, header_show_contact: true,
  });
  const [logoUrl, setLogoUrl] = useState(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveOAuthConfigured, setDriveOAuthConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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
        template_style: d.template_style || 'classic',
        logo_position: d.logo_position || 'left',
        header_layout: d.header_layout || null,
        header_height: d.header_height || 'normal',
        company_name_size: d.company_name_size || 'auto',
        header_show_address: d.header_show_address !== 0 && d.header_show_address !== false,
        header_show_contact: d.header_show_contact !== 0 && d.header_show_contact !== false,
      });
      if (d.logo_url) setLogoUrl(`${BASE}${d.logo_url}?t=${Date.now()}`);
      setDriveConnected(!!d.drive_connected);
      setDriveOAuthConfigured(!!d.drive_oauth_configured);
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
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" className="hidden" onChange={handleLogo} />
              </label>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG or WebP — max 5 MB. Shows in PDF header.</p>
            </div>
          </div>
        </div>

        {/* Logo position */}
        <div className="mb-5">
          <label className="label">Logo Position on Invoice</label>
          <div className="flex gap-3">
            {['left', 'center', 'right'].map(pos => (
              <button key={pos} type="button"
                onClick={() => setField('logo_position', pos)}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium capitalize transition-all ${
                  form.logo_position === pos
                    ? 'border-transparent text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
                style={form.logo_position === pos ? { background: form.primary_color } : {}}>
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Invoice template */}
        <div className="mb-5">
          <label className="label">Invoice Template</label>
          <div className="grid grid-cols-3 gap-3">
            {TEMPLATE_OPTIONS.map(tpl => (
              <button key={tpl.id} type="button"
                onClick={() => setField('template_style', tpl.id)}
                className={`rounded-xl border-2 p-2 text-left transition-all ${
                  form.template_style === tpl.id
                    ? 'border-transparent shadow-md'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                style={form.template_style === tpl.id ? { borderColor: form.primary_color } : {}}>
                <div className="h-20 mb-2 rounded overflow-hidden">
                  {tpl.preview(form.primary_color)}
                </div>
                <p className="text-xs font-semibold text-gray-900">{tpl.label}</p>
                <p className="text-xs text-gray-400 leading-tight mt-0.5">{tpl.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Header layout drag editor — Classic template only */}
        {form.template_style === 'classic' && (
          <div className="mb-5">
            <label className="label">Header Layout (Classic template)</label>
            <InvoiceLayoutEditor
              company={form}
              layout={form.header_layout}
              onChange={(newLayout) => setField('header_layout', newLayout)}
            />
          </div>
        )}

        {/* Header design controls — Classic only */}
        {form.template_style === 'classic' && (
          <div className="mb-5 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Header Design</p>

            {/* Company name size */}
            <div>
              <label className="label">Company Name Size</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { v: 'auto', label: 'Auto',  hint: 'Shrinks if long' },
                  { v: 'sm',   label: 'Small',  hint: '11pt' },
                  { v: 'md',   label: 'Medium', hint: '16pt' },
                  { v: 'lg',   label: 'Large',  hint: '22pt' },
                ].map(({ v, label, hint }) => (
                  <button key={v} type="button"
                    onClick={() => setField('company_name_size', v)}
                    title={hint}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      form.company_name_size === v
                        ? 'text-white border-transparent'
                        : 'border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}
                    style={form.company_name_size === v ? { background: form.primary_color } : {}}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Auto shrinks the font when your company name is long — fixes text overlapping the address.</p>
            </div>

            {/* Header height */}
            <div>
              <label className="label">Header Height</label>
              <div className="flex gap-2">
                {[
                  { v: 'compact',   label: 'Compact' },
                  { v: 'normal',    label: 'Normal' },
                  { v: 'spacious',  label: 'Spacious' },
                ].map(({ v, label }) => (
                  <button key={v} type="button"
                    onClick={() => setField('header_height', v)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      form.header_height === v
                        ? 'text-white border-transparent'
                        : 'border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}
                    style={form.header_height === v ? { background: form.primary_color } : {}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Show/hide toggles */}
            <div>
              <label className="label">Show in Header</label>
              <div className="flex flex-col gap-2">
                {[
                  { key: 'header_show_address', label: 'Company Address' },
                  { key: 'header_show_contact', label: 'Email & Phone' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      onClick={() => setField(key, !form[key])}
                      className={`relative w-10 h-5 rounded-full transition-colors ${form[key] ? 'bg-primary-600' : 'bg-gray-300'}`}
                      style={form[key] ? { background: form.primary_color } : {}}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

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
            <CurrencyPicker
              value={form.currency_symbol}
              onChange={v => setField('currency_symbol', v)}
            />
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
          {driveConnected
            ? <CheckCircle size={20} className="text-emerald-500 mt-0.5 shrink-0" />
            : <XCircle size={20} className="text-gray-400 mt-0.5 shrink-0" />
          }
          <div className="flex-1">
            <p className="font-medium text-sm text-gray-900">
              {driveConnected ? '✅ Connected — invoices auto-save to Google Drive' : 'Not connected'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {driveConnected
                ? 'Every new invoice PDF is uploaded to your Google Drive folder automatically.'
                : 'Connect your Google account to auto-upload invoice PDFs to Drive.'}
            </p>
          </div>
        </div>

        {driveConnected ? (
          <button type="button" disabled={disconnecting}
            onClick={async () => {
              setDisconnecting(true);
              try {
                await fetch(`${BASE}/api/settings/drive-disconnect`, { method: 'POST' });
                setDriveConnected(false);
                toast.success('Google Drive disconnected');
              } catch { toast.error('Failed to disconnect'); }
              finally { setDisconnecting(false); }
            }}
            className="btn-secondary text-red-600 border-red-200 hover:bg-red-50">
            <Unlink size={15} /> {disconnecting ? 'Disconnecting...' : 'Disconnect Google Drive'}
          </button>
        ) : driveOAuthConfigured ? (
          <a href={`${BASE}/api/settings/drive-auth`}
            className="btn-primary inline-flex items-center gap-2">
            <ExternalLink size={15} /> Connect Google Drive
          </a>
        ) : (
          <div className="space-y-3 text-sm text-gray-700">
            <p className="font-medium">One-time setup in Render (5 min):</p>
            <ol className="space-y-2 list-decimal list-inside text-sm">
              <li>Google Cloud Console → <strong>APIs & Services → Credentials</strong></li>
              <li>Create Credentials → <strong>OAuth 2.0 Client ID</strong> → Web application</li>
              <li>Add Authorized redirect URI:<br/>
                <code className="text-xs bg-gray-100 px-1 rounded">{BASE}/api/settings/drive-callback</code></li>
              <li>Copy the Client ID and Client Secret</li>
              <li>Add to Render → invoice-backend → Environment:</li>
            </ol>
            <div className="bg-gray-900 text-green-400 font-mono text-xs p-3 rounded-lg space-y-1">
              <p>GOOGLE_CLIENT_ID = <span className="text-yellow-400">your-client-id.apps.googleusercontent.com</span></p>
              <p>GOOGLE_CLIENT_SECRET = <span className="text-yellow-400">GOCSPX-...</span></p>
              <p>GOOGLE_DRIVE_FOLDER_ID = <span className="text-yellow-400">1nieW8nyAyR0-Dk07jYDBkP_4f6f28X-2</span></p>
            </div>
            <p className="text-xs text-gray-400">After saving in Render, a "Connect Google Drive" button will appear here.</p>
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
