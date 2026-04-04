import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { io } from 'socket.io-client';
import {
  LayoutDashboard, FileText, PlusCircle, Settings,
  MessageCircle, Wifi, WifiOff, Menu, X
} from 'lucide-react';

import Dashboard from './pages/Dashboard';
import InvoiceList from './pages/InvoiceList';
import InvoiceForm from './pages/InvoiceForm';
import InvoiceDetail from './pages/InvoiceDetail';
import SettingsPage from './pages/SettingsPage';
import WhatsAppPage from './pages/WhatsAppPage';

const socket = io(import.meta.env.VITE_API_URL || '', { path: '/socket.io' });

export default function App() {
  const [waStatus, setWaStatus] = useState({ status: 'disconnected' });
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    socket.on('wa:status', setWaStatus);
    socket.on('wa:qr', (data) => setWaStatus(data));
    return () => { socket.off('wa:status'); socket.off('wa:qr'); };
  }, []);

  const statusDot = () => {
    if (waStatus.status === 'connected') return 'bg-emerald-400';
    if (waStatus.status === 'qr_pending') return 'bg-yellow-400 animate-pulse';
    if (waStatus.status === 'initializing') return 'bg-blue-400 animate-pulse';
    return 'bg-gray-400';
  };

  const nav = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/invoices', icon: FileText, label: 'Invoices' },
    { to: '/invoices/new', icon: PlusCircle, label: 'New Invoice' },
    { to: '/whatsapp', icon: MessageCircle, label: 'WhatsApp' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const NavItem = ({ item }) => (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={() => setMobileOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <item.icon size={18} />
      {item.label}
    </NavLink>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />

      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📄</span>
            <div>
              <h1 className="font-bold text-gray-900 leading-tight">InvoiceApp</h1>
              <p className="text-xs text-gray-400">WhatsApp Powered</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {nav.map(item => <NavItem key={item.to} item={item} />)}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => navigate('/whatsapp')}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-100 transition-all"
          >
            <span className={`w-2 h-2 rounded-full ${statusDot()}`} />
            <span className="text-xs text-gray-600 capitalize">
              WhatsApp: {waStatus.status === 'connected' ? 'Connected' : waStatus.status}
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📄</span>
          <span className="font-bold text-gray-900">InvoiceApp</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-20 bg-black/40" onClick={() => setMobileOpen(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white p-4 pt-16" onClick={e => e.stopPropagation()}>
            <nav className="space-y-1">
              {nav.map(item => <NavItem key={item.to} item={item} />)}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto md:pt-0 pt-14">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/invoices" element={<InvoiceList />} />
          <Route path="/invoices/new" element={<InvoiceForm />} />
          <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
          <Route path="/invoices/:id" element={<InvoiceDetail socket={socket} />} />
          <Route path="/whatsapp" element={<WhatsAppPage socket={socket} />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
