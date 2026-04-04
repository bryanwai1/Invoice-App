import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { invoiceApi } from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  FileText, PlusCircle, Search, Download,
  Trash2, Edit, MessageCircle, RefreshCw
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['', 'draft', 'pending', 'paid', 'overdue', 'cancelled'];

export default function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoiceApi.list({ page, limit: 15, search, status: statusFilter });
      setInvoices(res.data.invoices);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (inv) => {
    if (!confirm(`Delete invoice ${inv.invoice_number}?`)) return;
    try {
      await invoiceApi.delete(inv.id);
      toast.success('Invoice deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const totalPages = Math.ceil(total / 15);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 text-sm">{total} invoice{total !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/invoices/new" className="btn-primary">
          <PlusCircle size={16} /> New Invoice
        </Link>
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
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                statusFilter === s
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <button onClick={load} className="btn-secondary">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
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
            <tbody className="divide-y divide-gray-100">
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
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
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
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {inv.issue_date ? format(new Date(inv.issue_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                    {inv.due_date ? format(new Date(inv.due_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    ${Number(inv.total).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href={invoiceApi.downloadUrl(inv.id)} title="Download PDF"
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500" target="_blank" rel="noreferrer">
                        <Download size={15} />
                      </a>
                      <Link to={`/invoices/${inv.id}/edit`} title="Edit"
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                        <Edit size={15} />
                      </Link>
                      <button onClick={() => handleDelete(inv)} title="Delete"
                        className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
    </div>
  );
}
