import React, { useEffect, useState } from 'react';
import { whatsappApi } from '../api';
import toast from 'react-hot-toast';
import { Wifi, WifiOff, MessageCircle, ExternalLink, RefreshCw } from 'lucide-react';

export default function WhatsAppPage({ socket }) {
  const [status, setStatus] = useState({ status: 'checking' });
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('Hello from Invoice App! 👋');
  const [sending, setSending] = useState(false);

  const checkStatus = async () => {
    const res = await whatsappApi.status();
    setStatus(res.data);
  };

  useEffect(() => {
    checkStatus();
    // Poll every 15 s as fallback (Socket.IO may not connect cross-origin)
    const poll = setInterval(checkStatus, 15000);
    if (socket) {
      socket.on('wa:status', setStatus);
      socket.on('wa:qr', (d) => { setQr(d.qr); setStatus({ status: 'qr_pending' }); });
    }
    return () => {
      clearInterval(poll);
      if (socket) { socket.off('wa:status'); socket.off('wa:qr'); }
    };
  }, [socket]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await whatsappApi.connect();
      setStatus(res.data);
      if (res.data.qr) setQr(res.data.qr);
      if (res.data.status === 'connected') toast.success('WhatsApp already connected!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed — check your Green API credentials in Settings');
    } finally { setLoading(false); }
  };

  const sendTest = async () => {
    if (!testPhone) return toast.error('Enter a phone number');
    setSending(true);
    try {
      await whatsappApi.send(testPhone, testMsg);
      toast.success(`Message sent to ${testPhone}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Send failed');
    } finally { setSending(false); }
  };

  const isConnected = status.status === 'connected';
  const isNotConfigured = status.status === 'not_configured';

  const BACKEND_URL = import.meta.env.VITE_API_URL || window.location.origin;
  const WEBHOOK_URL = `${BACKEND_URL}/api/whatsapp/webhook`;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageCircle className="text-green-500" /> WhatsApp Integration
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Uses Green API — a free WhatsApp cloud service. No phone needs to stay connected.
        </p>
      </div>

      {/* Status */}
      <div className={`card p-5 mb-5 ${isConnected ? 'bg-emerald-50' : isNotConfigured ? 'bg-yellow-50' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-gray-400'}`} />
            <div>
              <p className="font-semibold text-gray-900 capitalize">
                {status.status === 'not_configured' ? 'Not Configured' :
                 status.status === 'connected' ? 'Connected ✓' :
                 status.status === 'checking' ? 'Checking...' : 'Disconnected'}
              </p>
              {isNotConfigured && (
                <p className="text-sm text-yellow-700">Add GREEN_API_INSTANCE_ID and GREEN_API_TOKEN in Render environment variables</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={checkStatus} className="btn-secondary">
              <RefreshCw size={14} /> Refresh
            </button>
            {!isConnected && !isNotConfigured && (
              <button onClick={handleConnect} disabled={loading} className="btn-whatsapp">
                <Wifi size={15} /> {loading ? 'Checking...' : 'Connect'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code */}
      {qr && !isConnected && (
        <div className="card p-6 mb-5 text-center">
          <h2 className="font-semibold text-gray-900 mb-2">Scan this QR Code</h2>
          <p className="text-sm text-gray-500 mb-4">Or scan it on the Green API dashboard</p>
          <div className="inline-block p-3 bg-white border-2 border-gray-200 rounded-xl">
            <img src={qr} alt="WhatsApp QR" className="w-56 h-56" />
          </div>
        </div>
      )}

      {/* Setup Guide */}
      <div className="card p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4">🔧 Setup Guide (one-time, ~5 min)</h2>
        <ol className="space-y-4 text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
            <div>
              <p className="font-medium">Create a free Green API account</p>
              <a href="https://green-api.com" target="_blank" rel="noreferrer"
                className="text-primary-600 hover:underline flex items-center gap-1 mt-1">
                green-api.com <ExternalLink size={12} />
              </a>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
            <div>
              <p className="font-medium">Create an Instance → scan QR with your WhatsApp</p>
              <p className="text-gray-500 text-xs mt-1">After login: Console → Create Instance → scan with WhatsApp (Settings → Linked Devices)</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
            <div>
              <p className="font-medium">Copy your Instance ID and API Token</p>
              <p className="text-gray-500 text-xs mt-1">Found on the Instance page in Green API dashboard</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">4</span>
            <div>
              <p className="font-medium">Add to Render Environment Variables (invoice-backend)</p>
              <div className="mt-2 bg-gray-900 text-green-400 font-mono text-xs p-3 rounded-lg space-y-1">
                <p>GREEN_API_INSTANCE_ID = <span className="text-yellow-400">your-instance-id</span></p>
                <p>GREEN_API_TOKEN = <span className="text-yellow-400">your-api-token</span></p>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">5</span>
            <div>
              <p className="font-medium">Set Webhook URL in Green API dashboard</p>
              <div className="mt-2 bg-gray-900 text-green-400 font-mono text-xs p-3 rounded-lg break-all">
                {WEBHOOK_URL}
              </div>
              <p className="text-gray-500 text-xs mt-1">Instance settings → Webhook URL → paste above URL → Save</p>
            </div>
          </li>
        </ol>
      </div>

      {/* How to use */}
      <div className="card p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-3">📋 How to Create Invoices via WhatsApp</h2>
        <p className="text-sm text-gray-600 mb-3">Send this format to your connected WhatsApp number:</p>
        <div className="bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg whitespace-pre">
{`INVOICE
Client: John Doe
Email: john@example.com
Phone: +1234567890
PO: PO-2024-001
Due: 2024-03-15
Item: Web Design x1 @ 1500
Item: Hosting x12 @ 25
Tax: 10
Notes: Payment due within 30 days`}
        </div>
      </div>

      {/* Test */}
      {isConnected && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">💬 Send Test Message</h2>
          <div className="space-y-3">
            <div>
              <label className="label">Phone (with country code)</label>
              <input className="input" placeholder="+601234567890"
                value={testPhone} onChange={e => setTestPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea className="input resize-none" rows={2}
                value={testMsg} onChange={e => setTestMsg(e.target.value)} />
            </div>
            <button onClick={sendTest} disabled={sending} className="btn-whatsapp">
              <MessageCircle size={15} /> {sending ? 'Sending...' : 'Send Test'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
