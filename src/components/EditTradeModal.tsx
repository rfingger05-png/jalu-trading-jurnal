import React, { useState } from 'react';
import { Trade } from '../types';
import { X } from 'lucide-react';
import { Input, Label } from './TradeForm';
import { resizeImage, formatImageUrl } from '../utils';

export default function EditTradeModal({ trade, onClose, onUpdated }: { trade: Trade, onClose: () => void, onUpdated: () => void }) {
  const [result, setResult] = useState(trade.result);
  const [realizedPL, setRealizedPL] = useState<string>(trade.realized_pl !== null ? String(trade.realized_pl) : '');
  const [notes, setNotes] = useState(trade.notes || '');
  const [image, setImage] = useState<string | null>(trade.image || trade.image_url || null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    
    let realized_pl = realizedPL !== '' && !isNaN(Number(realizedPL)) ? Number(realizedPL) : null;
    if (result === 'Pending') {
      realized_pl = null;
    } else if (result === 'Breakeven') {
      realized_pl = 0;
    }

    try {
      await fetch(`/api/trades/${trade.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          realized_pl,
          notes,
          image
        })
      });
      onUpdated();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-neutral-900 max-w-lg w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-neutral-800">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-neutral-300">Edit Trade: {trade.pair}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-black dark:hover:text-neutral-100 transition-colors"><X size={18} /></button>
        </div>
        
        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Profit / Loss</Label>
            <Input 
              type="number" 
              step="any"
              value={realizedPL}
              onChange={e => setRealizedPL(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Result</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['Pending', 'Win', 'Loss', 'Breakeven'] as const).map(res => (
                <button
                  key={res}
                  type="button"
                  onClick={() => setResult(res)}
                  className={`py-2 text-[10px] font-bold uppercase tracking-wider border transition-colors ${result === res ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 dark:bg-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800'}`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>
        </div>

          <div className="flex flex-col gap-2">
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-300 dark:border-neutral-700 p-2 text-sm focus:outline-none focus:border-black dark:border-neutral-500 placeholder:text-slate-400 min-h-[80px] resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Trade Image (Chart/Result)</Label>
            <input 
              type="file" 
              accept="image/*"
              className="text-[10px] text-slate-500 dark:text-neutral-500 file:mr-2 file:py-1 file:px-2 file:border-0 file:text-[9px] file:font-bold file:uppercase file:bg-slate-100 dark:bg-neutral-950 file:text-slate-700 dark:text-neutral-400 hover:file:bg-slate-200"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const compressed = await resizeImage(file);
                  setImage(compressed);
                } else {
                  setImage(null);
                }
              }}
            />
            {image && (
              <div className="mt-2 aspect-video bg-slate-100 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 relative overflow-hidden">
                <img src={formatImageUrl(image)} className="w-full h-full object-cover" alt="After" />
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-500 hover:text-black dark:hover:text-neutral-100">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="px-6 py-2 bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
