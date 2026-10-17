import React, { useState, useMemo } from 'react';
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
  Maximize2, 
  PlusCircle,
  Eye,
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { formatCurrency, formatImageUrl, resizeImage, authFetch, safeParseDate, detectTradingSession } from '../utils';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

export interface TradeGalleryProps {
  trades: Trade[];
  user?: User | null;
  onTradeUpdated: () => void;
  onOpenLogTrade?: () => void;
}

interface TradeGroup {
  title: string;
  dateKey: string;
  trades: Trade[];
  netPL: number;
  wins: number;
  losses: number;
}

// Visual Candlestick generator for trades
function CandlestickPreview({ trade, isAfter }: { trade: Trade; isAfter?: boolean }) {
  const isBuy = (trade.direction || '').toLowerCase() === 'buy';
  const isWin = (trade.result || '').toLowerCase() === 'win';
  
  // Simulated aesthetic candles based on trade result
  return (
    <div className="w-full h-full bg-[#0A0A0A] relative flex items-center justify-center overflow-hidden p-2">
      {/* Grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#161616_1px,transparent_1px),linear-gradient(to_bottom,#161616_1px,transparent_1px)] bg-[size:16px_16px] opacity-40"></div>
      
      {/* State Badge */}
      <span className={cn(
        "absolute top-2 left-2 text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded tracking-widest z-10",
        isAfter 
          ? "bg-[#1A1A1A] text-white border border-[#333333]" 
          : "bg-[#FF3333]/20 text-[#FF3333] border border-[#FF3333]/40"
      )}>
        {isAfter ? 'AFTER (OUTCOME)' : 'BEFORE (ENTRY)'}
      </span>

      {/* SVG Candlesticks visualization */}
      <svg className="w-full h-24 overflow-visible" viewBox="0 0 160 80">
        {/* Entry Level Line */}
        <line x1="10" y1="40" x2="150" y2="40" stroke="#FFFFFF" strokeDasharray="2 2" strokeWidth="0.8" opacity="0.6" />
        <text x="14" y="36" fill="#A3A3A3" fontSize="6" fontFamily="monospace">
          ENTRY: {trade.entry_price || '2650.0'}
        </text>

        {/* Candles */}
        {isAfter ? (
          // After state: outcome candles extending past entry to TP or SL
          <>
            {/* Candle 1 */}
            <line x1="30" y1="25" x2="30" y2="55" stroke="#737373" strokeWidth="1" />
            <rect x="26" y="32" width="8" height="15" fill={isBuy ? "#FFFFFF" : "#FF3333"} />
            
            {/* Candle 2 */}
            <line x1="55" y1="28" x2="55" y2="60" stroke="#737373" strokeWidth="1" />
            <rect x="51" y="35" width="8" height="18" fill={isBuy ? "#FF3333" : "#FFFFFF"} />

            {/* Candle 3 (Breakout) */}
            <line x1="80" y1="20" x2="80" y2="65" stroke="#737373" strokeWidth="1" />
            <rect x="76" y={isWin ? (isBuy ? 22 : 38) : (isBuy ? 40 : 25)} width="8" height="24" fill={isWin ? "#FFFFFF" : "#FF3333"} />

            {/* Candle 4 (Target Hit) */}
            <line x1="105" y1="12" x2="105" y2="68" stroke="#737373" strokeWidth="1" />
            <rect x="101" y={isWin ? (isBuy ? 15 : 42) : (isBuy ? 45 : 20)} width="8" height="28" fill={isWin ? "#FFFFFF" : "#FF3333"} />

            {/* Target Label */}
            <text x="105" y={isWin ? 10 : 78} fill={isWin ? "#FFFFFF" : "#FF3333"} fontSize="7" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              {isWin ? '🎯 TP HIT' : '🛑 SL HIT'}
            </text>
          </>
        ) : (
          // Before state: consolidation & setup trigger
          <>
            <line x1="30" y1="30" x2="30" y2="52" stroke="#737373" strokeWidth="1" />
            <rect x="26" y="35" width="8" height="10" fill="#737373" />

            <line x1="55" y1="25" x2="55" y2="56" stroke="#737373" strokeWidth="1" />
            <rect x="51" y="30" width="8" height="18" fill="#FFFFFF" />

            <line x1="80" y1="32" x2="80" y2="58" stroke="#737373" strokeWidth="1" />
            <rect x="76" y="38" width="8" height="12" fill="#FF3333" />

            {/* Trigger Arrow */}
            <circle cx="105" cy="40" r="3" fill="#FF3333" />
            <text x="105" y="28" fill="#FFFFFF" fontSize="6.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              {isBuy ? '▲ BUY SIGNAL' : '▼ SELL SIGNAL'}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

export default function TradeGallery({ trades, user, onTradeUpdated, onOpenLogTrade }: TradeGalleryProps) {
  const [filterResult, setFilterResult] = useState<'all' | 'win' | 'loss'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lightboxTrade, setLightboxTrade] = useState<Trade | null>(null);
  const [activeViewMode, setActiveViewMode] = useState<'split' | 'before' | 'after'>('split');

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      // Outcome filter
      if (filterResult !== 'all') {
        const res = (t.result || '').toLowerCase();
        if (filterResult === 'win' && res !== 'win') return false;
        if (filterResult === 'loss' && res !== 'loss') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchPair = (t.pair || '').toLowerCase().includes(q);
        const matchSetup = (t.setup_name || '').toLowerCase().includes(q);
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        if (!matchPair && !matchSetup && !matchNotes) return false;
      }

      return true;
    }).sort((a, b) => safeParseDate(b.created_at).getTime() - safeParseDate(a.created_at).getTime());
  }, [trades, filterResult, searchQuery]);

  // Grouped daily headers: Thursday, 15 October 2026
  const groupedDailyTrades = useMemo<TradeGroup[]>(() => {
    const groups: Record<string, TradeGroup> = {};

    filteredTrades.forEach(t => {
      const d = safeParseDate(t.created_at);
      const dateKey = format(d, 'yyyy-MM-dd');
      const title = format(d, 'EEEE, dd MMMM yyyy'); // e.g. Thursday, 15 October 2026

      if (!groups[dateKey]) {
        groups[dateKey] = {
          title,
          dateKey,
          trades: [],
          netPL: 0,
          wins: 0,
          losses: 0
        };
      }

      groups[dateKey].trades.push(t);
      groups[dateKey].netPL += (t.realized_pl || 0);
      if ((t.result || '').toLowerCase() === 'win') groups[dateKey].wins += 1;
      if ((t.result || '').toLowerCase() === 'loss') groups[dateKey].losses += 1;
    });

    return Object.values(groups).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredTrades]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#0D0D0D] text-white font-sans selection:bg-[#262626]">
      
      {/* Top Header & Filter Controls */}
      <div className="p-4 sm:p-5 border-b border-[#262626] bg-[#141414] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-mono font-black uppercase tracking-wider text-white">
              MODUL C: GALLERY CHART (BEFORE &amp; AFTER GRID)
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1A1A1A] text-[#FF3333] border border-[#FF3333]/30 font-bold">
              3-COLUMN GRID
            </span>
          </div>
          <p className="text-xs text-[#A3A3A3] mt-0.5 font-mono">
            Evaluasi visual setup &amp; eksekusi candlestick Before vs. After per transaksi
          </p>
        </div>

        {/* Filter Controls: Search & Outcome */}
        <div className="flex items-center gap-3 font-mono text-xs w-full sm:w-auto justify-between sm:justify-end">
          
          {/* Search Input */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D0D0D] border border-[#262626] w-48 sm:w-56 focus-within:border-[#FF3333]">
            <Search size={13} className="text-[#A3A3A3]" />
            <input
              type="text"
              placeholder="Cari setup / pair..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-white text-xs outline-none w-full placeholder-[#555555]"
            />
          </div>

          {/* Win / Loss Filter */}
          <div className="flex items-center bg-[#0D0D0D] p-0.5 rounded-lg border border-[#262626]">
            <button
              onClick={() => setFilterResult('all')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-colors",
                filterResult === 'all' ? "bg-[#262626] text-white" : "text-[#A3A3A3]"
              )}
            >
              Semua
            </button>
            <button
              onClick={() => setFilterResult('win')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-colors",
                filterResult === 'win' ? "bg-white text-black font-extrabold" : "text-[#A3A3A3]"
              )}
            >
              Win
            </button>
            <button
              onClick={() => setFilterResult('loss')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-colors",
                filterResult === 'loss' ? "bg-[#FF3333] text-white font-extrabold" : "text-[#A3A3A3]"
              )}
            >
              Loss
            </button>
          </div>

          {onOpenLogTrade && (
            <button
              onClick={onOpenLogTrade}
              className="px-3 py-1.5 rounded-lg bg-[#FF3333] text-white font-bold hover:bg-[#E62E2E] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <PlusCircle size={14} />
              <span className="hidden sm:inline">Trade Baru</span>
            </button>
          )}

        </div>
      </div>

      {/* Main Content: Grouped Daily Headers & 3-Column Responsive Grid */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-8">
        
        {groupedDailyTrades.length === 0 ? (
          <div className="max-w-md mx-auto text-center py-20 px-6 bg-[#141414] border border-[#262626] rounded-2xl shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-[#181818] border border-[#262626] flex items-center justify-center mx-auto text-[#FF3333] mb-3">
              <Images size={22} />
            </div>
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
              Belum Ada Trade Tercatat
            </h3>
            <p className="text-xs text-[#A3A3A3] mt-1 mb-4 font-mono">
              Catat transaksi trading baru untuk melihat visualisasi candlestick Before &amp; After di galeri ini.
            </p>
          </div>
        ) : (
          groupedDailyTrades.map(group => {
            const signPL = group.netPL >= 0 ? '+' : '';
            return (
              <section key={group.dateKey} className="space-y-4">
                
                {/* Group Daily Header (e.g. Thursday, 15 October 2026) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-[#262626] gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#FF3333]"></div>
                    <h3 className="text-sm sm:text-base font-bold font-mono text-white tracking-tight">
                      {group.title}
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#181818] text-[#A3A3A3] border border-[#262626] font-semibold">
                      {group.trades.length} trades
                    </span>
                  </div>

                  {/* Summary Indicators */}
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-white font-bold">{group.wins}W</span>
                    <span className="text-[#FF3333] font-bold">{group.losses}L</span>
                    <span className="text-[#404040]">·</span>
                    <span className={cn(
                      "font-bold tabular-nums",
                      group.netPL < 0 ? "text-[#FF3333]" : "text-white"
                    )}>
                      {signPL}{formatCurrency(group.netPL, user?.currency)}
                    </span>
                  </div>
                </div>

                {/* Grid 3 Kolom */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {group.trades.map(trade => {
                    const isWin = (trade.result || '').toLowerCase() === 'win';
                    const isLoss = (trade.result || '').toLowerCase() === 'loss';
                    const isBuy = (trade.direction || '').toLowerCase() === 'buy';
                    const imgSrc = trade.image || trade.image_url;
                    const sessInfo = detectTradingSession(trade.trade_time || trade.created_at);

                    return (
                      <div
                        key={trade.id}
                        className="bg-[#141414] rounded-xl border border-[#262626] overflow-hidden flex flex-col shadow-2xs hover:border-[#3D3D3D] transition-all group"
                      >
                        {/* Candlestick / Chart Graphic Split in Two: BEFORE (kiri) & AFTER (kanan) */}
                        <div className="relative aspect-16/10 bg-[#0A0A0A] border-b border-[#262626] overflow-hidden">
                          
                          {imgSrc ? (
                            // When user uploaded image: split comparison or full with dual indicators
                            <div className="relative w-full h-full flex">
                              <div className="w-1/2 h-full border-r border-[#262626] relative overflow-hidden bg-black/60">
                                <span className="absolute top-2 left-2 text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-[#FF3333]/30 text-[#FF3333] border border-[#FF3333]/50 z-10">
                                  BEFORE
                                </span>
                                <img
                                  src={formatImageUrl(imgSrc)}
                                  alt="Chart Before"
                                  className="w-full h-full object-cover object-left opacity-90 group-hover:scale-105 transition-transform duration-300"
                                />
                              </div>
                              <div className="w-1/2 h-full relative overflow-hidden bg-black/60">
                                <span className="absolute top-2 left-2 text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-[#181818] text-white border border-[#333333] z-10">
                                  AFTER
                                </span>
                                <img
                                  src={formatImageUrl(imgSrc)}
                                  alt="Chart After"
                                  className="w-full h-full object-cover object-right opacity-90 group-hover:scale-105 transition-transform duration-300"
                                />
                              </div>
                            </div>
                          ) : (
                            // Pure Candlestick Split View: Before on Left, After on Right
                            <div className="w-full h-full flex">
                              <div className="w-1/2 h-full border-r border-[#262626]">
                                <CandlestickPreview trade={trade} isAfter={false} />
                              </div>
                              <div className="w-1/2 h-full">
                                <CandlestickPreview trade={trade} isAfter={true} />
                              </div>
                            </div>
                          )}

                          {/* Lightbox / Fullscreen Trigger Button */}
                          <button
                            onClick={() => {
                              setLightboxTrade(trade);
                              setActiveViewMode('split');
                            }}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/75 hover:bg-[#FF3333] text-white transition-colors cursor-pointer z-20 backdrop-blur-xs shadow-md"
                            title="Buka Lightbox Fullscreen Detail"
                          >
                            <Maximize2 size={13} />
                          </button>

                          {/* Quick Price Tags */}
                          <div className="absolute bottom-1.5 left-2 right-2 flex justify-between text-[9px] font-mono text-[#A3A3A3] bg-black/80 backdrop-blur-xs px-2 py-0.5 rounded border border-[#222222]">
                            <span>Entry: <strong className="text-white">{trade.entry_price || '-'}</strong></span>
                            <span>SL: <strong className="text-[#FF3333]">{trade.sl || '-'}</strong></span>
                            <span>TP: <strong className="text-white">{trade.tp || '-'}</strong></span>
                          </div>
                        </div>

                        {/* Card Body & Badges */}
                        <div className="p-4 flex flex-col gap-3 font-mono text-xs flex-1 justify-between">
                          
                          {/* Row 1: Badges: XAUUSD, BUY/SELL, WIN/LOSS */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              {/* Instrument Badge */}
                              <span className="font-extrabold px-2 py-0.5 rounded bg-[#1C1C1C] text-white border border-[#333333]">
                                {trade.pair || 'XAUUSD'}
                              </span>

                              {/* Direction BUY / SELL */}
                              <span className={cn(
                                "text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider",
                                isBuy
                                  ? "bg-[#252525] text-white border border-[#404040]"
                                  : "bg-[#2A1010] text-[#FF3333] border border-[#FF3333]/40"
                              )}>
                                {trade.direction}
                              </span>
                            </div>

                            {/* Status WIN (White/Black) / LOSS (Crimson Red) */}
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-[10px] font-black uppercase px-2.5 py-0.5 rounded tracking-wider",
                                isWin 
                                  ? "bg-white text-black border border-white" 
                                  : isLoss 
                                  ? "bg-[#FF3333] text-white border border-[#FF3333]" 
                                  : "bg-[#252525] text-[#A3A3A3]"
                              )}>
                                {trade.result}
                              </span>

                              <span className={cn(
                                "font-bold tabular-nums text-xs",
                                isLoss ? "text-[#FF3333]" : "text-white"
                              )}>
                                {trade.realized_pl !== null && trade.realized_pl !== undefined
                                  ? `${trade.realized_pl > 0 ? '+' : ''}${formatCurrency(trade.realized_pl, user?.currency)}`
                                  : '-'}
                              </span>
                            </div>
                          </div>

                          {/* Row 2: Setup Name & Session */}
                          <div className="flex items-center justify-between text-[11px] text-[#A3A3A3] pt-1 border-t border-[#1F1F1F]">
                            <span>Setup: <strong className="text-white">{trade.setup_name || 'Standard'}</strong></span>
                            <span>{trade.session || sessInfo.name}</span>
                          </div>

                          {/* Row 3: Trader Psychology / Execution Notes at Bottom */}
                          <div className="p-2.5 rounded-lg bg-[#0F0F0F] border border-[#222222] text-[11px] leading-relaxed text-[#A3A3A3]">
                            <span className="text-[9px] uppercase font-bold text-[#737373] block mb-0.5">
                              Trader Psychology &amp; Execution Note:
                            </span>
                            <p className="italic text-white">
                              "{trade.notes || 'Disiplin eksekusi sesuai trading plan tanpa emosi berlebih.'}"
                            </p>
                          </div>

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

      {/* Lightbox Detail View (Fullscreen Modal) */}
      {lightboxTrade && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md"
          onClick={() => setLightboxTrade(null)}
        >
          <div 
            className="relative w-full max-w-5xl bg-[#141414] border border-[#262626] rounded-2xl shadow-2xl p-6 flex flex-col gap-4 font-mono text-xs max-h-[95vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-white">
                  DETAIL VIEW: {lightboxTrade.pair || 'XAUUSD'} {lightboxTrade.direction}
                </span>
                <span className={cn(
                  "text-[10px] font-black uppercase px-2 py-0.5 rounded",
                  (lightboxTrade.result || '').toLowerCase() === 'win' 
                    ? "bg-white text-black" 
                    : "bg-[#FF3333] text-white"
                )}>
                  {lightboxTrade.result}
                </span>
                <span className="text-white font-bold">
                  {(lightboxTrade.realized_pl || 0) > 0 ? '+' : ''}{formatCurrency(lightboxTrade.realized_pl, user?.currency)}
                </span>
              </div>

              {/* View Mode Toggle: Split / Before / After */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#0D0D0D] p-0.5 rounded-lg border border-[#262626]">
                  <button
                    onClick={() => setActiveViewMode('split')}
                    className={cn("px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer", activeViewMode === 'split' ? "bg-[#FF3333] text-white" : "text-[#A3A3A3]")}
                  >
                    Split B/A
                  </button>
                  <button
                    onClick={() => setActiveViewMode('before')}
                    className={cn("px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer", activeViewMode === 'before' ? "bg-[#FF3333] text-white" : "text-[#A3A3A3]")}
                  >
                    Before Only
                  </button>
                  <button
                    onClick={() => setActiveViewMode('after')}
                    className={cn("px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer", activeViewMode === 'after' ? "bg-[#FF3333] text-white" : "text-[#A3A3A3]")}
                  >
                    After Only
                  </button>
                </div>

                <button
                  onClick={() => setLightboxTrade(null)}
                  className="w-8 h-8 rounded-full bg-[#181818] hover:bg-[#FF3333] text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Main Visual Display */}
            <div className="w-full h-80 sm:h-96 bg-[#0A0A0A] rounded-xl border border-[#262626] overflow-hidden relative">
              {lightboxTrade.image || lightboxTrade.image_url ? (
                <img
                  src={formatImageUrl(lightboxTrade.image || lightboxTrade.image_url)}
                  alt="Full Chart"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex">
                  {activeViewMode === 'split' && (
                    <>
                      <div className="w-1/2 h-full border-r border-[#262626]">
                        <CandlestickPreview trade={lightboxTrade} isAfter={false} />
                      </div>
                      <div className="w-1/2 h-full">
                        <CandlestickPreview trade={lightboxTrade} isAfter={true} />
                      </div>
                    </>
                  )}
                  {activeViewMode === 'before' && (
                    <div className="w-full h-full">
                      <CandlestickPreview trade={lightboxTrade} isAfter={false} />
                    </div>
                  )}
                  {activeViewMode === 'after' && (
                    <div className="w-full h-full">
                      <CandlestickPreview trade={lightboxTrade} isAfter={true} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Parameters & Psychology Note */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-[#0D0D0D] rounded-xl border border-[#262626]">
              <div>
                <span className="text-[#A3A3A3] text-[10px] block">Entry Price:</span>
                <span className="text-white font-bold">{lightboxTrade.entry_price || '-'}</span>
              </div>
              <div>
                <span className="text-[#A3A3A3] text-[10px] block">Stop Loss:</span>
                <span className="text-[#FF3333] font-bold">{lightboxTrade.sl || '-'}</span>
              </div>
              <div>
                <span className="text-[#A3A3A3] text-[10px] block">Take Profit:</span>
                <span className="text-white font-bold">{lightboxTrade.tp || '-'}</span>
              </div>
              <div>
                <span className="text-[#A3A3A3] text-[10px] block">Lot Size:</span>
                <span className="text-white font-bold">{lightboxTrade.position_size || '0.01'}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0F0F0F] border border-[#222222]">
              <span className="text-[10px] uppercase font-bold text-[#A3A3A3] block mb-1">
                Catatan Psikologi &amp; Evaluasi Trader:
              </span>
              <p className="text-white text-xs leading-relaxed italic">
                "{lightboxTrade.notes || 'Tidak ada catatan tambahan untuk eksekusi trade ini.'}"
              </p>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
