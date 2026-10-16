import React, { useState } from 'react';
import { Trade } from '../types';
import { cn } from '../lib/utils';
import { format, isSameDay, isSameWeek, isSameMonth } from 'date-fns';
import { Sparkles, CheckCircle2, Edit2, Upload, Trash2, Camera, Image as ImageIcon, Clock, Images } from 'lucide-react';
import { formatCurrency, formatImageUrl, authFetch, detectTradingSession } from '../utils';
import EditTradeModal from './EditTradeModal';
import ImportTradesModal from './ImportTradesModal';

import { User } from '../types';
export default function History({ trades, onTradeUpdated, user, onOpenGallery }: { trades: Trade[], onTradeUpdated: () => void, user?: User | null, onOpenGallery?: () => void }) {
  const [copyingDate, setCopyingDate] = useState<string | null>(null);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmDeleteDate, setConfirmDeleteDate] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [showImport, setShowImport] = useState(false);
  const [plDisplayMode, setPlDisplayMode] = useState<'nominal' | 'pips' | 'percent'>('nominal');
  
  const parseDateStr = (dateStr: string) => {
    if (!dateStr) return new Date();
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    
    // Fallback for MT4/MT5 format: "YYYY.MM.DD HH:mm:ss"
    const cleanStr = dateStr.replace(/\./g, '-').replace(' ', 'T') + 'Z';
    d = new Date(cleanStr);
    if (!isNaN(d.getTime())) return d;
    
    return new Date();
  };

    const calculatePips = (trade: Trade) => {
    if (trade.pips !== undefined && trade.pips !== null && !isNaN(Number(trade.pips)) && Number(trade.pips) !== 0) {
      return Number(trade.pips);
    }
    if (trade.realized_pl === null || trade.realized_pl === undefined) return 0;
    // Pips = P/L / (Lot Size * Pip Value)
    // We assume 1 lot = 100,000 units. If it's XAUUSD/Gold, 1 lot = 100 oz. 
    // Usually standard pips logic requires knowing exactly contract size, but we can do a rough fallback:
    // If trade pair contains XAU or GOLD, maybe div by 10 (or user can see it as points).
    // Let's implement a generalized PIP calculation:
    // This is purely heuristic since we don't have accurate contract sizes in DB.
    // If standard forex, PIP value for 1 Lot is ~$10. 
    // If Gold, 1 point is $100 per lot.
    const isNano = user?.currency === 'NANO';
    let pipValue = isNano ? 1 : 10; 
    if (trade.pair.toUpperCase().includes('XAU') || trade.pair.toUpperCase().includes('GOLD')) {
      pipValue = isNano ? 1 : 10; // Nano: 1¢ per lot | Standard/Cent: 10 per lot
    } else if (trade.pair.toUpperCase().includes('JPY')) {
      pipValue = isNano ? 0.85 : 8.5;
    } else if (trade.pair.toUpperCase().includes('BTC') || trade.pair.toUpperCase().includes('ETH')) {
      pipValue = isNano ? 0.1 : 1;
    }
    const lots = trade.position_size || 0.01;
    // Calculate Pips simply by: (P/L) / (Lots * PipValue)
    const pips = trade.realized_pl / (lots * pipValue);
    return isNaN(pips) ? 0 : pips;
  };

  const calculatePercent = (trade: Trade) => {
    if (trade.realized_pl === null || trade.realized_pl === undefined || !trade.account_balance) return 0;
    return (trade.realized_pl / trade.account_balance) * 100;
  };

    const handleQuickResult = async (trade: Trade, newResult: 'Win' | 'Loss') => {
    let pl = 0;
    
    const isXAU = trade.pair?.toUpperCase().includes('XAU') || trade.pair?.toUpperCase().includes('GOLD');
    const multiplier = isXAU ? 100 : 100000;
    
    if (newResult === 'Loss') {
      const distance = Math.abs((trade.entry_price || 0) - (trade.sl || 0));
      pl = -(distance * (trade.position_size || 0) * multiplier);
    } else if (newResult === 'Win') {
      const distance = Math.abs((trade.tp || 0) - (trade.entry_price || 0));
      pl = distance * (trade.position_size || 0) * multiplier;
    }
    
    try {
      await authFetch(`/api/trades/${trade.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...trade, result: newResult, realized_pl: pl })
      });
      onTradeUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const handleImageUpload = async (trade: Trade, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Str = event.target?.result as string;
      try {
        await authFetch(`/api/trades/${trade.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...trade, image: base64Str })
        });
        onTradeUpdated();
      } catch (e) {
        console.error(e);
      }
    };
    reader.readAsDataURL(file);
  };

  const uniquePairs = React.useMemo(() => {
    const pairs = new Set<string>();
    trades.forEach(t => { if (t.pair) pairs.add(t.pair); });
    return Array.from(pairs).sort();
  }, [trades]);

  const filteredTrades = React.useMemo(() => {
    const today = new Date();
    return trades.filter(t => {
      if (periodFilter === 'all') return true;
      const d = parseDateStr(t.created_at);
      if (periodFilter === 'today') return isSameDay(d, today);
      if (periodFilter === 'week') return isSameWeek(d, today);
      if (periodFilter === 'month') return isSameMonth(d, today);
      return true;
    });
  }, [trades, periodFilter]);

  const tradesByDate = React.useMemo(() => {
    const groups: Record<string, Trade[]> = {};
    filteredTrades.forEach(t => {
      const dateStr = format(parseDateStr(t.created_at), 'yyyy-MM-dd');
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(t);
    });
    return groups;
  }, [filteredTrades]);

  const handleExportCSV = () => {
    let csv = 'Time,Pair,Direction,Setup,Result,Realized P/L,Notes\n';
    filteredTrades.forEach(t => {
      const time = format(parseDateStr(t.created_at), 'yyyy-MM-dd HH:mm');
      const safeNotes = t.notes ? `"${t.notes.replace(/"/g, '""')}"` : '';
      csv += `${time},${t.pair},${t.direction},${t.setup_name},${t.result},${t.realized_pl || 0},${safeNotes}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "trading_history.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatGroupForGemini = (dateStr: string, groupTrades: Trade[]) => {
    let markdown = `| Time | Pair | Setup | Result | Realized P/L | Notes |\n`;
    markdown += `|---|---|---|---|---|---|---|---|\n`;
    
    groupTrades.forEach(t => {
      const time = format(parseDateStr(t.created_at), 'HH:mm');
      const safeNotes = t.notes ? t.notes.replace(/\n/g, ' ') : '';
      const plStr = t.realized_pl !== null ? (t.realized_pl > 0 ? '+' : '') + formatCurrency(t.realized_pl, user?.currency) : '-';
      markdown += `| ${time} | ${t.pair} | ${t.setup_name} | ${t.result} | ${plStr} | ${safeNotes} |\n`;
    });

    markdown += `\n\nGemini, analisa data trading saya di atas. Berikan feedback mengenai kaitan antara level kegelisahan saya dengan hasil trade (Win/Loss). Mana yang harus saya perbaiki agar lebih disiplin?`;

    navigator.clipboard.writeText(markdown);
    setCopyingDate(dateStr);
    setTimeout(() => setCopyingDate(null), 2000);
  };

  
  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#0D0D0D] text-white font-sans">
      <div className="p-4 border-b border-[#2D2D2D] bg-[#141414] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">Trade History</h3>
          <p className="text-[11px] text-[#A3A3A3] mt-0.5">Chronological trade execution logs and data export</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center bg-[#1A1A1A] rounded-md p-0.5 border border-[#2D2D2D] font-mono text-[11px]">
            <button onClick={() => setPeriodFilter('today')} className={cn("px-2.5 py-1 rounded transition-colors cursor-pointer", periodFilter === 'today' ? "bg-[#2D2D2D] text-white font-bold" : "text-[#A3A3A3] hover:text-white")}>Hari Ini</button>
            <button onClick={() => setPeriodFilter('week')} className={cn("px-2.5 py-1 rounded transition-colors cursor-pointer", periodFilter === 'week' ? "bg-[#2D2D2D] text-white font-bold" : "text-[#A3A3A3] hover:text-white")}>Minggu Ini</button>
            <button onClick={() => setPeriodFilter('month')} className={cn("px-2.5 py-1 rounded transition-colors cursor-pointer", periodFilter === 'month' ? "bg-[#2D2D2D] text-white font-bold" : "text-[#A3A3A3] hover:text-white")}>Bulan Ini</button>
            <button onClick={() => setPeriodFilter('all')} className={cn("px-2.5 py-1 rounded transition-colors cursor-pointer", periodFilter === 'all' ? "bg-[#2D2D2D] text-white font-bold" : "text-[#A3A3A3] hover:text-white")}>All Time</button>
          </div>

          {/* Prominent Export CSV Button */}
          <button 
            onClick={handleExportCSV}
            className="text-[11px] font-mono flex items-center gap-1.5 font-bold border border-[#00E676]/40 px-3 py-1.5 hover:bg-[#00E676]/20 transition-colors uppercase rounded-md text-[#00E676] bg-[#00E676]/10 cursor-pointer"
            title="Download full trade history as CSV"
          >
            <Upload size={12} className="rotate-180" />
            Export CSV
          </button>

          <button 
            onClick={() => setShowImport(true)}
            className="text-[11px] font-mono flex items-center gap-1.5 font-semibold border border-[#2D2D2D] px-3 py-1.5 hover:bg-[#262626] transition-colors uppercase rounded-md text-[#A3A3A3] hover:text-white bg-[#1A1A1A] cursor-pointer"
          >
            <Upload size={12} />
            Import CSV
          </button>

          {onOpenGallery && (
            <button 
              onClick={onOpenGallery}
              className="text-[11px] font-mono flex items-center gap-1.5 font-semibold border border-[#2D2D2D] px-3 py-1.5 hover:bg-[#262626] text-[#A3A3A3] hover:text-white transition-colors uppercase rounded-md bg-[#1A1A1A] cursor-pointer"
              title="Buka Koleksi Screenshot Chart di Galeri"
            >
              <Images size={12} />
              <span>Galeri</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-8">
        {Object.keys(tradesByDate).length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 border border-[#2D2D2D] rounded-xl bg-[#1A1A1A] mt-8">
            <span className="text-[#A3A3A3] text-xs font-mono">Belum ada transaksi tercatat. Mulai jurnal atau gunakan Telegram Bot.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
            {(Object.entries(tradesByDate) as [string, Trade[]][]).sort(([a], [b]) => b.localeCompare(a)).map(([dateStr, groupTrades]) => (
              <div key={dateStr} className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl flex flex-col overflow-hidden shadow-xs">
                <div className="p-4 border-b border-[#2D2D2D] flex justify-between items-center bg-[#141414]">
                  <h3 className="text-sm font-bold tracking-tight text-white font-mono">
                    {format(parseDateStr(groupTrades[0].created_at), 'EEEE, dd MMMM yyyy')}
                    <span className="ml-2 text-xs font-normal text-[#A3A3A3]">({groupTrades.length} trades)</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    {confirmDeleteDate === dateStr ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setConfirmDeleteDate(null)} className="text-[10px] font-bold border border-[#333333] px-3 py-1.5 hover:bg-[#262626] transition-all uppercase rounded-md bg-[#121212] text-[#A3A3A3]">Cancel</button>
                        <button onClick={async () => {
                          try {
                            await authFetch(`/api/trades/date/${dateStr}`, { method: 'DELETE' });
                            onTradeUpdated();
                            setConfirmDeleteDate(null);
                          } catch (e) {
                            console.error(e);
                          }
                        }} className="text-[10px] font-bold border border-[#FF3333] px-3 py-1.5 hover:bg-red-700 transition-all uppercase rounded-md bg-[#FF3333] text-white">Confirm</button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setConfirmDeleteDate(dateStr)}
                        className="text-[10px] font-bold border border-[#FF3333]/30 px-2.5 py-1.5 hover:bg-[#FF3333]/15 text-[#FF3333] transition-all uppercase flex items-center gap-1.5 rounded-md bg-[#121212] cursor-pointer"
                        title="Delete all trades for this date"
                      >
                        <Trash2 size={12} /> Delete Day
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto min-h-0">
                  <table className="w-full min-w-[800px] text-left">
                    <thead className="bg-[#121212] text-[10px] uppercase font-bold text-[#A3A3A3] tracking-wider border-b border-[#2D2D2D]">
                      <tr>
                        <th className="px-4 py-3 w-32">Time</th>
                        <th className="px-4 py-3">Pair / Dir</th>
                        <th className="px-4 py-3">Setup</th>
                        <th className="px-4 py-2 font-bold uppercase tracking-widest text-slate-800 dark:text-neutral-300 text-right flex items-center justify-end gap-2">
                            <select 
                              value={plDisplayMode} 
                              onChange={e => setPlDisplayMode(e.target.value as any)}
                              className="bg-transparent border border-slate-200 dark:border-neutral-800 text-[9px] px-1 py-0.5 focus:outline-none"
                            >
                              <option value="nominal">Result ($)</option>
                              <option value="pips">Result (Pips/Pts)</option>
                              <option value="percent">Result (%)</option>
                            </select>
                          </th>
                        <th className="px-4 py-3 text-center">Gallery</th>
                        <th className="px-4 py-3 text-center">Result</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs bg-white dark:bg-neutral-900">
                      {groupTrades.map((trade, idx) => (
                        <tr key={trade.id} className={cn("border-b border-slate-50 group hover:bg-slate-50 dark:bg-neutral-950/50", 
  trade.result && trade.result.toLowerCase() === 'win' ? "bg-emerald-50/50 dark:bg-emerald-950/20" : 
  trade.result && trade.result.toLowerCase() === 'loss' ? "bg-red-50/50 dark:bg-red-950/20" : 
  idx % 2 !== 0 ? "bg-slate-50 dark:bg-neutral-950/30" : "")}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-800 dark:text-neutral-200">
                                <Clock size={11} className="text-cyan-500" />
                                <span>{trade.trade_time || format(parseDateStr(trade.created_at), 'HH:mm')}</span>
                                <span className="text-[9px] font-sans font-normal text-slate-400">WIB</span>
                              </div>
                              {/* Market Session Badge */}
                              {(() => {
                                const sessInfo = detectTradingSession(trade.trade_time || trade.created_at);
                                const displaySess = trade.session || sessInfo.name;
                                let badgeColor = 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-neutral-800 dark:text-neutral-400';
                                let icon = '🏛️';
                                if (displaySess === 'Overlap') {
                                  badgeColor = 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
                                  icon = '⚡';
                                } else if (displaySess === 'London') {
                                  badgeColor = 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
                                  icon = '🏛️';
                                } else if (displaySess === 'New York') {
                                  badgeColor = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
                                  icon = '🗽';
                                } else if (displaySess === 'Asian') {
                                  badgeColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
                                  icon = '🌏';
                                }
                                return (
                                  <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded-xs border inline-flex items-center gap-1 w-fit", badgeColor)}>
                                    <span>{icon}</span>
                                    <span>{displaySess}</span>
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold">{trade.pair || 'N/A'}</span>
                            <span className={cn("ml-2 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5", trade.direction === 'Buy' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")}>
                              {trade.direction}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{trade.setup_name || 'N/A'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-col items-end">
                              {trade.result !== 'Pending' && trade.realized_pl !== null ? (
                                <span className={cn("font-bold text-[11px]", trade.realized_pl > 0 ? "text-emerald-600" : "text-red-600")}>
                                  {plDisplayMode === 'nominal' && <>{trade.realized_pl > 0 ? '+' : ''}{formatCurrency(trade.realized_pl, user?.currency)}</>}
                                  {plDisplayMode === 'percent' && <>{trade.realized_pl > 0 ? '+' : ''}{calculatePercent(trade).toFixed(2)}%</>}
                                  {plDisplayMode === 'pips' && <>{trade.realized_pl > 0 ? '+' : ''}{calculatePips(trade).toFixed(1)} Pips</>}
                                </span>
                              ) : null}
                              <span className="text-[9px] text-slate-400 border-b border-dashed border-slate-300 dark:border-neutral-700 pb-0.5 cursor-crosshair" title={"Notes: " + (trade.notes || "No notes")}>
                                Risk: {formatCurrency(trade.nominal_risk, user?.currency)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center items-center">
                              {(trade.image || trade.image_url) ? (
                                <button 
                                  onClick={() => setPreviewImage(formatImageUrl(trade.image || trade.image_url))}
                                  className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                                  title="View Image"
                                >
                                  <ImageIcon size={16} />
                                </button>
                              ) : (
                                <label className="cursor-pointer text-slate-300 hover:text-blue-500 transition-colors" title="Upload Image">
                                  <Camera size={16} />
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => handleImageUpload(trade, e)} 
                                  />
                                </label>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center gap-1">
                              <button 
                                onClick={() => handleQuickResult(trade, 'Win')} 
                                className={cn("px-2 py-0.5 text-[9px] font-bold uppercase transition-colors rounded-sm", trade.result && trade.result.toLowerCase() === 'win' ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200")}
                              >Win</button>
                              <button 
                                onClick={() => handleQuickResult(trade, 'Loss')} 
                                className={cn("px-2 py-0.5 text-[9px] font-bold uppercase transition-colors rounded-sm", trade.result && trade.result.toLowerCase() === 'loss' ? "bg-red-500 text-white" : "bg-red-100 text-red-700 hover:bg-red-200")}
                              >Loss</button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center gap-2">
                              <button 
                                onClick={() => setEditingTrade(trade)}
                                className="text-[9px] font-bold bg-slate-100 dark:bg-neutral-950 text-slate-600 dark:text-neutral-400 hover:bg-slate-200 hover:text-black dark:hover:text-neutral-100 px-2 py-0.5 uppercase transition-colors flex items-center gap-1"
                              >
                                Edit
                              </button>
                              {confirmDelete === trade.id ? (
                                <div className="flex gap-1">
                                  <button onClick={() => setConfirmDelete(null)} className="text-[9px] font-bold bg-slate-100 dark:bg-neutral-950 text-slate-500 dark:text-neutral-500 hover:bg-slate-200 px-2 py-0.5 uppercase">Cancel</button>
                                  <button onClick={async () => {
                                    try {
                                      await authFetch(`/api/trades/${trade.id}`, { method: 'DELETE' });
                                      setConfirmDelete(null);
                                      onTradeUpdated();
                                    } catch (e) {
                                      console.error(e);
                                    }
                                  }} className="text-[9px] font-bold bg-red-500 text-white dark:text-neutral-900 hover:bg-red-600 px-2 py-0.5 uppercase">Sure?</button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => setConfirmDelete(trade.id)}
                                  className="text-[9px] font-bold bg-slate-100 dark:bg-neutral-950 text-slate-500 dark:text-neutral-500 hover:bg-red-100 hover:text-red-700 px-2 py-0.5 uppercase transition-colors"
                                >
                                  Del
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {editingTrade && (
        <EditTradeModal 
          trade={editingTrade} 
          onClose={() => setEditingTrade(null)} 
          onUpdated={onTradeUpdated} 
        />
      )}

      {showImport && (
        <ImportTradesModal
          user={user}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            onTradeUpdated();
          }}
        />
      )}

      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-300">Trade Screenshot</span>
              <button onClick={() => setPreviewImage(null)} className="text-slate-400 hover:text-white text-xs px-2 py-1">✕ Close</button>
            </div>
            <div className="p-2 flex items-center justify-center">
              <img src={previewImage} alt="Trade Chart" className="max-h-[80vh] w-auto object-contain" />
            </div>
          </div>
        </div>
      )}

      
    </div>
  );
}
