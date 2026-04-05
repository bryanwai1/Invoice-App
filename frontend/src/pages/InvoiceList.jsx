import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { invoiceApi } from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  FileText, PlusCircle, Search, Download,
  Trash2, Edit, RefreshCw, CheckCircle,
  LayoutList, Users, ChevronDown, ChevronRight
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';

const ALL_STATUSES = ['draft', 'pending', 'paid', 'overdue', 'cancelled'];
const FILTER_TABS  = ['', 'draft', 'pending', 'paid', 'overdue', 'cancelled'];

const STATUS_STYLES = {
  paid:      'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  pending:   'bg-amber-50   text-amber-700   hover:bg-amber-100',
  overdue:   'bg-red-50     text-red-700     hover:bg-red-100',
  draft:     'bg-gray-100   text-gray-600    hover:bg-gray-200',
  cancelled: 'bg-gray-100   text-gray-500    hover:bg-gray-200',
};

// Inline status dropdown
function StatusDropdown({ inv, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer ${STATUS_STYLES[inv.status] || STATUS_STYLES.draft}`}
      >
        {inv.status}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[130px]">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); onStatusChange(inv.id, s); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 flex items-center gap-2 ${
                s === inv.status ? 'text-primary-600' : 'text-gray-700'
              }`}
            >
              {s === inv.status && <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />}
              {s !== inv.status && <span className="w-1.5 h-1.5 shrink-0" />}
              <span className="capitalize">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// A single invoice row
function InvoiceRow({ inv, sym, onStatusChange, onDelete }) {
  const isPaid = inv.status === 'paid';

  return (
    <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <td className="px-4 py-3">
        <Link to={`/invoices/${inv.id}`} className="font-medium text-primary-600 hover:text-primary-800">
          {inv.invoice_number}
        </Link>
        {inv.source === 'whatsapp' && (
          <span title="Created via WhatsApp" className="ml-1 text-green-500">📱</span>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900">{inv.client_name}</p>
        {inv.client_email && <p className="text-xs text-gray-400">{inv.client_email}</p>}
      </td>
      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{inv.po_number || '—'}</td>
      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell text-xs">
        {inv.issue_date ? format(new Date(inv.issue_date), 'MMM d, yyyy') : '—'}
      </td>
      <td className="px-4 py-3 text-gray-500 hidden lg:table-cell text-xs">
        {inv.due_date ? format(new Date(inv.due_date), 'MMM d, yyyy') : '—'}
      </td>
      <td className="px-4 py-3">
        <StatusDropdown inv={inv} onStatusChange={onStatusChange} />
      </td>
      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
        {sym}{Number(inv.total || 0).toFixed(2)}
      </td>
      {/* Quick actions — always visible */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {/* Mark as Paid — only when not already paid */}
          {!isPaid && (
            <button
              onClick={() => onStatusChange(inv.id, 'paid')}
              title="Mark as Paid"
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold transition-colors"
            >
              <CheckCircle size={13} /> Paid
            </button>
          )}
          <a
            href={invoiceApi.downloadUrl(inv.id)}
            title="Download PDF"
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            target="_blank" rel="noreferrer"
          >
            <Download size={14} />
          </a>
          <Link
            to={`/invoices/${inv.id}/edit`}
            title="Edit"
            className="p-1.5 rounded-md hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
          >
            <Edit size={14} />
          </Link>
          <button
            onClick={() => onDelete(inv)}
            title="Delete"
            className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Client card (By Client view) ──────────────────────────────────────────────
function ClientGroup({ clientName, invoices, sym, onStatusChange, onDelete }) {
  const [collapsed, setCollapsed] = useState(false);
  const total = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const paid  = invoices.filter(i => i.status === 'paid').length;

  return (
    <div className="card overflow-hidden mb-3">
      {/* Client header row */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm shrink-0">
          {clientName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{clientName}</p>
          <p className="text-xs text-gray-400">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} · {paid} paid · {sym}{total.toFixed(2)} total
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {invoices.some(i => i.status === 'overdue') && (
            <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Overdue</span>
          )}
          {invoices.some(i => i.status === 'pending') && (
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
          )}
          {collapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {/* Invoices under this client */}
      {!collapsed && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Invoice #</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs hidden sm:table-cell">Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs hidden md:table-cell">Due</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Status</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Amount</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link to={`/invoices/${inv.id}`} className="font-medium text-primary-600 hover:text-primary-800 text-sm">
                      {inv.invoice_number}
                    </Link>
                    {inv.source === 'whatsapp' && <span className="ml-1 text-green-500 text-xs">📱</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 hidden sm:table-cell">
                    {inv.issue_date ? format(new Date(inv.issue_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell">
                    {inv.due_date ? format(new Date(inv.due_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusDropdown inv={inv} onStatusChange={onStatusChange} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900 tabular-nums text-sm">
                    {sym}{Number(inv.total || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {inv.status !== 'paid' && (
                        <button
                          onClick={() => onStatusChange(inv.id, 'paid')}
                          title="Mark as Paid"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold"
                        >
                          <CheckCircle size={12} /> Paid
                        </button>
                      )}
                      <a href={invoiceApi.downloadUrl(inv.id)} title="Download PDF"
                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                        target="_blank" rel="noreferrer">
                        <Download size={13} />
                      </a>
                      <Link to={`/invoices/${inv.id}/edit`} title="Edit"
                        className="p-1.5 rounded-md hover:bg-blue-50 text-gray-400 hover:text-blue-600">
                        <Edit size={13} />
                      </Link>
                      <button onClick={() => onDelete(inv)} title="Delete"
                        className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function InvoiceList() {
  const [invoices, setInvoices]       = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading]         = useState(false);
  const [view, setView]               = useState('table'); // 'table' | 'clients'
  const [settings, setSettings]       = useState({});

  const sym = settings.currency_symbol || '$';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoiceApi.list({ page, limit: 50, search, status: statusFilter });
      setInvoices(res.data.invoices);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Load currency symbol from settings
  useEffect(() => {
    import('../api').then(({ settingsApi }) => {
      settingsApi.get().then(r => setSettings(r.data)).catch(() => {});
    });
  }, []);

  const handleStatusChange = async (invId, newStatus) => {
    try {
      await invoiceApi.updateStatus(invId, newStatus);
      toast.success(`Marked as ${newStatus}`);
      setInvoices(prev => prev.map(i => i.id === invId ? { ...i, status: newStatus } : i));
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (inv) => {
    if (!confirm(`Delete invoice ${inv.invoice_number}?`)) return;
    try {
      await invoiceApi.delete(inv.id);
      toast.success('Invoice deleted');
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      setTotal(t => t - 1);
    } catch {
      toast.error('Delete failed');
    }
  };

  // Group invoices by client for "By Client" view
  const clientGroups = invoices.reduce((acc, inv) => {
    const key = inv.client_name || 'Unknown Client';
    if (!acc[key]) acc[key] = [];
    acc[key].push(inv);
    return acc;
  }, {});
  const sortedClients = Object.keys(clientGroups).sort((a, b) => a.localeCompare(b));

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 text-sm">{total} invoice{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                view === 'table' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <LayoutList size={14} /> List
            </button>
            <button
              onClick={() => setView('clients')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-gray-200 ${
                view === 'clients' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Users size={14} /> By Client
            </button>
          </div>
          <Link to="/invoices/new" className="btn-primary">
            <PlusCircle size={16} /> New Invoice
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by client, invoice #, or PO..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTER_TABS.map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border capitalize ${
                statusFilter === s
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <button onClick={load} className="btn-secondary" title="Refresh">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── TABLE VIEW ── */}
      {view === 'table' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">PO #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Due</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading...</td></tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <FileText size={40} className="mx-auto mb-3 opacity-30" />
                      <p>No invoices found.</p>
                      <Link to="/invoices/new" className="text-primary-600 text-sm mt-1 inline-block">Create one →</Link>
                    </td>
                  </tr>
                ) : invoices.map(inv => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    sym={sym}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1} className="btn-secondary py-1 px-3">← Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages} className="btn-secondary py-1 px-3">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BY CLIENT VIEW ── */}
      {view === 'clients' && (
        <div>
          {loading ? (
            <div className="card p-12 text-center text-gray-400">Loading...</div>
          ) : sortedClients.length === 0 ? (
            <div className="card p-12 text-center text-gray-400">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p>No invoices found.</p>
              <Link to="/invoices/new" className="text-primary-600 text-sm mt-1 inline-block">Create one →</Link>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">
                {sortedClients.length} client{sortedClients.length !== 1 ? 's' : ''}
              </p>
              {sortedClients.map(client => (
                <ClientGroup
                  key={client}
                  clientName={client}
                  invoices={clientGroups[client]}
                  sym={sym}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))}
            </>
          )}
        </div>
      )}

    </div>
  );
}
