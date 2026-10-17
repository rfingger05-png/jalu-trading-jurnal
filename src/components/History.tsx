import React, { useState, useMemo } from 'react';
import { Trade, User } from '../types';
import { cn } from '../lib/utils';
import { format, isSameDay, isSameWeek, isSameMonth } from 'date-fns';
import { 
  Upload, 
  Trash2, 
  Camera, 
  Image as ImageIcon, 
  Clock, 
  Images, 
  Filter, 
  Calendar as CalendarIcon,
  X,
  Search,
  ExternalLink
} from 'lucide-react';
import { formatCurrency, formatImageUrl, authFetch, detectTradingSession, safeParseDate } from '../utils';
import EditTradeModal from './EditTradeModal';
import ImportTradesModal from './ImportTradesModal';

export default function History({ 
  trades, 
  onTradeUpdated, 
  user, 
  onOpenGallery 
}: { 
  trades: Trade[];
  onTradeUpdated: () => void;
  user?: User | null;
  onOpenGallery?: () => void;
}) {
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [confirmDeleteDate, setConfirmDeleteDate] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [plDisplayMode, setPlDisplayMode] = useState<'nominal' | 'pips' | 'percent'>('nominal');
  
  // Execution time filter & Market Session filter
  const [periodFilter, setPeriodFilter] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [sessionFilter, setSessionFilter] = useState<'all' | 'Asian' | 'London' | 'Overlap' | 'New York'>('all');
  const [pairFilter, setPairFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'win' | 'loss'>('all');

  const parseDateStr = (dateStr: string) => {
    return safeParseDate(dateStr);
  };

  const calculatePips = (trade: Trade) => {
    if (trade.pips !== undefined && trade.pips !== null && !isNaN(Number(trade.pips)) && Number(trade.pips) !== 0) {
      return Number(trade.pips);
    }
    if (trade.realized_pl === null || trade.realized_pl === undefined) return 0;
    const isNano = user?.currency === 'NANO';
    const pipValue = isNano ? 1 : 10;
    const lots = trade.position_size || 0.01;
    const pips = trade.realized_pl / (lots * pipValue);
    return isNaN(pips) ? 0 : pips;
  };

  const calculatePercent = (trade: Trade) => {
    if (trade.realized_pl === null || trade.realized_pl === undefined || !trade.account_balance) return 0;
    return (trade.realized_pl / trade.account_balance) * 100;
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

  // Filtered trades by execution time, session, pair, outcome
  const filteredTrades = useMemo(() => {
    const today = new Date();
    return trades.filter(t => {
      // Period / Execution time filter
      const d = parseDateStr(t.created_at);
      if (periodFilter === 'today' && !isSameDay(d, today)) return false;
      if (periodFilter === 'week' && !isSameWeek(d, today)) return false;
      if (periodFilter === 'month' && !isSameMonth(d, today)) return false;
      if (periodFilter === 'custom' && customDate) {
        const dStr = format(d, 'yyyy-MM-dd');
        if (dStr !== customDate) return false;
      }

      // Market Session Filter (Asian, London, Overlap, New York)
      if (sessionFilter !== 'all') {
        const sess = t.session || detectTradingSession(t.trade_time || t.created_at).name;
        if (sess.toLowerCase() !== sessionFilter.toLowerCase()) return false;
      }

      // Pair filter
      if (pairFilter !== 'all') {
        if ((t.pair || '').toUpperCase() !== pairFilter.toUpperCase()) return false;
      }

      // Outcome filter
      if (outcomeFilter !== 'all') {
        const res = (t.result || '').toLowerCase();
        if (outcomeFilter === 'win' && res !== 'win') return false;
        if (outcomeFilter === 'loss' && res !== 'loss') return false;
      }

      return true;
    });
  }, [trades, periodFilter, customDate, sessionFilter, pairFilter, outcomeFilter]);

  // Group by execution date
  const tradesByDate = useMemo(() => {
    const groups: Record<string, Trade[]> = {};
    filteredTrades.forEach(t => {
      const dateStr = format(parseDateStr(t.created_at), 'yyyy-MM-dd');
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(t);
    });
    return groups;
  }, [filteredTrades]);

  // Unique pairs list
  const uniquePairs = useMemo(() => {
    const pairs = new Set<string>();
    trades.forEach(t => { if (t.pair) pairs.add(t.pair.toUpperCase()); });
    return Array.from(pairs).sort();
  }, [trades]);

  const handleExportCSV = () => {
    let csv = 'Time,Pair,Direction,Lot,Setup,Result,Realized P/L,Pips,Notes\n';
    filteredTrades.forEach(t => {
      const time = format(parseDateStr(t.created_at), 'yyyy-MM-dd HH:mm');
      const safeNotes = t.notes ? `"${t.notes.replace(/"/g, '""')}"` : '';
      const pipsVal = calculatePips(t).toFixed(1);
      csv += `${time},${t.pair || 'XAUUSD'},${t.direction},${t.position_size || 0.01},${t.setup_name || ''},${t.result || ''},${(t.realized_pl || 0).toFixed(2)},${pipsVal},${safeNotes}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `JK_Trade_History_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#0D0D0D] text-white font-sans selection:bg-[#262626]">
      
      {/* Top Filter & Action Bar */}
      <div className="p-4 sm:p-5 border-b border-[#262626] bg-[#141414] flex flex-col gap-4 shrink-0 shadow-xs">
        
        {/* Top Header Strip */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-black uppercase tracking-wider text-white">
                MODUL B: TRADE HISTORY
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1A1A1A] text-[#FF3333] border border-[#FF3333]/30 font-bold">
                XAUUSD FOCUS
              </span>
            </div>
            <p className="text-xs text-[#A3A3A3] mt-0.5 font-mono">
              Riwayat closed trades terverifikasi dengan filter waktu &amp; sesi pasar
            </p>
          </div>
          
          {/* Action Buttons: Export CSV & Import */}
          <div className="flex items-center gap-2 font-mono text-xs w-full sm:w-auto justify-end">
            <button 
              onClick={handleExportCSV}
              className="px-3.5 py-1.5 rounded-md font-bold border border-[#FF3333] bg-[#FF3333] text-white hover:bg-[#E62E2E] transition-colors uppercase flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Download riwayat transaksi format CSV"
            >
              <Upload size={13} className="rotate-180" />
              <span>Export CSV</span>
            </button>

            <button 
              onClick={() => setShowImport(true)}
              className="px-3 py-1.5 rounded-md font-semibold border border-[#262626] bg-[#181818] hover:border-[#3D3D3D] text-[#A3A3A3] hover:text-white transition-colors uppercase flex items-center gap-1.5 cursor-pointer"
            >
              <Upload size={13} />
              <span>Import CSV</span>
            </button>

            {onOpenGallery && (
              <button 
                onClick={onOpenGallery}
                className="px-3 py-1.5 rounded-md font-semibold border border-[#262626] bg-[#181818] hover:border-[#3D3D3D] text-[#A3A3A3] hover:text-white transition-colors uppercase flex items-center gap-1.5 cursor-pointer"
                title="Buka Koleksi Screenshot Chart di Galeri"
              >
                <Images size={13} />
                <span>Gallery</span>
              </button>
            )}
          </div>
        </div>

        {/* Multi-Criteria Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#262626] text-xs font-mono">
          
          {/* Left: Execution Time Range & Custom Date Picker */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-[#0D0D0D] rounded-lg p-0.5 border border-[#262626]">
              {(['today', 'week', 'month', 'all'] as const).map(p => (
                <button 
                  key={p}
                  onClick={() => setPeriodFilter(p)} 
                  className={cn(
                    "px-3 py-1 rounded-md transition-colors cursor-pointer capitalize font-bold",
                    periodFilter === p 
                      ? "bg-[#FF3333] text-white shadow-xs" 
                      : "text-[#A3A3A3] hover:text-white"
                  )}
                >
                  {p === 'today' ? 'Hari Ini' : p === 'week' ? 'Minggu Ini' : p === 'month' ? 'Bulan Ini' : 'Semua'}
                </button>
              ))}
            </div>

            {/* Manual Execution Time Picker */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#262626]">
              <CalendarIcon size={12} className="text-[#A3A3A3]" />
              <input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  if (e.target.value) setPeriodFilter('custom');
                }}
                className="bg-transparent text-white text-xs font-mono outline-none cursor-pointer"
                title="Filter waktu eksekusi manual (Date Picker)"
              />
              {customDate && (
                <button
                  onClick={() => {
                    setCustomDate('');
                    setPeriodFilter('all');
                  }}
                  className="text-[#A3A3A3] hover:text-white ml-1 cursor-pointer"
                  title="Reset tanggal"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Right: Market Session Filter & Outcome / Display Mode */}
          <div className="flex items-center gap-2 flex-wrap">
            
            {/* Market Session Selector (Asian, London, Overlap, New York) */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#262626]">
              <span className="text-[10px] text-[#A3A3A3] uppercase">Sesi:</span>
              <select
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value as any)}
                className="bg-transparent text-white text-xs font-mono font-bold outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#141414]">Semua Sesi</option>
                <option value="Asian" className="bg-[#141414]">Asia (06:00 - 14:00)</option>
                <option value="London" className="bg-[#141414]">London (14:00 - 20:00)</option>
                <option value="Overlap" className="bg-[#141414]">Overlap (19:00 - 23:00)</option>
                <option value="New York" className="bg-[#141414]">New York (20:00 - 04:00)</option>
              </select>
            </div>

            {/* Pair Selector */}
            {uniquePairs.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#262626]">
                <span className="text-[10px] text-[#A3A3A3] uppercase">Pair:</span>
                <select
                  value={pairFilter}
                  onChange={(e) => setPairFilter(e.target.value)}
                  className="bg-transparent text-white text-xs font-mono font-bold outline-none cursor-pointer"
                >
                  <option value="all" className="bg-[#141414]">Semua</option>
                  {uniquePairs.map(p => (
                    <option key={p} value={p} className="bg-[#141414]">{p}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Outcome Filter */}
            <div className="flex items-center bg-[#0D0D0D] rounded-lg p-0.5 border border-[#262626]">
              <button
                onClick={() => setOutcomeFilter('all')}
                className={cn("px-2 py-1 rounded text-[11px] font-bold cursor-pointer", outcomeFilter === 'all' ? "bg-[#262626] text-white" : "text-[#A3A3A3]")}
              >
                All
              </button>
              <button
                onClick={() => setOutcomeFilter('win')}
                className={cn("px-2 py-1 rounded text-[11px] font-bold cursor-pointer", outcomeFilter === 'win' ? "bg-white text-black font-extrabold" : "text-[#A3A3A3]")}
              >
                Win
              </button>
              <button
                onClick={() => setOutcomeFilter('loss')}
                className={cn("px-2 py-1 rounded text-[11px] font-bold cursor-pointer", outcomeFilter === 'loss' ? "bg-[#FF3333] text-white" : "text-[#A3A3A3]")}
              >
                Loss
              </button>
            </div>

            {/* P/L Display Mode Toggle */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#262626]">
              <span className="text-[10px] text-[#A3A3A3] uppercase">Format:</span>
              <select 
                value={plDisplayMode} 
                onChange={e => setPlDisplayMode(e.target.value as any)}
                className="bg-transparent text-white text-xs font-mono font-bold outline-none cursor-pointer"
              >
                <option value="nominal" className="bg-[#141414]">Nominal ($)</option>
                <option value="pips" className="bg-[#141414]">Pips</option>
                <option value="percent" className="bg-[#141414]">Persentase (%)</option>
              </select>
            </div>

          </div>

        </div>

      </div>

      {/* Main Table View */}
      <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        {Object.keys(tradesByDate).length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 border border-[#262626] rounded-2xl bg-[#141414] max-w-lg mx-auto text-center">
            <span className="w-12 h-12 rounded-full bg-[#181818] border border-[#262626] flex items-center justify-center text-[#FF3333] mb-3">
              <Clock size={20} />
            </span>
            <h4 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
              Tidak Ada Transaksi Sesuai Filter
            </h4>
            <p className="text-xs text-[#A3A3A3] mt-1 font-mono">
              Ubah filter tanggal atau sesi pasar untuk melihat log transaksi lain.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
            {(Object.entries(tradesByDate) as [string, Trade[]][]).sort(([a], [b]) => b.localeCompare(a)).map(([dateStr, groupTrades]) => {
              const dayNetPL = groupTrades.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
              const dayWins = groupTrades.filter(t => (t.result || '').toLowerCase() === 'win').length;
              const dayLosses = groupTrades.filter(t => (t.result || '').toLowerCase() === 'loss').length;
              const sign = dayNetPL >= 0 ? '+' : '';

              return (
                <div key={dateStr} className="bg-[#141414] border border-[#262626] rounded-xl flex flex-col overflow-hidden shadow-2xs">
                  
                  {/* Group Header Strip */}
                  <div className="px-4 py-3 border-b border-[#262626] flex justify-between items-center bg-[#181818] flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs sm:text-sm font-bold tracking-tight text-white font-mono">
                        {format(parseDateStr(groupTrades[0].created_at), 'EEEE, dd MMMM yyyy')}
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#101010] text-[#A3A3A3] border border-[#262626]">
                        {groupTrades.length} trades ({dayWins}W · {dayLosses}L)
                      </span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs">
                      <span className="text-[#A3A3A3]">Net P/L Hari Ini:</span>
                      <span className={cn(
                        "font-extrabold tabular-nums px-2 py-0.5 rounded",
                        dayNetPL < 0 ? "bg-[#251010] text-[#FF3333] border border-[#FF3333]/40" : "bg-[#1C1C1C] text-white border border-[#333333]"
                      )}>
                        {sign}{formatCurrency(dayNetPL, user?.currency)}
                      </span>

                      {confirmDeleteDate === dateStr ? (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button 
                            onClick={() => setConfirmDeleteDate(null)} 
                            className="text-[10px] font-bold border border-[#333333] px-2.5 py-1 rounded bg-[#101010] text-[#A3A3A3] cursor-pointer"
                          >
                            Batal
                          </button>
                          <button 
                            onClick={async () => {
                              try {
                                await authFetch(`/api/trades/date/${dateStr}`, { method: 'DELETE' });
                                onTradeUpdated();
                                setConfirmDeleteDate(null);
                              } catch (e) {
                                console.error(e);
                              }
                            }} 
                            className="text-[10px] font-bold border border-[#FF3333] px-2.5 py-1 rounded bg-[#FF3333] text-white cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setConfirmDeleteDate(dateStr)}
                          className="text-[10px] text-[#737373] hover:text-[#FF3333] p-1 transition-colors cursor-pointer"
                          title="Hapus semua trade pada tanggal ini"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Trades Table */}
                  <div className="overflow-x-auto min-h-0">
                    <table className="w-full text-left font-mono text-xs tabular-nums">
                      <thead className="bg-[#101010] text-[10px] uppercase font-bold text-[#A3A3A3] tracking-wider border-b border-[#262626]">
                        <tr>
                          <th className="px-4 py-3">Time &amp; Session</th>
                          <th className="px-4 py-3">Pair</th>
                          <th className="px-4 py-3">Action</th>
                          <th className="px-4 py-3">Lot</th>
                          <th className="px-4 py-3">Setup</th>
                          <th className="px-4 py-3 text-right">Pips</th>
                          <th className="px-4 py-3 text-right">Realized P/L</th>
                          <th className="px-4 py-3 text-center">Outcome</th>
                          <th className="px-4 py-3 text-center">Chart</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1F1F1F]">
                        {groupTrades.map(trade => {
                          const isWin = (trade.result || '').toLowerCase() === 'win';
                          const isLoss = (trade.result || '').toLowerCase() === 'loss';
                          const isBuy = (trade.direction || '').toLowerCase() === 'buy';
                          const sessInfo = detectTradingSession(trade.trade_time || trade.created_at);
                          const sessName = trade.session || sessInfo.name;
                          const pipsVal = calculatePips(trade);
                          const pipsSign = pipsVal >= 0 ? '+' : '';

                          return (
                            <tr key={trade.id} className="hover:bg-[#181818] transition-colors">
                              
                              {/* Time & Session */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white">
                                    {trade.trade_time || format(parseDateStr(trade.created_at), 'HH:mm')}
                                  </span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#101010] text-[#A3A3A3] border border-[#262626]">
                                    {sessName}
                                  </span>
                                </div>
                              </td>

                              {/* Instrument Column focused on XAUUSD */}
                              <td className="px-4 py-3 font-extrabold text-white">
                                <span className="px-1.5 py-0.5 rounded bg-[#1A1A1A] border border-[#2E2E2E]">
                                  {trade.pair || 'XAUUSD'}
                                </span>
                              </td>

                              {/* Action: BUY / SELL High Contrast Badge */}
                              <td className="px-4 py-3">
                                <span className={cn(
                                  "text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider inline-block",
                                  isBuy
                                    ? "bg-[#252525] text-white border border-[#404040]"
                                    : "bg-[#251010] text-[#FF3333] border border-[#FF3333]/40"
                                )}>
                                  {trade.direction}
                                </span>
                              </td>

                              {/* Lot Size */}
                              <td className="px-4 py-3 text-white font-medium">
                                {trade.position_size ? trade.position_size.toFixed(2) : '0.01'}
                              </td>

                              {/* Setup */}
                              <td className="px-4 py-3 text-[#A3A3A3] max-w-[150px] truncate" title={trade.setup_name}>
                                {trade.setup_name || 'Price Action'}
                              </td>

                              {/* Pips */}
                              <td className="px-4 py-3 text-right text-[#A3A3A3]">
                                {pipsVal !== 0 ? `${pipsSign}${pipsVal.toFixed(1)}p` : '-'}
                              </td>

                              {/* Realized P/L: Pure White for Profit, Crimson Red for Loss (Strictly No Green) */}
                              <td className={cn(
                                "px-4 py-3 text-right font-extrabold tabular-nums",
                                isLoss ? "text-[#FF3333]" : "text-white"
                              )}>
                                {trade.realized_pl !== null && trade.realized_pl !== undefined ? (
                                  <>
                                    {plDisplayMode === 'nominal' && (
                                      <>{trade.realized_pl > 0 ? '+' : ''}{formatCurrency(trade.realized_pl, user?.currency)}</>
                                    )}
                                    {plDisplayMode === 'pips' && (
                                      <>{trade.realized_pl > 0 ? '+' : ''}{pipsVal.toFixed(1)} Pips</>
                                    )}
                                    {plDisplayMode === 'percent' && (
                                      <>{trade.realized_pl > 0 ? '+' : ''}{calculatePercent(trade).toFixed(2)}%</>
                                    )}
                                  </>
                                ) : (
                                  '-'
                                )}
                              </td>

                              {/* Outcome: High Contrast Badge (White for Win, Red for Loss) */}
                              <td className="px-4 py-3 text-center">
                                <span className={cn(
                                  "text-[10px] font-black uppercase px-2.5 py-0.5 rounded tracking-wider inline-block",
                                  isWin 
                                    ? "bg-white text-black border border-white font-black" 
                                    : isLoss 
                                    ? "bg-[#FF3333] text-white border border-[#FF3333]" 
                                    : "bg-[#252525] text-[#A3A3A3] border border-[#3D3D3D]"
                                )}>
                                  {trade.result || 'Pending'}
                                </span>
                              </td>

                              {/* Chart Screenshot */}
                              <td className="px-4 py-3 text-center">
                                {(trade.image || trade.image_url) ? (
                                  <button 
                                    onClick={() => setPreviewImage(formatImageUrl(trade.image || trade.image_url))}
                                    className="p-1 rounded text-[#A3A3A3] hover:text-[#FF3333] transition-colors cursor-pointer inline-flex items-center gap-1"
                                    title="Lihat Screenshot Chart"
                                  >
                                    <ImageIcon size={14} />
                                  </button>
                                ) : (
                                  <label className="cursor-pointer text-[#404040] hover:text-white transition-colors" title="Upload Foto Chart">
                                    <Camera size={14} />
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      className="hidden" 
                                      onChange={(e) => handleImageUpload(trade, e)} 
                                    />
                                  </label>
                                )}
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Screenshot Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-[#141414] p-3 rounded-2xl border border-[#262626] shadow-2xl">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-[#FF3333] text-white flex items-center justify-center cursor-pointer shadow-lg hover:bg-[#E62E2E]"
            >
              <X size={16} />
            </button>
            <img 
              src={previewImage} 
              alt="Trade Chart Screenshot" 
              className="max-h-[85vh] w-auto rounded-xl object-contain"
            />
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportTradesModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            onTradeUpdated();
          }}
          user={user}
        />
      )}

    </div>
  );
}
