import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { invoiceApi } from '../api';
import { format } from 'date-fns';
import {
  FileText, DollarSign, Clock, CheckCircle,
  AlertTriangle, PlusCircle, TrendingUp
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    invoiceApi.stats().then(r => setStats(r.data));
    invoiceApi.list({ limit: 5 }).then(r => setRecent(r.data.invoices));
  }, []);

  const cards = stats ? [
    { label: 'Total Invoices', value: stats.total, icon: FileText, color: 'bg-blue-50 text-blue-600', iconBg: 'bg-blue-100' },
    { label: 'Revenue Collected', value: `$${Number(stats.totalRevenue).toFixed(2)}`, icon: DollarSign, color: 'bg-emerald-50 text-emerald-600', iconBg: 'bg-emerald-100' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'bg-yellow-50 text-yellow-600', iconBg: 'bg-yellow-100', sub: `$${Number(stats.pendingAmount).toFixed(2)}` },
    { label: 'Paid', value: stats.paid, icon: CheckCircle, color: 'bg-green-50 text-green-600', iconBg: 'bg-green-100' },
    { label: 'Overdue', value: stats.overdue, icon: AlertTriangle, color: 'bg-red-50 text-red-600', iconBg: 'bg-red-100' },
    { label: 'Drafts', value: stats.draft, icon: TrendingUp, color: 'bg-gray-50 text-gray-600', iconBg: 'bg-gray-100' },
  ] : [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d yyyy')}</p>
        </div>
        <Link to="/invoices/new" className="btn-primary">
          <PlusCircle size={16} />
          New Invoice
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map(card => (
          <div key={card.label} className={`card p-4 ${card.color}`}>
            <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center mb-3`}>
              <card.icon size={18} />
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-xs font-medium opacity-75 mt-1">{card.label}</p>
            {card.sub && <p className="text-xs opacity-60 mt-0.5">{card.sub} outstanding</p>}
          </div>
        ))}
      </div>

      {/* Recent Invoices */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Invoices</h2>
          <Link to="/invoices" className="text-sm text-primary-600 hover:text-primary-800">View all →</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {recent.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p>No invoices yet. <Link to="/invoices/new" className="text-primary-600">Create your first one!</Link></p>
            </div>
          ) : recent.map(inv => (
            <Link key={inv.id} to={`/invoices/${inv.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                  <FileText size={14} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                  <p className="text-xs text-gray-500">{inv.client_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={inv.status} />
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">${Number(inv.total).toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{inv.issue_date}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Tips */}
      <div className="mt-6 card p-5 bg-gradient-to-r from-primary-600 to-primary-700 text-white">
        <h3 className="font-semibold mb-2">📱 Create invoices via WhatsApp!</h3>
        <p className="text-sm opacity-90">
          Connect your WhatsApp, then send a message like:<br />
          <code className="bg-white/20 px-1 rounded text-xs">
            INVOICE{'\n'}Client: John Doe{'\n'}Item: Web Design x1 @ 500{'\n'}Due: 2024-03-15
          </code>
        </p>
        <Link to="/whatsapp" className="inline-block mt-3 text-xs underline opacity-80 hover:opacity-100">
          Connect WhatsApp →
        </Link>
      </div>
    </div>
  );
}
