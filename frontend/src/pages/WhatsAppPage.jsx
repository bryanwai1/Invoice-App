import React, { useEffect, useState } from 'react';
import { whatsappApi } from '../api';
import toast from 'react-hot-toast';
import { Wifi, WifiOff, RefreshCw, MessageCircle, Smartphone } from 'lucide-react';

export default function WhatsAppPage({ socket }) {
  const [status, setStatus] = useState({ status: 'disconnected' });
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('Hello from Invoice App! 👋');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Get initial status
    whatsappApi.status().then(r => {
      setStatus(r.data);
      setQr(r.data.qr);
    });

    if (socket) {
      socket.on('wa:status', (data) => {
        setStatus(data);
        if (data.status === 'connected') setQr(null);
      });
      socket.on('wa:qr', (data) => {
        setQr(data.qr);
        setStatus(prev => ({ ...prev, status: 'qr_pending' }));
      });
      return () => {
        socket.off('wa:status');
        socket.off('wa:qr');
      };
    }
  }, [socket]);

  const connect = async () => {
    setLoading(true);
    try {
      await whatsappApi.connect();
      toast.success('WhatsApp initialization started. Scan the QR code.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect WhatsApp?')) return;
    try {
      await whatsappApi.disconnect();
      toast.success('WhatsApp disconnected');
      setQr(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Disconnect failed');
    }
  };

  const sendTest = async () => {
    if (!testPhone) return toast.error('Enter a phone number');
    setSending(true);
    try {
      await whatsappApi.send(testPhone, testMsg);
      toast.success(`Message sent to ${testPhone}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const isConnected = status.status === 'connected';
  const isPending = ['initializing', 'qr_pending', 'authenticated'].includes(status.status);

  const statusConfig = {
    connected: { label: 'Connected', dot: 'bg-emerald-400', text: 'text-emerald-700', bg: 'bg-emerald-50' },
    qr_pending: { label: 'Scan QR Code', dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-700', bg: 'bg-yellow-50' },
    initializing: { label: 'Initializing...', dot: 'bg-blue-400 animate-pulse', text: 'text-blue-700', bg: 'bg-blue-50' },
    authenticated: { label: 'Authenticating...', dot: 'bg-blue-400 animate-pulse', text: 'text-blue-700', bg: 'bg-blue-50' },
    disconnected: { label: 'Disconnected', dot: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-50' },
  };
  const cfg = statusConfig[status.status] || statusConfig.disconnected;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageCircle className="text-green-500" /> WhatsApp Integration
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Connect WhatsApp to receive invoice requests and send PDFs automatically.
        </p>
      </div>

      {/* Status Card */}
      <div className={`card p-5 mb-5 ${cfg.bg} border-0`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
            <div>
              <p className={`font-semibold ${cfg.text}`}>{cfg.label}</p>
              {status.phone && <p className="text-sm text-gray-600">Logged in as: +{status.phone}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            {!isConnected && !isPending && (
              <button onClick={connect} disabled={loading} className="btn-whatsapp">
                <Wifi size={15} />
                {loading ? 'Starting...' : 'Connect WhatsApp'}
              </button>
            )}
            {isPending && (
              <button disabled className="btn-secondary opacity-75">
                <RefreshCw size={15} className="animate-spin" /> Waiting...
              </button>
            )}
            {isConnected && (
              <button onClick={disconnect} className="btn-danger">
                <WifiOff size={15} /> Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code */}
      {qr && !isConnected && (
        <div className="card p-6 mb-5 text-center">
          <h2 className="font-semibold text-gray-900 mb-2 flex items-center justify-center gap-2">
            <Smartphone size={18} /> Scan QR Code with WhatsApp
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Open WhatsApp → Menu → Linked Devices → Link a Device
          </p>
          <div className="inline-block p-3 bg-white border-2 border-gray-200 rounded-xl">
            <img src={qr} alt="WhatsApp QR Code" className="w-56 h-56" />
          </div>
          <p className="text-xs text-gray-400 mt-3">QR code refreshes automatically</p>
        </div>
      )}

      {/* How it works */}
      <div className="card p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-3">📋 How to Create Invoices via WhatsApp</h2>
        <p className="text-sm text-gray-600 mb-3">
          Send the following format to your connected WhatsApp number:
        </p>
        <div className="bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg whitespace-pre">
{`INVOICE
Client: John Doe
Email: john@example.com
Phone: +1234567890
Address: 123 Main St, NY
PO: PO-2024-001
Due: 2024-03-15
Item: Web Design x1 @ 1500
Item: Hosting x12 @ 25
Tax: 10
Discount: 50
Notes: Payment due within 30 days`}
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-500">
          <div className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Item format:</strong> Description xQty @ Price</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Tax/Discount</strong> are optional</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>PO number</strong> is optional</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>PDF is sent back automatically</span>
          </div>
        </div>
      </div>

      {/* Test Message */}
      {isConnected && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <MessageCircle size={16} /> Send Test Message
          </h2>
          <div className="space-y-3">
            <div>
              <label className="label">Phone Number (with country code)</label>
              <input className="input" placeholder="+1234567890"
                value={testPhone} onChange={e => setTestPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea className="input resize-none" rows={2}
                value={testMsg} onChange={e => setTestMsg(e.target.value)} />
            </div>
            <button onClick={sendTest} disabled={sending} className="btn-whatsapp">
              <MessageCircle size={15} />
              {sending ? 'Sending...' : 'Send Test Message'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
