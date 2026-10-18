import React, { useMemo, useState } from 'react';
import { Trade, User } from '../types';
import { cn } from '../lib/utils';
import { 
  startOfWeek, 
  endOfWeek, 
  subWeeks, 
  isSameDay, 
  format 
} from 'date-fns';
import { formatCurrency, safeParseDate, safeFormatDate } from '../utils';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Trophy, 
  AlertTriangle, 
  Award, 
  ArrowUpRight, 
  ArrowDownRight,
  ChevronRight,
  Camera,
  Activity,
  Layers,
  BarChart3
} from 'lucide-react';

interface WeeklyReviewProps {
  trades: Trade[];
  user?: User | null;
  startingBalance: number;
  currentEquity: number;
  onOpenGallery?: () => void;
  onOpenHistory?: () => void;
}

export default function WeeklyReview({
  trades,
  user,
  startingBalance,
  currentEquity,
  onOpenGallery,
  onOpenHistory
}: WeeklyReviewProps) {
  // Option to toggle between viewing "This Week" (current) or "Last Week" (previous)
  const [selectedWeek, setSelectedWeek] = useState<'current' | 'previous'>('current');

  // Closed trades sorted chronologically
  const closedTrades = useMemo(() => {
    return trades
      .filter(t => t.result && t.result !== 'Pending')
      .sort((a, b) => safeParseDate(a.created_at).getTime() - safeParseDate(b.created_at).getTime());
  }, [trades]);

  const now = new Date();
  
  // Date boundaries for current week (Monday to Sunday)
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 });

  // Date boundaries for previous week
  const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const prevWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  // Determine active target week boundaries
  const activeStart = selectedWeek === 'current' ? currentWeekStart : prevWeekStart;
  const activeEnd = selectedWeek === 'current' ? currentWeekEnd : prevWeekEnd;

  // Comparison week boundaries (if current, compare to prev; if prev, compare to 2 weeks ago)
  const compStart = selectedWeek === 'current' ? prevWeekStart : startOfWeek(subWeeks(now, 2), { weekStartsOn: 1 });
  const compEnd = selectedWeek === 'current' ? prevWeekEnd : endOfWeek(subWeeks(now, 2), { weekStartsOn: 1 });

  // Filter trades for active week
  const weekTrades = useMemo(() => {
    const startTime = activeStart.getTime();
    const endTime = activeEnd.getTime();
    return closedTrades.filter(t => {
      const time = safeParseDate(t.created_at).getTime();
      return time >= startTime && time <= endTime;
    });
  }, [closedTrades, activeStart, activeEnd]);

  // Filter trades for comparison week
  const compTrades = useMemo(() => {
    const startTime = compStart.getTime();
    const endTime = compEnd.getTime();
    return closedTrades.filter(t => {
      const time = safeParseDate(t.created_at).getTime();
      return time >= startTime && time <= endTime;
    });
  }, [closedTrades, compStart, compEnd]);

  // Metrics for active week
  const activeMetrics = useMemo(() => {
    const total = weekTrades.length;
    const wins = weekTrades.filter(t => t.result.toLowerCase() === 'win').length;
    const losses = weekTrades.filter(t => t.result.toLowerCase() === 'loss').length;
    const breakevens = weekTrades.filter(t => t.result.toLowerCase() === 'breakeven').length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    let grossProfit = 0;
    let grossLoss = 0;
    let totalPips = 0;

    weekTrades.forEach(t => {
      const pl = t.realized_pl || 0;
      if (pl > 0) grossProfit += pl;
      else if (pl < 0) grossLoss += Math.abs(pl);
      totalPips += (t.pips || 0);
    });

    const netPL = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 'MAX' : '0.00';
    
    // Starting balance at the beginning of this week
    let weekStartEquity = startingBalance;
    const firstWeekTradeTime = weekTrades.length > 0 ? safeParseDate(weekTrades[0].created_at).getTime() : activeStart.getTime();
    closedTrades.forEach(t => {
      if (safeParseDate(t.created_at).getTime() < firstWeekTradeTime) {
        weekStartEquity += (t.realized_pl || 0);
      }
    });

    const weeklyGrowthPct = weekStartEquity > 0 ? ((netPL / weekStartEquity) * 100).toFixed(2) : '0.00';

    return {
      total,
      wins,
      losses,
      breakevens,
      winRate,
      grossProfit,
      grossLoss,
      netPL,
      profitFactor,
      totalPips,
      weekStartEquity,
      weeklyGrowthPct
    };
  }, [weekTrades, closedTrades, startingBalance, activeStart]);

  // Metrics for comparison week
  const compMetrics = useMemo(() => {
    const total = compTrades.length;
    const wins = compTrades.filter(t => t.result.toLowerCase() === 'win').length;
    const losses = compTrades.filter(t => t.result.toLowerCase() === 'loss').length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    let grossProfit = 0;
    let grossLoss = 0;

    compTrades.forEach(t => {
      const pl = t.realized_pl || 0;
      if (pl > 0) grossProfit += pl;
      else if (pl < 0) grossLoss += Math.abs(pl);
    });

    const netPL = grossProfit - grossLoss;

    return {
      total,
      wins,
      losses,
      winRate,
      netPL
    };
  }, [compTrades]);

  // Delta comparisons
  const deltaPL = activeMetrics.netPL - compMetrics.netPL;
  const deltaWinRate = activeMetrics.winRate - compMetrics.winRate;

  // Best & Worst Trading Day of the Week
  const { bestDay, worstDay } = useMemo(() => {
    if (weekTrades.length === 0) return { bestDay: null, worstDay: null };

    const daysMap: Record<string, { date: Date; pnl: number; count: number; wins: number }> = {};

    weekTrades.forEach(t => {
      const d = safeParseDate(t.created_at);
      const dayKey = format(d, 'yyyy-MM-dd');
      if (!daysMap[dayKey]) {
        daysMap[dayKey] = { date: d, pnl: 0, count: 0, wins: 0 };
      }
      daysMap[dayKey].pnl += (t.realized_pl || 0);
      daysMap[dayKey].count += 1;
      if (t.result.toLowerCase() === 'win') daysMap[dayKey].wins += 1;
    });

    const dayList = Object.values(daysMap);
    if (dayList.length === 0) return { bestDay: null, worstDay: null };

    // Sort by P/L descending
    const sorted = [...dayList].sort((a, b) => b.pnl - a.pnl);

    const best = sorted[0];
    const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;

    return {
      bestDay: best ? {
        dayName: format(best.date, 'EEEE'),
        dateStr: format(best.date, 'dd MMM'),
        pnl: best.pnl,
        count: best.count,
        winRate: Math.round((best.wins / best.count) * 100)
      } : null,
      worstDay: worst && worst.pnl < best.pnl ? {
        dayName: format(worst.date, 'EEEE'),
        dateStr: format(worst.date, 'dd MMM'),
        pnl: worst.pnl,
        count: worst.count,
        winRate: Math.round((worst.wins / worst.count) * 100)
      } : null
    };
  }, [weekTrades]);

  // Instrument Breakdown for the Week
  const instrumentStats = useMemo(() => {
    if (weekTrades.length === 0) return [];

    const map: Record<string, { pair: string; trades: number; wins: number; pnl: number; pips: number }> = {};

    weekTrades.forEach(t => {
      const pair = t.pair || 'XAUUSD';
      if (!map[pair]) {
        map[pair] = { pair, trades: 0, wins: 0, pnl: 0, pips: 0 };
      }
      map[pair].trades += 1;
      if (t.result.toLowerCase() === 'win') map[pair].wins += 1;
      map[pair].pnl += (t.realized_pl || 0);
      map[pair].pips += (t.pips || 0);
    });

    return Object.values(map).sort((a, b) => b.pnl - a.pnl);
  }, [weekTrades]);

  // Best & Worst Single Trade of the Week
  const { bestTrade, worstTrade } = useMemo(() => {
    if (weekTrades.length === 0) return { bestTrade: null, worstTrade: null };

    let best: Trade | null = null;
    let worst: Trade | null = null;

    weekTrades.forEach(t => {
      const pl = t.realized_pl || 0;
      if (!best || pl > (best.realized_pl || 0)) best = t;
      if (!worst || pl < (worst.realized_pl || 0)) worst = t;
    });

    return { bestTrade: best, worstTrade: worst };
  }, [weekTrades]);

  const activeRangeStr = `${format(activeStart, 'dd MMM')} – ${format(activeEnd, 'dd MMM yyyy')}`;
  const compRangeStr = `${format(compStart, 'dd MMM')} – ${format(compEnd, 'dd MMM')}`;

  return (
    <div className="bg-[#101622] rounded border border-slate-800/80 p-5 sm:p-6 space-y-5">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-400 flex items-center justify-center">
              <Calendar size={13} />
            </div>
            <h2 className="text-sm font-bold tracking-tight text-white uppercase">
              Weekly Performance Review
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              Weekend Evaluation
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Ringkasan kinerja mingguan untuk evaluasi komprehensif tanpa data palsu
          </p>
        </div>

        {/* Week Switcher Tabs */}
        <div className="flex items-center bg-[#0b0f17] border border-slate-800 rounded p-0.5 text-xs font-mono">
          <button
            onClick={() => setSelectedWeek('current')}
            className={cn(
              "px-3 py-1.5 rounded transition-colors cursor-pointer flex items-center gap-1.5 font-bold",
              selectedWeek === 'current'
                ? "bg-[#FF3333] text-white shadow-xs"
                : "text-[#A3A3A3] hover:text-white"
            )}
          >
            <span>Minggu Ini</span>
          </button>
          <button
            onClick={() => setSelectedWeek('previous')}
            className={cn(
              "px-3 py-1.5 rounded transition-colors cursor-pointer flex items-center gap-1.5 font-bold",
              selectedWeek === 'previous'
                ? "bg-[#FF3333] text-white shadow-xs"
                : "text-[#A3A3A3] hover:text-white"
            )}
          >
            <span>Minggu Lalu</span>
          </button>
        </div>
      </div>

      {/* Date Range Sub-header */}
      <div className="flex items-center justify-between text-xs font-mono text-slate-400 bg-[#0b0f17] px-3.5 py-2 rounded border border-slate-800/60">
        <span className="flex items-center gap-1.5">
          <span className="text-slate-500">Periode Evaluasi:</span>
          <strong className="text-slate-200">{activeRangeStr}</strong>
        </span>
        <span className="hidden sm:inline text-slate-500">
          Dibandingkan: <span className="text-slate-400">{compRangeStr}</span>
        </span>
      </div>

      {/* When no trades in active week */}
      {weekTrades.length === 0 ? (
        <div className="py-10 px-4 text-center rounded border border-dashed border-slate-800 bg-[#0b0f17]/40 space-y-3">
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 text-slate-500 mx-auto flex items-center justify-center">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
              Belum Ada Trade Selesai Pada Periode Ini
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Tidak ada catatan trade closed pada {activeRangeStr}. Jika Anda mengevaluasi hasil trade minggu kemarin, klik tombol di bawah ini:
            </p>
          </div>
          {selectedWeek === 'current' && (
            <button
              onClick={() => setSelectedWeek('previous')}
              className="px-3.5 py-1.5 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Buka Evaluasi Minggu Lalu</span>
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 2. Core Weekly Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            
            {/* Card 1: Weekly Net Realized P/L */}
            <div className="bg-[#0b0f17] p-4 rounded border border-slate-800/80 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                Net P/L Mingguan
              </span>
              <div className={cn(
                "text-xl sm:text-2xl font-bold font-mono tracking-tight tabular-nums",
                activeMetrics.netPL >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {activeMetrics.netPL > 0 ? '+' : ''}{formatCurrency(activeMetrics.netPL, user?.currency)}
              </div>
              
              {/* Comparison vs Previous Week */}
              <div className="text-[11px] font-mono text-slate-400 pt-0.5 flex items-center gap-1.5 flex-wrap">
                {compMetrics.total > 0 ? (
                  <>
                    <span className="text-slate-500">vs prev:</span>
                    <span className={cn(
                      "font-semibold flex items-center",
                      deltaPL >= 0 ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {deltaPL >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {deltaPL > 0 ? '+' : ''}{formatCurrency(deltaPL, user?.currency)}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">No prev week data</span>
                )}
              </div>
            </div>

            {/* Card 2: Weekly Win Rate */}
            <div className="bg-[#0b0f17] p-4 rounded border border-slate-800/80 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                Win Rate Mingguan
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight tabular-nums text-white">
                {activeMetrics.winRate}%
              </div>
              <div className="text-[11px] font-mono text-slate-400 pt-0.5 flex items-center justify-between">
                {activeMetrics.total > 0 ? (
                  <span>
                    <strong className="text-emerald-400">{activeMetrics.wins}W</strong>
                    {' / '}
                    <strong className="text-rose-400">{activeMetrics.losses}L</strong>
                    {activeMetrics.breakevens > 0 && ` / ${activeMetrics.breakevens}BE`}
                  </span>
                ) : (
                  <span className="text-slate-500">0 Trade (Data Bersih)</span>
                )}
                {compMetrics.total > 0 && (
                  <span className={cn(
                    "text-[10px] font-semibold",
                    deltaWinRate >= 0 ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {deltaWinRate > 0 ? '+' : ''}{deltaWinRate}% vs prev
                  </span>
                )}
              </div>
            </div>

            {/* Card 3: Weekly Profit Factor & Growth */}
            <div className="bg-[#0b0f17] p-4 rounded border border-slate-800/80 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                Profit Factor
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight tabular-nums text-white">
                {activeMetrics.profitFactor}
              </div>
              <div className="text-[11px] font-mono text-slate-400 pt-0.5">
                <span>Weekly Growth: </span>
                <span className={cn(
                  "font-semibold",
                  Number(activeMetrics.weeklyGrowthPct) >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {Number(activeMetrics.weeklyGrowthPct) > 0 ? '+' : ''}{activeMetrics.weeklyGrowthPct}%
                </span>
              </div>
            </div>

            {/* Card 4: Total Trades & Pips */}
            <div className="bg-[#0b0f17] p-4 rounded border border-slate-800/80 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                Total Closed Trades
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight tabular-nums text-white">
                {activeMetrics.total} <span className="text-xs font-normal text-slate-500">tickets</span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 pt-0.5">
                <span>Net Pips: </span>
                <span className={cn(
                  "font-semibold",
                  activeMetrics.totalPips >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {activeMetrics.totalPips > 0 ? '+' : ''}{activeMetrics.totalPips.toLocaleString()} p
                </span>
              </div>
            </div>

          </div>

          {/* 3. Deep Analytical Insights Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
            
            {/* Box 1: Best & Worst Trading Day */}
            <div className="bg-[#0b0f17] p-4 rounded border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
                <span className="flex items-center gap-1.5 font-bold text-slate-300">
                  <BarChart3 size={13} className="text-cyan-400" />
                  Rhythm & Trading Days
                </span>
                <span>Active Week</span>
              </div>

              {/* Best Day */}
              {bestDay ? (
                <div className="p-2.5 rounded bg-[#101622] border border-emerald-900/40 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                      <Trophy size={11} /> Hari Terbaik (Best Day)
                    </span>
                    <span className="text-slate-400 text-[10px]">{bestDay.dateStr}</span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-white font-bold">{bestDay.dayName}</span>
                    <span className="text-emerald-400 font-bold tabular-nums">
                      +{formatCurrency(bestDay.pnl, user?.currency)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-2">
                    <span>{bestDay.count} trade(s)</span>
                    <span>·</span>
                    <span className="text-slate-300">{bestDay.winRate}% win rate</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 font-mono py-2">No best day data</div>
              )}

              {/* Worst Day */}
              {worstDay ? (
                <div className="p-2.5 rounded bg-[#101622] border border-rose-900/40 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1">
                      <AlertTriangle size={11} /> Hari Terburuk (Worst Day)
                    </span>
                    <span className="text-slate-400 text-[10px]">{worstDay.dateStr}</span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-white font-bold">{worstDay.dayName}</span>
                    <span className="text-rose-400 font-bold tabular-nums">
                      {worstDay.pnl > 0 ? '+' : ''}{formatCurrency(worstDay.pnl, user?.currency)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-2">
                    <span>{worstDay.count} trade(s)</span>
                    <span>·</span>
                    <span className="text-slate-300">{worstDay.winRate}% win rate</span>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded bg-[#101622]/50 border border-slate-800 text-[11px] font-mono text-slate-500">
                  Semua hari trading dalam minggu ini konsisten mencatatkan profit.
                </div>
              )}
            </div>

            {/* Box 2: Breakdown Per Instrument */}
            <div className="bg-[#0b0f17] p-4 rounded border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
                <span className="flex items-center gap-1.5 font-bold text-slate-300">
                  <Layers size={13} className="text-amber-400" />
                  Performa Per Instrumen
                </span>
                <span>{instrumentStats.length} Pair(s)</span>
              </div>

              {instrumentStats.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono py-3">Tidak ada data instrumen</div>
              ) : (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {instrumentStats.map(inst => {
                    const wr = inst.trades > 0 ? Math.round((inst.wins / inst.trades) * 100) : 0;
                    return (
                      <div 
                        key={inst.pair}
                        className="p-2 rounded bg-[#101622] border border-slate-800/70 text-xs font-mono flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white">{inst.pair}</span>
                            <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                              {inst.trades} t
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            WR: <strong className={wr >= 50 ? 'text-emerald-400' : 'text-amber-400'}>{wr}%</strong>
                            {' · '}
                            {inst.pips > 0 ? '+' : ''}{inst.pips.toFixed(1)}p
                          </span>
                        </div>

                        <div className={cn(
                          "font-bold font-mono text-right tabular-nums",
                          inst.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {inst.pnl > 0 ? '+' : ''}{formatCurrency(inst.pnl, user?.currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Box 3: Best & Worst Single Trades */}
            <div className="bg-[#0b0f17] p-4 rounded border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
                <span className="flex items-center gap-1.5 font-bold text-slate-300">
                  <Award size={13} className="text-emerald-400" />
                  Trade Highlight Minggu Ini
                </span>
                <span>Tickets</span>
              </div>

              {/* Best Trade */}
              {bestTrade && (
                <div className="p-2.5 rounded bg-[#101622] border border-emerald-900/40 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                      <Trophy size={11} /> Best Trade
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {safeFormatDate(bestTrade.created_at, 'dd MMM, HH:mm')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{bestTrade.pair || 'XAUUSD'}</span>
                      <span className={cn(
                        "text-[9px] uppercase font-bold px-1 py-0.2 rounded",
                        bestTrade.direction === 'Buy' ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"
                      )}>
                        {bestTrade.direction}
                      </span>
                    </div>
                    <span className="text-emerald-400 font-bold tabular-nums">
                      +{formatCurrency(bestTrade.realized_pl || 0, user?.currency)}
                    </span>
                  </div>
                  {Boolean(bestTrade.image || bestTrade.image_url) && onOpenGallery && (
                    <div className="pt-1">
                      <button
                        onClick={onOpenGallery}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Camera size={11} />
                        <span>Lihat Screenshot Chart</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Worst Trade */}
              {worstTrade && worstTrade.id !== bestTrade?.id && (
                <div className="p-2.5 rounded bg-[#101622] border border-rose-900/40 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1">
                      <AlertTriangle size={11} /> Worst Trade
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {safeFormatDate(worstTrade.created_at, 'dd MMM, HH:mm')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{worstTrade.pair || 'XAUUSD'}</span>
                      <span className={cn(
                        "text-[9px] uppercase font-bold px-1 py-0.2 rounded",
                        worstTrade.direction === 'Buy' ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"
                      )}>
                        {worstTrade.direction}
                      </span>
                    </div>
                    <span className="text-rose-400 font-bold tabular-nums">
                      {formatCurrency(worstTrade.realized_pl || 0, user?.currency)}
                    </span>
                  </div>
                  {Boolean(worstTrade.image || worstTrade.image_url) && onOpenGallery && (
                    <div className="pt-1">
                      <button
                        onClick={onOpenGallery}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Camera size={11} />
                        <span>Lihat Screenshot Chart</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );
}
