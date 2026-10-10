import React, { useState } from 'react';
import Papa from 'papaparse';
import { X, Upload, Check, AlertCircle, FileText, ClipboardPaste, Camera, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatCurrency } from '../utils';

type ImportTrade = {
  pair: string;
  direction: 'Buy' | 'Sell';
  entry_price: number;
  sl: number;
  tp: number;
  position_size: number;
  realized_pl: number | null;
  result: 'Win' | 'Loss' | 'Breakeven' | 'Pending';
  setup_name: string;
  created_at?: string;
  nominal_risk?: number;
  risk_percentage?: number;
  account_balance?: number;
  image?: string | null;
  notes?: string;
};

import { User } from '../types';

export default function ImportTradesModal({ onClose, onImported, user }: { onClose: () => void, onImported: () => void, user?: User | null }) {
  const [activeTab, setActiveTab] = useState<'paste' | 'csv'>('paste');
  const [file, setFile] = useState<File | null>(null);
      const [pasteText, setPasteText] = useState('');
  const [parsedTrades, setParsedTrades] = useState<ImportTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importImage, setImportImage] = useState<string | null>(null);

  const processData = (data: any[]) => {
    try {
      const trades: ImportTrade[] = [];
      let runningBalance = user?.prop_firm_enabled ? (user.prop_firm_balance || 10000) : (user?.initial_balance || 10000);

      data.forEach((row: any, index: number) => {
        try {
          if (!row || Object.values(row).every(v => !String(v).trim())) return; // skip empty

          const keys = Object.keys(row);
          let pair = 'UNKNOWN';
          let direction: 'Buy' | 'Sell' = 'Buy';
          let size = 0;
          let entry = 0;
          let sl = 0;
          let tp = 0;
          let profitStr = '';
          let openDate = '';
          let openTime = '';
          let image = null;
          let notes = '';

          const cleanKey = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
          
          for (const k of keys) {
            const kl = cleanKey(k);
            const val = String(row[k] || '').trim();
            if (!val) continue;

            if (kl.includes('pair') || kl.includes('symbol') || kl.includes('asset') || kl.includes('item')) {
               pair = val.replace(/m$/, '');
            }
            else if (kl.includes('type') || kl.includes('direction') || kl.includes('side') || kl.includes('action')) {
               direction = val.toLowerCase().includes('sell') ? 'Sell' : 'Buy';
            }
            else if (kl.includes('size') || kl.includes('lot') || kl.includes('volume') || kl.includes('position')) {
               size = parseFloat(val.replace(/[^0-9.-]+/g, '')) || 0;
            }
            else if (kl.includes('entry') || kl.includes('price') || kl.includes('openprice')) {
               if (!kl.includes('stop') && !kl.includes('take')) {
                 entry = parseFloat(val.replace(/[^0-9.-]+/g, '')) || 0;
               }
            }
            else if (kl.includes('sl') || kl.includes('stoploss') || kl.includes('stop_loss') || (kl === 'stop')) {
               sl = parseFloat(val.replace(/[^0-9.-]+/g, '')) || 0;
            }
            else if (kl.includes('tp') || kl.includes('takeprofit') || kl.includes('take_profit') || (kl === 'take')) {
               tp = parseFloat(val.replace(/[^0-9.-]+/g, '')) || 0;
            }
            else if (kl.includes('profit') || kl.includes('realized') || kl.includes('pnl') || kl.includes('pl') || kl.includes('result')) {
               profitStr = val;
            }
            else if (kl === 'date' || kl === 'tanggal') {
               openDate = val;
            }
            else if (kl === 'time' || kl === 'waktu' || kl === 'jam') {
               openTime = val;
            }
            else if (kl.includes('time') || kl.includes('date') || kl.includes('created') || kl.includes('waktu') || kl.includes('tanggal')) {
               // If it looks like just a time
               if (val.match(/^\d{1,2}:\d{2}/)) {
                   if (!openTime) openTime = val;
               } else {
                   if (!openDate) openDate = val;
               }
            }
            else if (kl.includes('image') || kl.includes('gallery')) {
               image = val;
            }
            else if (kl.includes('reason') || kl.includes('note') || kl.includes('desc')) {
               notes = val;
            }
          }

          pair = pair.toUpperCase();
          if (pair === 'UNKNOWN' || !pair) pair = 'XAUUSD';

          let profit: number | null = null;
          let result: ImportTrade['result'] = 'Pending';
          
          if (profitStr !== '') {
            profit = parseFloat(profitStr.replace(/[^0-9.-]+/g, ''));
            if (isNaN(profit)) profit = 0;
            
            if (profit > 0) result = 'Win';
            else if (profit < 0) result = 'Loss';
            else result = 'Pending';
          }

          let dateStr = "";
          let combinedDateTimeStr = openDate;
          
          if (openDate && openTime) {
             combinedDateTimeStr = `${openDate} ${openTime}`;
          } else if (openTime && !openDate) {
             const today = new Date().toISOString().split('T')[0];
             combinedDateTimeStr = `${today} ${openTime}`;
          } else if (openDate && !openTime) {
             combinedDateTimeStr = openDate;
          }
          
          if (combinedDateTimeStr) {
             // Let's normalize it to YYYY-MM-DDTHH:mm:ss
             let cleanStr = combinedDateTimeStr.replace(/\./g, '-').replace(/\//g, '-').replace(' ', 'T');
             // If it lacks time, add default time
             if (!cleanStr.includes('T')) {
                 cleanStr += 'T00:00:00';
             }
             // If it has time but lacks seconds
             if (cleanStr.match(/T\d{1,2}:\d{2}$/)) {
                 cleanStr += ':00';
             }
             
             // Verify it can be parsed
             const testDate = new Date(cleanStr);
             if (!isNaN(testDate.getTime())) {
                 dateStr = cleanStr; // Store without 'Z' so it's treated as face-value local time!
             } else {
                 // Try one more fallback for DD-MM-YYYY format
                 const parts = combinedDateTimeStr.split(/[ T]/);
                 if (parts[0] && parts[0].split('-').length === 3) {
                     const dParts = parts[0].split('-');
                     if (dParts[0].length <= 2) { // likely DD-MM-YYYY
                         const reversed = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
                         let timePart = parts[1] || '00:00:00';
                         if (timePart.split(':').length === 2) timePart += ':00';
                         const testReversed = new Date(`${reversed}T${timePart}`);
                         if (!isNaN(testReversed.getTime())) {
                             dateStr = `${reversed}T${timePart}`;
                         }
                     }
                 }
             }
          }
          
          // If all parsing failed or no date was provided, DO NOT use new Date().
          // Wait, if it's completely empty, maybe we should use today's date with 00:00?
          // The prompt says: "JANGAN gunakan new Date() / waktu server/waktu lokal saat pengguna mengunggah file CSV."
          // But we need a valid timestamp for the DB. If it's empty, we'll use a placeholder.
          if (!dateStr) {
             dateStr = "2000-01-01T00:00:00"; // Fallback placeholder if really no date provided
          }

          let nominalRisk = 0;
          const riskPercentage = 2.5;
          const accountBalance = runningBalance;
          const riskAmount = accountBalance * (riskPercentage / 100);

          if (entry > 0 && sl > 0) {
            const distance = Math.abs(entry - sl);
            if (distance > 0) {
              if (size === 0) {
                size = parseFloat((riskAmount / (distance * 100)).toFixed(2)) || 0.01;
                nominalRisk = riskAmount;
              } else {
                nominalRisk = size * distance * 100;
              }
            }
          }

          trades.push({
            pair,
            created_at: dateStr,
            direction,
            position_size: size,
            entry_price: entry,
            sl,
            tp,
            realized_pl: profit,
            result,
            setup_name: 'BRG',
            nominal_risk: nominalRisk,
            risk_percentage: riskPercentage,
            account_balance: accountBalance,
            image: image || importImage,
            notes: notes || 'No reason provided.'
          });
          
          if (profit !== null) {
             runningBalance += profit;
          }
        } catch(e) {
          console.error(`Failed to parse row ${index}:`, row, e);
        }
      });
      
      if (trades.length === 0) {
        setError(`Data gagal dibaca. Pastikan file/teks memiliki header kolom yang bisa dikenali seperti 'pair', 'price', atau 'profit'.`);
        return;
      }
      
      setParsedTrades(trades);
    } catch (err: any) {
      setError(`Fatal Error: ${err.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setError(null);
    
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
           setError(`CSV Error: ${results.errors[0].message}`);
           return;
        }
        processData(results.data);
      },
      error: (error) => {
        console.error('PapaParse file error:', error);
        setError(`Error membaca file: ${error.message}`);
      }
    });
  };

  const handleTextPaste = () => {
    setError(null);
    if (!pasteText.trim()) return;

    let textToParse = pasteText.trim();
    
    Papa.parse(textToParse, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
           setError(`Paste Error: ${results.errors[0].message}. Pastikan baris pertama adalah nama kolom (header).`);
           return;
        }
        processData(results.data);
      },
      error: (error) => {
        console.error('PapaParse error:', error);
        setError(`Error membaca teks: ${error.message}`);
      }
    });
  };

  const handleImport = async () => {
    if (parsedTrades.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/trades/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: parsedTrades })
      });
      
      if (res.ok) {
        onImported();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to import trades");
      }
    } catch (err) {
      setError("An error occurred during import");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-neutral-900 w-full max-w-2xl border border-slate-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-neutral-800 shrink-0">
          <h2 className="font-bold uppercase tracking-widest text-slate-800 dark:text-neutral-200 text-sm">Import Trades</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-full transition-colors text-slate-500">
            <X size={18} />
          </button>
        </div>
        
        
        <div className="flex border-b border-slate-100 dark:border-neutral-800 shrink-0">
          <button 
            onClick={() => { setActiveTab('paste'); setParsedTrades([]); setError(null); }}
            className={cn(
              "flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors border-b-2 flex items-center justify-center gap-2",
              activeTab === 'paste' ? "border-black dark:border-white text-black dark:text-white" : "border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-neutral-900"
            )}
          >
            <ClipboardPaste size={14} />
            Paste
          </button>
          <button 
            onClick={() => { setActiveTab('csv'); setParsedTrades([]); setError(null); }}
            className={cn(
              "flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors border-b-2 flex items-center justify-center gap-2",
              activeTab === 'csv' ? "border-black dark:border-white text-black dark:text-white" : "border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-neutral-900"
            )}
          >
            <FileText size={14} />
            CSV
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto grow">
          
          {activeTab === 'paste' ? (
            parsedTrades.length === 0 ? (
              <div className="flex flex-col gap-4 h-full">
                <div className="border-2 border-dashed border-slate-300 dark:border-neutral-700 rounded-lg p-6 text-center flex flex-col items-center justify-center gap-3 relative overflow-hidden bg-slate-50 dark:bg-neutral-900/50">
                  {importImage ? (
                    <>
                      <img src={importImage} alt="Preview" className="h-32 object-contain rounded-md shadow-sm mb-2" />
                      <button onClick={() => setImportImage(null)} className="absolute top-2 right-2 bg-white dark:bg-black p-1 rounded-full shadow-sm text-red-500 hover:text-red-700">
                        <X size={16} />
                      </button>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-500">Image Attached</p>
                    </>
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-slate-400" />
                      <div>
                        <p className="font-medium text-slate-700 dark:text-neutral-300 text-sm">Upload Chart / Screenshot</p>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">Image will be attached to imported trades</p>
                      </div>
                      <label className="mt-2 bg-slate-200 hover:bg-slate-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-neutral-200 px-4 py-1.5 rounded-sm cursor-pointer transition-colors text-[10px] font-bold uppercase tracking-wider">
                        Select Image
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => setImportImage(event.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        }} />
                      </label>
                    </>
                  )}
                </div>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="flex-1 min-h-[200px] w-full p-4 border border-slate-200 dark:border-neutral-800 rounded bg-slate-50 dark:bg-neutral-950 focus:outline-none focus:border-black dark:focus:border-white text-xs font-mono whitespace-pre"
                  placeholder="Paste the CSV result from your AI here..."
                ></textarea>
                <button
                  onClick={handleTextPaste}
                  disabled={!pasteText.trim()}
                  className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-bold uppercase tracking-widest text-xs rounded-sm hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Analyze Pasted Data
                </button>
              </div>
            ) : null
          ) : (
parsedTrades.length === 0 ? (
              <div className="border-2 border-dashed border-slate-300 dark:border-neutral-700 rounded-lg p-12 text-center flex flex-col items-center justify-center gap-4">
                <Upload className="w-12 h-12 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-700 dark:text-neutral-300">Upload CSV File</p>
                  <p className="text-sm text-slate-500 mt-1">Export your history from MT4/MT5 or use a spreadsheet.</p>
                </div>
                <label className="mt-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 px-6 py-2 rounded-sm cursor-pointer transition-colors text-sm font-bold uppercase tracking-wider">
                  Select File
                  <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            ) : null
          )}

          {error && (
            <div className="bg-red-50 text-red-600 p-3 flex items-center gap-2 text-sm border border-red-200 rounded mt-4">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {parsedTrades.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600 dark:text-neutral-400">Found {parsedTrades.length} valid trades:</p>
                <button onClick={() => { setParsedTrades([]); setFile(null); setPasteText('');   }} className="text-sm text-slate-500 hover:text-slate-700 underline">Start over</button>
              </div>
              <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-neutral-800 rounded bg-slate-50 dark:bg-neutral-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-neutral-800 sticky top-0">
                    <tr>
                      <th className="p-2 font-medium">Pair</th>
                      <th className="p-2 font-medium">Type</th>
                      <th className="p-2 font-medium text-right">Lot</th>
                      <th className="p-2 font-medium text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-neutral-800">
                    {parsedTrades.slice(0, 50).map((t, i) => (
                      <tr key={i}>
                        <td className="p-2 font-bold">{t.pair}</td>
                        <td className={cn("p-2", t.direction === 'Buy' ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400")}>{t.direction}</td>
                        <td className="p-2 text-right">{t.position_size}</td>
                        <td className={cn("p-2 text-right font-medium", t.realized_pl && t.realized_pl > 0 ? "text-green-600 dark:text-green-400" : t.realized_pl && t.realized_pl < 0 ? "text-red-600 dark:text-red-400" : "text-slate-500")}>
                          {t.realized_pl !== null ? formatCurrency(t.realized_pl, 'USD') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedTrades.length > 50 && (
                  <div className="p-2 text-center text-xs text-slate-500 bg-white dark:bg-neutral-900 border-t border-slate-200 dark:border-neutral-800">
                    ... and {parsedTrades.length - 50} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-100 dark:border-neutral-800 flex justify-end gap-3 shrink-0 bg-slate-50 dark:bg-neutral-950">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={parsedTrades.length === 0 || loading}
            className={cn(
              "px-6 py-2 text-sm font-bold uppercase tracking-wider transition-colors",
              parsedTrades.length === 0 || loading
                ? "bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-neutral-800 dark:text-neutral-600"
                : "bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            )}
          >
            {loading ? "Importing..." : `Import ${parsedTrades.length} Trades`}
          </button>
        </div>
      </div>
    </div>
  );
}
