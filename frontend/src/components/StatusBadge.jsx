import React from 'react';

const configs = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-600' },
  pending:   { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-700' },
  paid:      { label: 'Paid',      cls: 'bg-emerald-100 text-emerald-700' },
  overdue:   { label: 'Overdue',   cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
};

export default function StatusBadge({ status }) {
  const cfg = configs[status] || configs.draft;
  return (
    <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
  );
}
