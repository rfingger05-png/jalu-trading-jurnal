import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Trade, User } from '../types';
import { 
  Images, 
  Search, 
  Calendar, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Download, 
  Camera, 
  Edit3, 
  Maximize2, 
  Layers,
  PlusCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { formatCurrency, formatImageUrl, resizeImage, authFetch, safeParseDate, detectTradingSession } from '../utils';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import EditTradeModal from './EditTradeModal';

export interface TradeGalleryProps {
  trades: Trade[];
  user?: User | null;
  onTradeUpdated: () => void;
  onOpenLogTrade?: () => void;
}

interface TradeGroup {
  title: string;
  subtitle?: string;
  trades: Trade[];
  netPL: number;
  wins: number;
  losses: number;
}

export default function TradeGallery({ trades, user, onTradeUpdated, onOpenLogTrade }: TradeGalleryProps) {
  // Filtering & Grouping States
  const [filterResult, setFilterResult] = useState<'all' | 'win' | 'loss' | 'be'>('all');
  const [filterPair, setFilterPair] = useState<string>('all');
  const [onlyWithImages, setOnlyWithImages] = useState<boolean>(true);
  const [groupMode, setGroupMode] = useState<'date' | 'session' | 'pair' | 'result'>('date');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Lightbox Modal State
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [uploadingTradeId, setUploadingTradeId] = useState<number | null>(null);

  // Available Pairs for quick filter
  const uniquePairs = useMemo(() => {
    const set = new Set<string>();
    trades.forEach(t => {
      if (t.pair) set.add(t.pair.toUpperCase());
    });
    return Array.from(set).sort();
  }, [trades]);

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      // Image filter
      const hasImg = Boolean(t.image || t.image_url);
      if (onlyWithImages && !hasImg) return false;

      // Result filter
      if (filterResult !== 'all') {
        const res = (t.result || '').toLowerCase();
        if (filterResult === 'win' && res !== 'win') return false;
        if (filterResult === 'loss' && res !== 'loss') return false;
        if (filterResult === 'be' && res !== 'breakeven') return false;
      }

      // Pair filter
      if (filterPair !== 'all') {
        if ((t.pair || '').toUpperCase() !== filterPair.toUpperCase()) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchPair = (t.pair || '').toLowerCase().includes(q);
        const matchSetup = (t.setup_name || '').toLowerCase().includes(q);
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        const matchSession = (t.session || '').toLowerCase().includes(q);
        if (!matchPair && !matchSetup && !matchNotes && !matchSession) return false;
      }

      return true;
    }).sort((a, b) => safeParseDate(b.created_at).getTime() - safeParseDate(a.created_at).getTime());
  }, [trades, onlyWithImages, filterResult, filterPair, searchQuery]);

  // List of trades that can be navigated in lightbox (only those with images)
  const imageTradesList = useMemo(() => {
    return filteredTrades.filter(t => Boolean(t.image || t.image_url));
  }, [filteredTrades]);

  // Grouped trades map
  const groupedTrades = useMemo<Record<string, TradeGroup>>(() => {
    const groups: Record<string, TradeGroup> = {};

    filteredTrades.forEach(t => {
      let key = 'Lainnya';
      let title = 'Lainnya';
      let subtitle = '';

      if (groupMode === 'date') {
        const d = safeParseDate(t.created_at);
        key = format(d, 'yyyy-MM-dd');
        title = format(d, 'EEEE, dd MMMM yyyy');
      } else if (groupMode === 'session') {
        const sess = t.session || detectTradingSession(t.trade_time || t.created_at).name;
        key = sess;
        if (sess === 'Overlap') {
          title = '⚡ Sesi Overlap London - New York';
          subtitle = '19:00 - 23:00 WIB · Volatilitas Tinggi';
        } else if (sess === 'London') {
          title = '🏛️ Sesi London (Eropa)';
          subtitle = '14:00 - 19:00 WIB';
        } else if (sess === 'New York') {
          title = '🗽 Sesi New York (US)';
          subtitle = '23:00 - 06:00 WIB';
        } else if (sess === 'Asian') {
          title = '🌏 Sesi Asia (Tokyo/Sydney)';
          subtitle = '06:00 - 14:00 WIB';
        } else {
          title = `Sesi ${sess}`;
        }
      } else if (groupMode === 'pair') {
        key = (t.pair || 'UNKNOWN').toUpperCase();
        title = key;
        subtitle = key.includes('XAU') ? 'Precious Metals / Gold' : 'Currency Asset';
      } else if (groupMode === 'result') {
        const res = (t.result || 'Pending').toUpperCase();
        key = res;
        title = res === 'WIN' ? '🏆 Transaksi Win (Profit)' : res === 'LOSS' ? '🔴 Transaksi Loss' : '⚖️ Breakeven / Running';
      }

      if (!groups[key]) {
        groups[key] = { title, subtitle, trades: [], netPL: 0, wins: 0, losses: 0 };
      }

      groups[key].trades.push(t);
      groups[key].netPL += (t.realized_pl || 0);
      if ((t.result || '').toLowerCase() === 'win') groups[key].wins += 1;
      if ((t.result || '').toLowerCase() === 'loss') groups[key].losses += 1;
    });

    return groups;
  }, [filteredTrades, groupMode]);

  // Handle direct file upload for a specific trade
  const handleUploadImage = async (trade: Trade, file: File) => {
    try {
      setUploadingTradeId(trade.id);
      const compressed = await resizeImage(file);
      const res = await authFetch(`/api/trades/${trade.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...trade,
          image: compressed
        })
      });
      if (res.ok) {
        onTradeUpdated();
      }
    } catch (e) {
      console.error("Failed to upload image:", e);
    } finally {
      setUploadingTradeId(null);
    }
  };

  // Lightbox keyboard navigation
  const activeLightboxTrade = lightboxIndex !== null && imageTradesList[lightboxIndex] ? imageTradesList[lightboxIndex] : null;

  const handleNextImage = useCallback(() => {
    if (lightboxIndex !== null && lightboxIndex < imageTradesList.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    }
  }, [lightboxIndex, imageTradesList.length]);

  const handlePrevImage = useCallback(() => {
    if (lightboxIndex !== null && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    }
  }, [lightboxIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') handleNextImage();
      if (e.key === 'ArrowLeft') handlePrevImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, handleNextImage, handlePrevImage]);

  // Calculate Pip value for display
  const getPipsDisplay = (trade: Trade) => {
    if (trade.pips !== undefined && trade.pips !== null && !isNaN(Number(trade.pips)) && Number(trade.pips) !== 0) {
      const p = Number(trade.pips);
      return `${p > 0 ? '+' : ''}${p.toFixed(1)} Pips`;
    }
    if (trade.realized_pl !== null && trade.realized_pl !== undefined) {
      const lots = trade.position_size || 0.1;
      const isNano = user?.currency === 'NANO';
      let pipVal = isNano ? 1 : 10;
      if ((trade.pair || '').toUpperCase().includes('XAU')) pipVal = isNano ? 1 : 10;
      const est = trade.realized_pl / (lots * pipVal);
      if (!isNaN(est) && est !== 0) {
        return `${est > 0 ? '+' : ''}${est.toFixed(1)} Pips`;
      }
    }
    return null;
  };

  const totalWithImagesCount = useMemo(() => {
    return trades.filter(t => Boolean(t.image || t.image_url)).length;
  }, [trades]);

  const groupEntries = useMemo(() => {
    return Object.entries(groupedTrades) as [string, TradeGroup][];
  }, [groupedTrades]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-50 dark:bg-[#070b13] text-slate-900 dark:text-slate-100">
      
      {/* Top Header - Compact, No Word Clutter */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090d16] shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center font-bold shrink-0">
            <Images size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white uppercase">
                Galeri Chart
              </h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {totalWithImagesCount} Foto
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
              <span>{filteredTrades.length} Trade Ditampilkan</span>
              <span aria-hidden="true">·</span>
              <span>Klik gambar untuk full view</span>
            </div>
          </div>
        </div>

        {/* Right Search & Action */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari pair, setup, sesi..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-7 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          {onOpenLogTrade && (
            <button
              onClick={onOpenLogTrade}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <PlusCircle size={13} />
              <span className="hidden sm:inline">Log Trade</span>
            </button>
          )}
        </div>
      </div>

      {/* Grouping & Filter Controls - Structured & Segmented */}
      <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#0a0f1b] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        
        {/* Kelompokkan (Group Mode) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Layers size={13} className="text-cyan-500" />
            <span>Kelompok:</span>
          </span>
          <div className="flex items-center bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 p-0.5 shadow-2xs">
            <button
              onClick={() => setGroupMode('date')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer",
                groupMode === 'date' 
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              📅 Tanggal
            </button>
            <button
              onClick={() => setGroupMode('session')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer",
                groupMode === 'session' 
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              ⚡ Sesi Pasar
            </button>
            <button
              onClick={() => setGroupMode('pair')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer",
                groupMode === 'pair' 
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              📈 Pair
            </button>
            <button
              onClick={() => setGroupMode('result')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer",
                groupMode === 'result' 
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              🏆 Hasil
            </button>
          </div>
        </div>

        {/* Filter Quick Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Result Filter */}
          <div className="flex items-center bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 p-0.5">
            <button
              onClick={() => setFilterResult('all')}
              className={cn(
                "px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer",
                filterResult === 'all'
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              Semua
            </button>
            <button
              onClick={() => setFilterResult('win')}
              className={cn(
                "px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer",
                filterResult === 'win'
                  ? "bg-emerald-600 text-white"
                  : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              )}
            >
              🟢 Win
            </button>
            <button
              onClick={() => setFilterResult('loss')}
              className={cn(
                "px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer",
                filterResult === 'loss'
                  ? "bg-rose-600 text-white"
                  : "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              )}
            >
              🔴 Loss
            </button>
          </div>

          {/* Pair Select */}
          {uniquePairs.length > 0 && (
            <select
              value={filterPair}
              onChange={e => setFilterPair(e.target.value)}
              className="text-[10px] font-bold px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Pair</option>
              {uniquePairs.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}

          {/* Toggle Only With Images */}
          <button
            onClick={() => setOnlyWithImages(!onlyWithImages)}
            className={cn(
              "px-2.5 py-1 text-[10px] font-bold rounded border transition-colors flex items-center gap-1 cursor-pointer",
              onlyWithImages
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                : "bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-700"
            )}
          >
            <Camera size={11} />
            <span>{onlyWithImages ? 'Hanya Bergambar' : 'Tampilkan Semua'}</span>
          </button>
        </div>

      </div>

      {/* Main Gallery Area - Clean Grouped Sections */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        
        {filteredTrades.length === 0 ? (
          <div className="max-w-md mx-auto text-center py-16 px-6 bg-white dark:bg-[#0c1220] border border-slate-200 dark:border-slate-800 rounded shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <Images size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Tidak Ada Screenshot Chart
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
              {onlyWithImages 
                ? "Belum ada trade yang memiliki foto chart. Matikan filter 'Hanya Bergambar' untuk mengunggah screenshot chart pada transaksi yang sudah ada."
                : "Tidak ada data trade yang sesuai dengan pencarian Anda."}
            </p>
            {onlyWithImages && (
              <button
                onClick={() => setOnlyWithImages(false)}
                className="px-4 py-2 text-xs font-bold rounded bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
              >
                Lihat Semua Trade & Upload Chart
              </button>
            )}
          </div>
        ) : (
          groupEntries.map(([groupKey, group]) => {
            const signPL = group.netPL >= 0 ? '+' : '';
            return (
              <section 
                key={groupKey} 
                className="bg-white dark:bg-[#090e1a] border border-slate-200 dark:border-slate-800/80 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4"
              >
                {/* Group Header Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                      {group.title}
                    </h2>
                    {group.subtitle && (
                      <span className="text-xs text-slate-400 font-normal">
                        · {group.subtitle}
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
                      {group.trades.length} trade
                    </span>
                  </div>

                  {/* Compact Stats */}
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{group.wins}W</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">{group.losses}L</span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className={cn("font-bold", group.netPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                      {signPL}{formatCurrency(group.netPL, user?.currency)}
                    </span>
                  </div>
                </div>

                {/* Grid of Chart Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {group.trades.map(trade => {
                    const imgSrc = trade.image || trade.image_url;
                    const isWin = (trade.result || '').toLowerCase() === 'win';
                    const isLoss = (trade.result || '').toLowerCase() === 'loss';
                    const sess = trade.session || detectTradingSession(trade.trade_time || trade.created_at).name;
                    const pipsStr = getPipsDisplay(trade);

                    if (imgSrc) {
                      const imageIndexInFullList = imageTradesList.findIndex(t => t.id === trade.id);

                      return (
                        <div
                          key={trade.id}
                          className="group bg-slate-50 dark:bg-[#0c1220] rounded border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs hover:shadow-md hover:border-slate-400 dark:hover:border-slate-600 transition-all flex flex-col"
                        >
                          {/* Chart Screenshot Thumbnail */}
                          <div 
                            onClick={() => {
                              if (imageIndexInFullList !== -1) setLightboxIndex(imageIndexInFullList);
                            }}
                            className="relative aspect-16/10 bg-black/40 overflow-hidden cursor-pointer"
                          >
                            <img
                              src={formatImageUrl(imgSrc)}
                              alt={`${trade.pair} Chart`}
                              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />

                            {/* Overlaid Badges */}
                            <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
                              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-black/80 text-white backdrop-blur-xs font-mono shadow-xs">
                                {trade.pair || 'XAUUSD'}
                              </span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider backdrop-blur-xs shadow-xs",
                                trade.direction === 'Buy' ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                              )}>
                                {trade.direction}
                              </span>
                            </div>

                            <div className="absolute top-2 right-2 z-10">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[9px] font-bold uppercase font-mono shadow-xs",
                                isWin 
                                  ? "bg-emerald-500 text-white" 
                                  : isLoss 
                                  ? "bg-rose-500 text-white" 
                                  : "bg-slate-700 text-white"
                              )}>
                                {trade.result || 'Pending'}
                              </span>
                            </div>

                            {/* Quick Hover Zoom Icon */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="px-2.5 py-1 bg-black/80 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-md">
                                <Maximize2 size={12} />
                                <span>Perbesar</span>
                              </span>
                            </div>
                          </div>

                          {/* Card Content - Clean & Structured */}
                          <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                            <div>
                              <div className="flex items-baseline justify-between">
                                <span className={cn(
                                  "font-mono text-sm font-bold",
                                  isWin ? "text-emerald-600 dark:text-emerald-400" : isLoss ? "text-rose-600 dark:text-rose-400" : "text-slate-500"
                                )}>
                                  {trade.realized_pl !== null && trade.realized_pl !== undefined 
                                    ? `${trade.realized_pl > 0 ? '+' : ''}${formatCurrency(trade.realized_pl, user?.currency)}` 
                                    : '-'}
                                </span>
                                {pipsStr && (
                                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
                                    {pipsStr}
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate mt-0.5">
                                {trade.setup_name || 'Setup Manual'}
                              </div>
                            </div>

                            {/* Bottom Row */}
                            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                              <div className="flex items-center gap-1 font-mono">
                                <Clock size={10} className="text-cyan-500" />
                                <span>{trade.trade_time || format(safeParseDate(trade.created_at), 'HH:mm')}</span>
                                <span className="opacity-70">· {sess}</span>
                              </div>

                              <div className="flex items-center gap-1">
                                <label 
                                  className="p-1 text-slate-400 hover:text-cyan-600 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors"
                                  title="Ganti Foto Chart"
                                >
                                  <Camera size={12} />
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (file) handleUploadImage(trade, file);
                                    }}
                                  />
                                </label>
                                <button
                                  onClick={() => setEditingTrade(trade)}
                                  className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors"
                                  title="Edit Trade"
                                >
                                  <Edit3 size={12} />
                                </button>
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    }

                    // No image trade card
                    return (
                      <div
                        key={trade.id}
                        className="bg-white dark:bg-[#0c1220] rounded border border-dashed border-slate-300 dark:border-slate-800 p-4 flex flex-col justify-between gap-3 text-center hover:border-cyan-500 transition-colors"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-500">
                          <span>{trade.pair} ({trade.direction})</span>
                          <span className={isWin ? "text-emerald-500" : isLoss ? "text-rose-500" : ""}>{trade.result}</span>
                        </div>

                        <div className="py-3 flex flex-col items-center justify-center gap-1">
                          <label className="w-9 h-9 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform shadow-2xs">
                            <Camera size={16} />
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingTradeId === trade.id}
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadImage(trade, file);
                              }}
                            />
                          </label>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                            {uploadingTradeId === trade.id ? 'Mengunggah...' : '+ Upload Chart'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {trade.setup_name || 'Klik untuk pilih screenshot'}
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-400 font-mono">
                          {format(safeParseDate(trade.created_at), 'dd MMM, HH:mm')} WIB
                        </div>
                      </div>
                    );
                  })}
                </div>

              </section>
            );
          })
        )}

      </div>

      {/* Lightbox Modal - Darkroom Visual Viewer */}
      {activeLightboxTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-150">
          
          {/* Close Button Top Right */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Tutup (Esc)"
          >
            <X size={20} />
          </button>

          {/* Previous Arrow */}
          {lightboxIndex !== null && lightboxIndex > 0 && (
            <button
              onClick={handlePrevImage}
              className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-40 p-2.5 sm:p-3 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 transition-all cursor-pointer hover:scale-110"
              title="Gambar Sebelumnya (Panah Kiri)"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* Next Arrow */}
          {lightboxIndex !== null && lightboxIndex < imageTradesList.length - 1 && (
            <button
              onClick={handleNextImage}
              className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-40 p-2.5 sm:p-3 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 transition-all cursor-pointer hover:scale-110"
              title="Gambar Berikutnya (Panah Kanan)"
            >
              <ChevronRight size={22} />
            </button>
          )}

          {/* Lightbox Container */}
          <div className="w-full max-w-6xl max-h-[92vh] flex flex-col lg:flex-row bg-[#0b101c] border border-neutral-800 rounded-lg overflow-hidden shadow-2xl">
            
            {/* Left: High-Res Image Display */}
            <div className="flex-1 bg-black flex items-center justify-center p-2 sm:p-6 overflow-hidden min-h-[300px] lg:min-h-[550px] relative select-none">
              <img
                src={formatImageUrl(activeLightboxTrade.image || activeLightboxTrade.image_url)}
                alt="Trade Chart Preview"
                className="max-h-[75vh] w-auto max-w-full object-contain rounded"
              />
              
              <div className="absolute bottom-3 left-3 bg-black/80 px-2.5 py-1 rounded text-[11px] font-mono text-white/90 border border-white/10">
                Chart {lightboxIndex !== null ? lightboxIndex + 1 : 1} dari {imageTradesList.length}
              </div>
            </div>

            {/* Right: Clean Grouped Sidebar */}
            <div className="w-full lg:w-84 p-5 border-t lg:border-t-0 lg:border-l border-neutral-800 bg-[#0c1220] flex flex-col justify-between shrink-0 overflow-y-auto max-h-[40vh] lg:max-h-[85vh] space-y-4">
              
              <div className="space-y-3.5">
                
                {/* Header Info */}
                <div className="pb-3 border-b border-neutral-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Spesifikasi Trade
                    </span>
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-2 py-0.5 rounded font-mono",
                      (activeLightboxTrade.result || '').toLowerCase() === 'win' 
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                        : (activeLightboxTrade.result || '').toLowerCase() === 'loss' 
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" 
                        : "bg-slate-700 text-slate-300"
                    )}>
                      {activeLightboxTrade.result || 'Pending'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 mt-2">
                    <h2 className="text-xl font-black text-white font-mono">
                      {activeLightboxTrade.pair}
                    </h2>
                    <span className={cn(
                      "text-xs font-bold px-1.5 py-0.2 rounded uppercase",
                      activeLightboxTrade.direction === 'Buy' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                    )}>
                      {activeLightboxTrade.direction}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <Calendar size={12} />
                    <span>{format(safeParseDate(activeLightboxTrade.created_at), 'dd MMM yyyy')}</span>
                    <span>·</span>
                    <Clock size={12} className="text-cyan-400" />
                    <span>{activeLightboxTrade.trade_time || format(safeParseDate(activeLightboxTrade.created_at), 'HH:mm')} WIB</span>
                  </div>
                </div>

                {/* Group 1: Hasil & Performa */}
                <div className="p-3 bg-neutral-900/90 rounded border border-neutral-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Realized P/L</div>
                  <div className="flex items-baseline justify-between mt-0.5">
                    <div className={cn(
                      "text-2xl font-black font-mono",
                      (activeLightboxTrade.realized_pl || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {(activeLightboxTrade.realized_pl || 0) >= 0 ? '+' : ''}
                      {formatCurrency(activeLightboxTrade.realized_pl, user?.currency)}
                    </div>
                    {getPipsDisplay(activeLightboxTrade) && (
                      <div className="text-xs font-mono font-bold text-slate-300">
                        {getPipsDisplay(activeLightboxTrade)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Group 2: Parameter Transaksi */}
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div className="p-2 bg-neutral-900/60 rounded border border-neutral-800">
                    <div className="text-[9px] uppercase text-slate-400 font-semibold">Entry</div>
                    <div className="font-bold text-white mt-0.5">{activeLightboxTrade.entry_price || '-'}</div>
                  </div>
                  <div className="p-2 bg-neutral-900/60 rounded border border-neutral-800">
                    <div className="text-[9px] uppercase text-rose-400 font-semibold">SL</div>
                    <div className="font-bold text-white mt-0.5">{activeLightboxTrade.sl || '-'}</div>
                  </div>
                  <div className="p-2 bg-neutral-900/60 rounded border border-neutral-800">
                    <div className="text-[9px] uppercase text-emerald-400 font-semibold">TP</div>
                    <div className="font-bold text-white mt-0.5">{activeLightboxTrade.tp || '-'}</div>
                  </div>
                </div>

                {/* Group 3: Waktu & Strategi */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-neutral-900/40 border border-neutral-800">
                    <span className="text-slate-400 text-[11px]">Sesi Trading:</span>
                    <span className="font-bold text-cyan-400 text-[11px]">
                      {activeLightboxTrade.session || detectTradingSession(activeLightboxTrade.trade_time || activeLightboxTrade.created_at).displayName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-neutral-900/40 border border-neutral-800">
                    <span className="text-slate-400 text-[11px]">Setup:</span>
                    <span className="font-bold text-amber-400 text-[11px]">
                      {activeLightboxTrade.setup_name || 'Setup Manual'}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                {activeLightboxTrade.notes && (
                  <div className="p-2.5 rounded bg-neutral-900/60 border border-neutral-800 text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Catatan:</span>
                    <p className="text-slate-300 leading-relaxed italic">
                      "{activeLightboxTrade.notes}"
                    </p>
                  </div>
                )}

              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-2">
                <a
                  href={formatImageUrl(activeLightboxTrade.image || activeLightboxTrade.image_url)}
                  download={`trade_${activeLightboxTrade.pair}_${activeLightboxTrade.id}.png`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download</span>
                </a>

                <button
                  onClick={() => {
                    setEditingTrade(activeLightboxTrade);
                  }}
                  className="px-3 py-1.5 rounded text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 size={13} />
                  <span>Edit Trade</span>
                </button>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* Edit Trade Modal */}
      {editingTrade && (
        <EditTradeModal
          trade={editingTrade}
          onClose={() => setEditingTrade(null)}
          onUpdated={() => {
            setEditingTrade(null);
            onTradeUpdated();
          }}
        />
      )}

    </div>
  );
}
