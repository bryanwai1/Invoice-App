import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { invoiceApi } from '../api';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Download, Edit, Trash2, Send,
  MessageCircle, RefreshCw, CheckCircle, ExternalLink
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import InvoicePreview from '../components/InvoicePreview';

const STATUSES = ['draft', 'pending', 'paid', 'overdue', 'cancelled'];

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [waPhone, setWaPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [regen, setRegen] = useState(false);

  useEffect(() => { load(); }, [id]);

  const load = () => {
    setLoading(true);
    invoiceApi.get(id)
      .then(r => {
        setData(r.data);
        setWaPhone(r.data.whatsapp_phone || r.data.client_phone || '');
      })
      .catch(() => toast.error('Failed to load invoice'))
      .finally(() => setLoading(false));
  };

  const handleStatus = async (status) => {
    try {
      await invoiceApi.updateStatus(id, status);
      toast.success(`Status → ${status}`);
      load();
    } catch { toast.error('Update failed'); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this invoice permanently?')) return;
    await invoiceApi.delete(id);
    toast.success('Invoice deleted');
    navigate('/invoices');
  };

  const handleSendWhatsApp = async () => {
    if (!waPhone) return toast.error('Enter a WhatsApp phone number');
    setSending(true);
    try {
      await invoiceApi.sendWhatsApp(id, waPhone);
      toast.success(`Invoice sent to ${waPhone} via WhatsApp!`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Send failed');
    } finally { setSending(false); }
  };

  const handleRegenPdf = async () => {
    setRegen(true);
    try {
      await invoiceApi.regeneratePdf(id);
      toast.success('PDF regenerated');
      load();
    } catch { toast.error('Regeneration failed'); }
    finally { setRegen(false); }
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64 text-gray-400">Loading...</div>
  );
  if (!data) return <div className="p-6 text-red-500">Invoice not found.</div>;

  const { items = [], company = {} } = data;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-secondary py-2 px-3">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{data.invoice_number}</h1>
              <StatusBadge status={data.status} />
              {data.source === 'whatsapp' && (
                <span className="badge bg-green-100 text-green-700">📱 WhatsApp</span>
              )}
            </div>
            <p className="text-gray-500 text-sm">{data.client_name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleRegenPdf} disabled={regen} className="btn-secondary">
            <RefreshCw size={15} className={regen ? 'animate-spin' : ''} /> Regen PDF
          </button>
          <a href={invoiceApi.downloadUrl(id)} className="btn-secondary" target="_blank" rel="noreferrer">
            <Download size={15} /> Download
          </a>
          {data.drive_link && (
            <a href={data.drive_link} className="btn-secondary" target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Drive
            </a>
          )}
          <Link to={`/invoices/${id}/edit`} className="btn-secondary">
            <Edit size={15} /> Edit
          </Link>
          <button onClick={handleDelete} className="btn-danger">
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Invoice Preview */}
        <div className="lg:col-span-2">
          <InvoicePreview invoice={data} items={items} company={company} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Update Status</h3>
            <div className="space-y-1.5">
              {STATUSES.map(s => (
                <button key={s} onClick={() => handleStatus(s)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    data.status === s
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  {data.status === s && <CheckCircle size={14} />}
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Send via WhatsApp */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
              <MessageCircle size={15} className="text-green-500" /> Send via WhatsApp
            </h3>
            <input
              className="input mb-2" placeholder="+1234567890"
              value={waPhone} onChange={e => setWaPhone(e.target.value)}
            />
            <button onClick={handleSendWhatsApp} disabled={sending}
              className="btn-whatsapp w-full justify-center">
              <Send size={15} />
              {sending ? 'Sending...' : 'Send Invoice PDF'}
            </button>
          </div>

          {/* Meta */}
          <div className="card p-4 text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Created</span>
              <span>{data.created_at ? format(new Date(data.created_at), 'MMM d, yyyy HH:mm') : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Updated</span>
              <span>{data.updated_at ? format(new Date(data.updated_at), 'MMM d, yyyy HH:mm') : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Source</span>
              <span className="capitalize">{data.source || 'manual'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
