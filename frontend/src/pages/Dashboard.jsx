import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { invoiceApi, settingsApi } from '../api';
import { format } from 'date-fns';
import {
  FileText, DollarSign, Clock, CheckCircle,
  AlertTriangle, PlusCircle, TrendingUp, Users, Tag, ChevronDown,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';

function fmt(n) { return Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function Dashboard() {
  const [stats, setStats]           = useState(null);
  const [recent, setRecent]         = useState([]);
  const [breakdown, setBreakdown]   = useState(null);
  const [sym, setSym]               = useState('$');
  const [selectedClient, setSelectedClient] = useState('');
  const [loadingCat, setLoadingCat] = useState(false);

  // Load global stats + settings + initial breakdown
  useEffect(() => {
    invoiceApi.stats().then(r => setStats(r.data));
    invoiceApi.list({ limit: 5 }).then(r => setRecent(r.data.invoices));
    settingsApi.get().then(r => setSym(r.data.currency_symbol || '$'));
    invoiceApi.breakdown().then(r => setBreakdown(r.data));
  }, []);

  // Re-fetch categories when client filter changes
  const handleClientChange = useCallback(async (client) => {
    setSelectedClient(client);
    setLoadingCat(true);
    try {
      const params = client ? { client } : {};
      const r = await invoiceApi.breakdown(params);
      setBreakdown(r.data);
      // Also refresh recent invoices filtered by client
      const listParams = { limit: 5 };
      if (client) listParams.search = client;
      const lr = await invoiceApi.list(listParams);
      setRecent(lr.data.invoices.filter(inv => !client || inv.client_name === client));
    } finally { setLoadingCat(false); }
  }, []);

  // Stats to show — from global stats or per-client breakdown
  const clientRow = selectedClient && breakdown?.by_client?.find(c => c.client_name === selectedClient);

  const cards = stats ? [
    {
      label: 'Total Invoices',
      value: clientRow ? clientRow.invoice_count : stats.total,
      icon: FileText, color: 'bg-blue-50 text-blue-600', iconBg: 'bg-blue-100',
    },
    {
      label: 'Revenue Collected',
      value: `${sym}${fmt(clientRow ? clientRow.total_paid : stats.totalRevenue)}`,
      icon: DollarSign, color: 'bg-emerald-50 text-emerald-600', iconBg: 'bg-emerald-100',
    },
    {
      label: 'Total Invoiced',
      value: `${sym}${fmt(clientRow ? clientRow.total_invoiced : (stats.totalRevenue + stats.pendingAmount))}`,
      icon: TrendingUp, color: 'bg-indigo-50 text-indigo-600', iconBg: 'bg-indigo-100',
    },
    {
      label: 'Pending',
      value: clientRow ? `${sym}${fmt(clientRow.total_pending)}` : stats.pending,
      sub: clientRow ? null : `${sym}${fmt(stats.pendingAmount)}`,
      icon: Clock, color: 'bg-yellow-50 text-yellow-600', iconBg: 'bg-yellow-100',
    },
    {
      label: 'Paid',
      value: clientRow ? '-' : stats.paid,
      icon: CheckCircle, color: 'bg-green-50 text-green-600', iconBg: 'bg-green-100',
    },
    {
      label: 'Overdue',
      value: clientRow ? `${sym}${fmt(clientRow.total_overdue)}` : stats.overdue,
      icon: AlertTriangle, color: 'bg-red-50 text-red-600', iconBg: 'bg-red-100',
    },
  ] : [];

  const clients = breakdown?.clients || [];
  const byClient = breakdown?.by_client || [];
  const byCategory = breakdown?.by_category || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d yyyy')}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Client filter dropdown */}
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Users size={14} className="text-gray-400" />
            </div>
            <select
              className="input pl-8 pr-8 text-sm min-w-[180px] appearance-none"
              value={selectedClient}
              onChange={e => handleClientChange(e.target.value)}
            >
              <option value="">All Clients</option>
              {clients.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
              <ChevronDown size={14} className="text-gray-400" />
            </div>
          </div>
          <Link to="/invoices/new" className="btn-primary whitespace-nowrap">
            <PlusCircle size={16} />
            New Invoice
          </Link>
        </div>
      </div>

      {/* Client banner when filtered */}
      {selectedClient && clientRow && (
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-800">{selectedClient}</p>
            <p className="text-xs text-blue-500 mt-0.5">
              {clientRow.invoice_count} invoice{clientRow.invoice_count !== 1 ? 's' : ''} ·
              Total invoiced: {sym}{fmt(clientRow.total_invoiced)} ·
              Collected: {sym}{fmt(clientRow.total_paid)}
            </p>
          </div>
          <button
            onClick={() => handleClientChange('')}
            className="text-xs text-blue-400 hover:text-blue-700 underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {cards.map(card => (
          <div key={card.label} className={`card p-4 ${card.color}`}>
            <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center mb-3`}>
              <card.icon size={18} />
            </div>
            <p className="text-2xl font-bold leading-none">{card.value}</p>
            <p className="text-xs font-medium opacity-75 mt-1">{card.label}</p>
            {card.sub && <p className="text-xs opacity-60 mt-0.5">{card.sub} outstanding</p>}
          </div>
        ))}
      </div>

      {/* Breakdown section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">

        {/* Revenue by Client */}
        <div className="card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <Users size={15} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Revenue by Client</h2>
          </div>
          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {byClient.length === 0 ? (
              <p className="text-sm text-gray-400 p-4 text-center">No data yet</p>
            ) : byClient.map(row => {
              const paidPct = row.total_invoiced > 0
                ? Math.round((row.total_paid / row.total_invoiced) * 100) : 0;
              const isSelected = selectedClient === row.client_name;
              return (
                <button
                  key={row.client_name}
                  type="button"
                  onClick={() => handleClientChange(isSelected ? '' : row.client_name)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                      {row.client_name}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 shrink-0 ml-2">
                      {sym}{fmt(row.total_invoiced)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${paidPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{paidPct}% paid</span>
                    <span className="text-xs text-gray-400 shrink-0">·</span>
                    <span className="text-xs text-gray-400 shrink-0">{row.invoice_count} inv</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Revenue by Category */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Tag size={15} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900 text-sm">Revenue by Item Type</h2>
            </div>
            {selectedClient && (
              <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                {selectedClient}
              </span>
            )}
            {loadingCat && <span className="text-xs text-gray-400 animate-pulse">loading…</span>}
          </div>
          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {byCategory.length === 0 ? (
              <p className="text-sm text-gray-400 p-4 text-center">No item data yet</p>
            ) : (() => {
              const grandTotal = byCategory.reduce((s, r) => s + r.total, 0);
              return byCategory.map(row => {
                const pct = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
                return (
                  <div key={row.category} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-800 font-medium truncate">{row.category}</span>
                      <span className="text-sm font-semibold text-gray-900 shrink-0 ml-2">
                        {sym}{fmt(row.total)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
                      <span className="text-xs text-gray-400 shrink-0">·</span>
                      <span className="text-xs text-gray-400 shrink-0">{row.item_count}×</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="card mb-6">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            {selectedClient ? `${selectedClient} — Recent` : 'Recent Invoices'}
          </h2>
          <Link to={selectedClient ? `/invoices?search=${encodeURIComponent(selectedClient)}` : '/invoices'}
            className="text-sm text-primary-600 hover:text-primary-800">
            View all →
          </Link>
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
                  <p className="text-sm font-semibold text-gray-900">{sym}{fmt(inv.total)}</p>
                  <p className="text-xs text-gray-400">{inv.issue_date}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Tips */}
      <div className="card p-5 bg-gradient-to-r from-primary-600 to-primary-700 text-white">
        <h3 className="font-semibold mb-2">📱 Create invoices via WhatsApp!</h3>
        <p className="text-sm opacity-90">
          Connect your WhatsApp, then send a message like:<br />
          <code className="bg-white/20 px-1 rounded text-xs">
            Client: John Doe{'\n'}Training Fee, RM 500{'\n'}Design x2 @ RM 300
          </code>
        </p>
        <Link to="/whatsapp" className="inline-block mt-3 text-xs underline opacity-80 hover:opacity-100">
          Connect WhatsApp →
        </Link>
      </div>
    </div>
  );
}
