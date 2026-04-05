import React, { useRef, useState } from 'react';
import { Move, RotateCcw } from 'lucide-react';

// A4 PDF coordinate space used by the Classic template
const PDF_W = 595;
const HEADER_H = 130;

export const DEFAULT_LAYOUT = {
  company_x: 50,
  company_y: 22,
  title_x: 350,
  title_y: 28,
};

/**
 * Visual drag-and-drop editor for the Classic invoice header band.
 * `layout`  – { company_x, company_y, title_x, title_y } in PDF points
 * `onChange` – called with updated layout on every drag move
 */
export default function InvoiceLayoutEditor({ company, layout, onChange }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null); // { which, startClientX, startClientY, startPdfX, startPdfY }
  const [dragging, setDragging] = useState(null);

  const pos = { ...DEFAULT_LAYOUT, ...layout };
  const brandColor = company.primary_color || '#1a56db';

  // Convert PDF points → % inside container (for CSS `left`/`top`)
  const pct = (pdfX, pdfY) => ({
    left: `${(pdfX / PDF_W) * 100}%`,
    top:  `${(pdfY / HEADER_H) * 100}%`,
  });

  const handleMouseDown = (e, which) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      which,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPdfX: pos[`${which}_x`],
      startPdfY: pos[`${which}_y`],
      rectW: rect.width,
      rectH: rect.height,
    };
    setDragging(which);

    const onMove = (me) => {
      const d = dragRef.current;
      if (!d) return;
      const dxPdf = ((me.clientX - d.startClientX) / d.rectW) * PDF_W;
      const dyPdf = ((me.clientY - d.startClientY) / d.rectH) * HEADER_H;
      const newX = Math.round(Math.max(0, Math.min(PDF_W - 80, d.startPdfX + dxPdf)));
      const newY = Math.round(Math.max(0, Math.min(HEADER_H - 20, d.startPdfY + dyPdf)));
      onChange({ ...pos, [`${d.which}_x`]: newX, [`${d.which}_y`]: newY });
    };

    const onUp = () => {
      dragRef.current = null;
      setDragging(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Touch support
  const handleTouchStart = (e, which) => {
    const touch = e.touches[0];
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      which,
      startClientX: touch.clientX,
      startClientY: touch.clientY,
      startPdfX: pos[`${which}_x`],
      startPdfY: pos[`${which}_y`],
      rectW: rect.width,
      rectH: rect.height,
    };
    setDragging(which);

    const onMove = (te) => {
      const t = te.touches[0];
      const d = dragRef.current;
      if (!d) return;
      const dxPdf = ((t.clientX - d.startClientX) / d.rectW) * PDF_W;
      const dyPdf = ((t.clientY - d.startClientY) / d.rectH) * HEADER_H;
      const newX = Math.round(Math.max(0, Math.min(PDF_W - 80, d.startPdfX + dxPdf)));
      const newY = Math.round(Math.max(0, Math.min(HEADER_H - 20, d.startPdfY + dyPdf)));
      onChange({ ...pos, [`${d.which}_x`]: newX, [`${d.which}_y`]: newY });
    };

    const onEnd = () => {
      dragRef.current = null;
      setDragging(null);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const Block = ({ which, label }) => (
    <div
      className={`absolute select-none ${dragging === which ? 'cursor-grabbing z-10' : 'cursor-grab z-0'}`}
      style={pct(pos[`${which}_x`], pos[`${which}_y`])}
      onMouseDown={(e) => handleMouseDown(e, which)}
      onTouchStart={(e) => handleTouchStart(e, which)}
    >
      <div
        className={`flex items-center gap-1 rounded px-2 py-1 border transition-all ${
          dragging === which
            ? 'bg-black/30 border-white/80 shadow-lg'
            : 'bg-black/15 border-white/40 hover:bg-black/25 hover:border-white/60'
        }`}
      >
        <Move size={11} className="text-white/70 shrink-0" />
        <span className="text-white font-bold text-xs leading-tight whitespace-nowrap">{label}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">Drag the blocks to reposition them on the invoice header.</p>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_LAYOUT })}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RotateCcw size={11} /> Reset
        </button>
      </div>

      {/* Header canvas — aspect ratio matches PDF_W × HEADER_H */}
      <div
        ref={containerRef}
        className="relative w-full rounded-lg overflow-hidden"
        style={{
          background: brandColor,
          paddingTop: `${(HEADER_H / PDF_W) * 100}%`, // maintain aspect ratio
          cursor: dragging ? 'grabbing' : 'default',
          userSelect: 'none',
        }}
      >
        {/* Inner absolutely-positioned layer fills the padded space */}
        <div className="absolute inset-0">
          <Block which="company" label={company.name || 'Company Name'} />
          <Block which="title" label="INVOICE" />
          <span className="absolute bottom-1 right-2 text-white/30 text-xs pointer-events-none">
            Classic template header
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-1.5">
        Coordinates — Company: ({pos.company_x}, {pos.company_y}) · Invoice title: ({pos.title_x}, {pos.title_y})
      </p>
    </div>
  );
}
