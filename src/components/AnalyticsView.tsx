import React, { useMemo, useState } from 'react';
import { Trade, User } from '../types';
import { cn } from '../lib/utils';
import { 
  format, 
  subDays, 
  startOfDay, 
  isSameDay, 
  startOfWeek, 
  endOfWeek, 
  subWeeks 
} from 'date-fns';
import { formatCurrency, safeParseDate } from '../utils';
import { 
  BarChart3, 
  Activity, 
  Calendar, 
  DollarSign, 
  Percent, 
  Award, 
  AlertTriangle,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Layers,
  Info
} from 'lucide-react';

interface AnalyticsViewProps {
  trades: Trade[];
  user?: User | null;
  startingBalance: number;
  currentEquity: number;
  onOpenGallery?: () => void;
  onOpenHistory?: () => void;
}

export default function AnalyticsView({
  trades,
  user,
  startingBalance,
  currentEquity,
  onOpenGallery,
  onOpenHistory
}: AnalyticsViewProps) {
  // Option to toggle between viewing "This Week" (current) or "Last Week" (previous)
  const [selectedWeek, setSelectedWeek] = useState<'current' | 'previous'>('current');
  const [showMatrixLegend, setShowMatrixLegend] = useState<boolean>(false);

  // Closed trades sorted chronologically
  const closedTrades = useMemo(() => {
    return trades
      .filter(t => t.result && t.result.toLowerCase() !== 'pending')
      .sort((a, b) => safeParseDate(a.created_at).getTime() - safeParseDate(b.created_at).getTime());
  }, [trades]);

  const now = new Date();
  
  // Date boundaries for current & previous week (Monday to Sunday)
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const prevWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  const activeStart = selectedWeek === 'current' ? currentWeekStart : prevWeekStart;
  const activeEnd = selectedWeek === 'current' ? currentWeekEnd : prevWeekEnd;

  // Filter trades for active week
  const weekTrades = useMemo(() => {
    const startTime = activeStart.getTime();
    const endTime = activeEnd.getTime();
    return closedTrades.filter(t => {
      const time = safeParseDate(t.created_at).getTime();
      return time >= startTime && time <= endTime;
    });
  }, [closedTrades, activeStart, activeEnd]);

  // Top KPI Metrics for Active Week (2x2 Grid)
  const weekKPI = useMemo(() => {
    const total = weekTrades.length;
    const wins = weekTrades.filter(t => t.result.toLowerCase() === 'win').length;
    const losses = weekTrades.filter(t => t.result.toLowerCase() === 'loss').length;
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

    return {
      netPL,
      winRate,
      profitFactor,
      total,
      wins,
      losses,
      grossProfit,
      grossLoss,
      totalPips
    };
  }, [weekTrades]);

  // Rhythm & Trading Days: Best Day (White profit) & Worst Day (Red minus)
  const rhythmDays = useMemo(() => {
    if (weekTrades.length === 0) return { bestDay: null, worstDay: null };

    const daysMap: Record<string, { date: Date; pnl: number; count: number; wins: number; losses: number }> = {};

    weekTrades.forEach(t => {
      const d = safeParseDate(t.created_at);
      const dayKey = format(d, 'yyyy-MM-dd');
      if (!daysMap[dayKey]) {
        daysMap[dayKey] = { date: d, pnl: 0, count: 0, wins: 0, losses: 0 };
      }
      daysMap[dayKey].pnl += (t.realized_pl || 0);
      daysMap[dayKey].count += 1;
      if (t.result.toLowerCase() === 'win') daysMap[dayKey].wins += 1;
      if (t.result.toLowerCase() === 'loss') daysMap[dayKey].losses += 1;
    });

    const dayList = Object.values(daysMap);
    if (dayList.length === 0) return { bestDay: null, worstDay: null };

    const sorted = [...dayList].sort((a, b) => b.pnl - a.pnl);
    const best = sorted[0];
    const worst = sorted.length > 1 ? sorted[sorted.length - 1] : (sorted[0].pnl < 0 ? sorted[0] : null);

    return {
      bestDay: best && best.pnl >= 0 ? {
        dayName: format(best.date, 'EEEE'),
        dateStr: format(best.date, 'dd MMM'),
        pnl: best.pnl,
        count: best.count,
        winRate: Math.round((best.wins / best.count) * 100)
      } : null,
      worstDay: worst && worst.pnl < 0 ? {
        dayName: format(worst.date, 'EEEE'),
        dateStr: format(worst.date, 'dd MMM'),
        pnl: worst.pnl,
        count: worst.count,
        winRate: Math.round((worst.wins / worst.count) * 100)
      } : null
    };
  }, [weekTrades]);

  // Consistency & Win Rate Matrix: 30-Day Matrix with Pure White to Red Gradation (ZERO GREEN)
  const matrixDays = useMemo(() => {
    const todayDate = startOfDay(new Date());
    const days = [];

    for (let i = 29; i >= 0; i--) {
      const d = subDays(todayDate, i);
      const dayTrades = closedTrades.filter(t => {
        const tDate = startOfDay(safeParseDate(t.created_at));
        return isSameDay(tDate, d);
      });

      let dayPL = 0;
      let dayWins = 0;
      let dayLosses = 0;
      let status: 'win' | 'loss' | 'be' | 'empty' = 'empty';

      if (dayTrades.length > 0) {
        dayWins = dayTrades.filter(t => t.result.toLowerCase() === 'win').length;
        dayLosses = dayTrades.filter(t => t.result.toLowerCase() === 'loss').length;
        dayPL = dayTrades.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
        if (dayPL > 0) status = 'win';
        else if (dayPL < 0) status = 'loss';
        else status = 'be';
      }

      const wr = dayTrades.length > 0 ? dayWins / dayTrades.length : -1;
      days.push({
        date: d,
        displayDate: format(d, 'dd MMM'),
        tradesCount: dayTrades.length,
        dayPL,
        wr,
        wins: dayWins,
        losses: dayLosses,
        status
      });
    }
    return days;
  }, [closedTrades]);

  // Bottom Performance Table 1: Performance by Weekday (Monday–Friday)
  const weekdayStats = useMemo(() => {
    const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const acc: Record<string, { trades: number; wins: number; losses: number; pnl: number }> = {};
    
    closedTrades.forEach(t => {
      const date = safeParseDate(t.created_at);
      const dayName = daysMap[date.getDay()];
      if (!acc[dayName]) acc[dayName] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
      acc[dayName].trades += 1;
      if (t.result.toLowerCase() === 'win') acc[dayName].wins += 1;
      if (t.result.toLowerCase() === 'loss') acc[dayName].losses += 1;
      acc[dayName].pnl += (t.realized_pl || 0);
    });

    return [
      { key: 'Monday', label: 'Senin (Monday)' },
      { key: 'Tuesday', label: 'Selasa (Tuesday)' },
      { key: 'Wednesday', label: 'Rabu (Wednesday)' },
      { key: 'Thursday', label: 'Kamis (Thursday)' },
      { key: 'Friday', label: 'Jumat (Friday)' }
    ].map(item => {
      const data = acc[item.key] || { trades: 0, wins: 0, losses: 0, pnl: 0 };
      return {
        day: item.label,
        trades: data.trades,
        wins: data.wins,
        losses: data.losses,
        winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0,
        pnl: data.pnl
      };
    });
  }, [closedTrades]);

  // Bottom Performance Table 2: Performance by Market Session (Asian, London, NY Overlap, New York)
  const sessionPerformance = useMemo(() => {
    const acc: Record<string, { hours: string; trades: number; wins: number; losses: number; pnl: number }> = {
      'Asian': { hours: '06:00 - 14:00 WIB', trades: 0, wins: 0, losses: 0, pnl: 0 },
      'London': { hours: '14:00 - 20:00 WIB', trades: 0, wins: 0, losses: 0, pnl: 0 },
      'NY Overlap': { hours: '19:00 - 23:00 WIB', trades: 0, wins: 0, losses: 0, pnl: 0 },
      'New York': { hours: '20:00 - 04:00 WIB', trades: 0, wins: 0, losses: 0, pnl: 0 }
    };

    closedTrades.forEach(t => {
      const date = safeParseDate(t.created_at);
      const hours = date.getHours();
      let key = 'Asian';
      if (hours >= 19 && hours <= 23) {
        key = 'NY Overlap';
      } else if (hours >= 14 && hours < 20) {
        key = 'London';
      } else if (hours >= 20 || hours < 4) {
        key = 'New York';
      }

      acc[key].trades += 1;
      if (t.result.toLowerCase() === 'win') acc[key].wins += 1;
      if (t.result.toLowerCase() === 'loss') acc[key].losses += 1;
      acc[key].pnl += (t.realized_pl || 0);
    });

    return Object.entries(acc).map(([session, data]) => ({
      session,
      hours: data.hours,
      trades: data.trades,
      wins: data.wins,
      losses: data.losses,
      winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0,
      pnl: data.pnl
    }));
  }, [closedTrades]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-white p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#262626]">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-[#262626]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-black uppercase tracking-wider text-white">
                MODUL F: ANALYTICS / WEEKLY PERFORMANCE REVIEW
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141414] text-[#FF3333] border border-[#FF3333]/30 font-bold">
                WEEKEND EVALUATION
              </span>
            </div>
            <p className="text-xs text-[#A3A3A3] mt-0.5 font-mono">
              Evaluasi ritme mingguan, matriks konsistensi 30 hari, serta performa per sesi pasar
            </p>
          </div>

          {/* Week Selector Toggle: Minggu Ini vs. Minggu Lalu */}
          <div className="flex items-center bg-[#141414] p-1 rounded-lg border border-[#262626] text-xs font-mono">
            <button
              onClick={() => setSelectedWeek('current')}
              className={cn(
                "px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer",
                selectedWeek === 'current'
                  ? "bg-[#FF3333] text-white shadow-xs"
                  : "text-[#A3A3A3] hover:text-white"
              )}
            >
              Minggu Ini ({format(currentWeekStart, 'dd/MM')})
            </button>
            <button
              onClick={() => setSelectedWeek('previous')}
              className={cn(
                "px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer",
                selectedWeek === 'previous'
                  ? "bg-[#FF3333] text-white shadow-xs"
                  : "text-[#A3A3A3] hover:text-white"
              )}
            >
              Minggu Lalu ({format(prevWeekStart, 'dd/MM')})
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 1. TOP KPI CARDS (2x2 Grid Desktop)                     */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Net P/L Mingguan */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626] mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-bold">
                Net P/L Mingguan
              </span>
              <DollarSign size={14} className="text-[#A3A3A3]" />
            </div>
            <div>
              {/* Profit in Pure Clean White (#FFFFFF), Loss in Red */}
              <div className={cn(
                "text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums",
                weekKPI.netPL < 0 ? "text-[#FF3333]" : "text-white"
              )}>
                {weekKPI.netPL >= 0 ? '+' : ''}{formatCurrency(weekKPI.netPL, user?.currency)}
              </div>
              <div className="text-[11px] font-mono text-[#A3A3A3] mt-2">
                Periode: {format(activeStart, 'dd MMM')} – {format(activeEnd, 'dd MMM')}
              </div>
            </div>
          </div>

          {/* Card 2: Win Rate Mingguan */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626] mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-bold">
                Win Rate Mingguan
              </span>
              <Percent size={14} className="text-[#A3A3A3]" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white tabular-nums">
                {weekKPI.total > 0 ? `${weekKPI.winRate}%` : '--'}
              </div>
              <div className="text-[11px] font-mono text-[#A3A3A3] mt-2">
                {weekKPI.wins} Menang · {weekKPI.losses} Kalah
              </div>
            </div>
          </div>

          {/* Card 3: Profit Factor */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626] mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-bold">
                Profit Factor
              </span>
              <Flame size={14} className="text-[#FF3333]" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white tabular-nums">
                {weekKPI.profitFactor}
              </div>
              <div className="text-[11px] font-mono text-[#A3A3A3] mt-2">
                Gross Profit: <strong className="text-white">{formatCurrency(weekKPI.grossProfit, user?.currency)}</strong>
              </div>
            </div>
          </div>

          {/* Card 4: Total Closed Trades */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626] mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-bold">
                Total Closed Trades
              </span>
              <Activity size={14} className="text-[#A3A3A3]" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white tabular-nums">
                {weekKPI.total} <span className="text-sm font-normal text-[#A3A3A3]">tickets</span>
              </div>
              <div className="text-[11px] font-mono text-[#A3A3A3] mt-2">
                Akumulasi: <strong className="text-white">{weekKPI.totalPips >= 0 ? '+' : ''}{weekKPI.totalPips.toFixed(1)} Pips</strong>
              </div>
            </div>
          </div>

        </div>

        {/* ======================================================== */}
        {/* 2. RHYTHM & TRADING DAYS (Best Day & Worst Day)         */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Best Day (Rabu, Profit Putih) */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1C1C1C] border border-[#333333] flex items-center justify-center text-white shrink-0">
                <Award size={18} />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#A3A3A3] font-bold block">
                  BEST TRADING DAY
                </span>
                <span className="text-base font-bold font-mono text-white">
                  {rhythmDays.bestDay ? `${rhythmDays.bestDay.dayName} (${rhythmDays.bestDay.dateStr})` : 'Belum Ada Data'}
                </span>
                {rhythmDays.bestDay && (
                  <span className="text-[11px] font-mono text-[#A3A3A3] block mt-0.5">
                    {rhythmDays.bestDay.count} trade · WR: {rhythmDays.bestDay.winRate}%
                  </span>
                )}
              </div>
            </div>

            {rhythmDays.bestDay && (
              <div className="text-right font-mono">
                <span className="text-lg font-black text-white tabular-nums block">
                  +{formatCurrency(rhythmDays.bestDay.pnl, user?.currency)}
                </span>
                <span className="text-[10px] text-white/80 font-bold uppercase">
                  Top Performance
                </span>
              </div>
            )}
          </div>

          {/* Worst Day (Kamis, Minus Merah) */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#201010] border border-[#FF3333]/40 flex items-center justify-center text-[#FF3333] shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#FF3333] font-bold block">
                  WORST TRADING DAY
                </span>
                <span className="text-base font-bold font-mono text-white">
                  {rhythmDays.worstDay ? `${rhythmDays.worstDay.dayName} (${rhythmDays.worstDay.dateStr})` : 'Tidak Ada Hari Minus'}
                </span>
                {rhythmDays.worstDay && (
                  <span className="text-[11px] font-mono text-[#A3A3A3] block mt-0.5">
                    {rhythmDays.worstDay.count} trade · WR: {rhythmDays.worstDay.winRate}%
                  </span>
                )}
              </div>
            </div>

            {rhythmDays.worstDay && (
              <div className="text-right font-mono">
                <span className="text-lg font-black text-[#FF3333] tabular-nums block">
                  {formatCurrency(rhythmDays.worstDay.pnl, user?.currency)}
                </span>
                <span className="text-[10px] text-[#FF3333] font-bold uppercase">
                  Drawdown Peak
                </span>
              </div>
            )}
          </div>

        </div>

        {/* ======================================================== */}
        {/* 3. CONSISTENCY & WIN RATE MATRIX (30-DAY GRADATION)     */}
        {/* ======================================================== */}
        <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-mono font-black uppercase tracking-wider text-white">
                30-Day Execution Consistency &amp; Win Rate Matrix
              </h3>
              
              {/* Info Tooltip */}
              <div className="relative">
                <button
                  onClick={() => setShowMatrixLegend(!showMatrixLegend)}
                  className="p-1 rounded text-[#A3A3A3] hover:text-white cursor-pointer"
                >
                  <Info size={13} />
                </button>
                {showMatrixLegend && (
                  <div className="absolute left-0 top-6 z-30 w-52 p-2.5 rounded-lg bg-[#0D0D0D] border border-[#333333] shadow-xl text-[11px] font-mono space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-white"></span>
                      <span className="text-white">Win Rate Tinggi (Profit)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-[#FF3333]"></span>
                      <span className="text-[#FF3333]">Loss Day</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-[#2D2D2D]"></span>
                      <span className="text-[#A3A3A3]">Break Even</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-[#101010] border border-[#222222]"></span>
                      <span className="text-[#555555]">No Trade</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <span className="text-xs font-mono text-[#A3A3A3]">
              Gradasi Putih ke Merah (Tanpa Hijau)
            </span>
          </div>

          {/* Matrix Grid */}
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-2.5">
            {matrixDays.map((day, idx) => {
              const isWin = day.status === 'win';
              const isLoss = day.status === 'loss';
              const isBE = day.status === 'be';

              return (
                <div
                  key={idx}
                  className={cn(
                    "aspect-square rounded-lg p-1.5 flex flex-col justify-between text-center font-mono transition-all cursor-default relative group",
                    isWin 
                      ? "bg-white text-black font-black shadow-[0_0_10px_rgba(255,255,255,0.3)]" 
                      : isLoss 
                      ? "bg-[#FF3333] text-white font-bold shadow-[0_0_10px_rgba(255,51,51,0.3)]"
                      : isBE
                      ? "bg-[#2D2D2D] text-white"
                      : "bg-[#101010] border border-[#222222] text-[#555555]"
                  )}
                  title={`${day.displayDate}: ${day.tradesCount} trades (${day.dayPL >= 0 ? '+' : ''}${formatCurrency(day.dayPL, user?.currency)})`}
                >
                  <span className="text-[10px] font-bold leading-none">
                    {day.displayDate.split(' ')[0]}
                  </span>
                  <span className="text-[9px] font-extrabold leading-none">
                    {isWin ? '✓' : isLoss ? '✕' : isBE ? '—' : '·'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ======================================================== */}
        {/* 4. BOTTOM PERFORMANCE TABLES (Weekday & Market Session) */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* Table 1: Performance by Weekday (Senin–Jumat) */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#262626]">
              <h4 className="text-xs font-mono font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Calendar size={13} className="text-[#FF3333]" />
                Performance by Weekday (Senin–Jumat)
              </h4>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#262626] bg-[#0D0D0D]">
              <table className="w-full text-left font-mono text-xs tabular-nums">
                <thead className="bg-[#141414] text-[#A3A3A3] text-[10px] uppercase border-b border-[#262626]">
                  <tr>
                    <th className="px-3.5 py-2.5">Hari</th>
                    <th className="px-3.5 py-2.5 text-center">Trades</th>
                    <th className="px-3.5 py-2.5 text-center">Win Rate</th>
                    <th className="px-3.5 py-2.5 text-right">Net Realized P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262626]">
                  {weekdayStats.map(item => {
                    const isPositive = item.pnl > 0;
                    const isNegative = item.pnl < 0;
                    return (
                      <tr key={item.day} className="hover:bg-[#141414] transition-colors">
                        <td className="px-3.5 py-2.5 font-bold text-white">
                          {item.day}
                        </td>
                        <td className="px-3.5 py-2.5 text-center text-[#A3A3A3]">
                          {item.trades} ({item.wins}W · {item.losses}L)
                        </td>
                        <td className="px-3.5 py-2.5 text-center text-white font-bold">
                          {item.trades > 0 ? `${item.winRate}%` : '--'}
                        </td>
                        <td className={cn(
                          "px-3.5 py-2.5 text-right font-extrabold",
                          isNegative ? "text-[#FF3333]" : "text-white"
                        )}>
                          {item.pnl !== 0 ? `${item.pnl > 0 ? '+' : ''}${formatCurrency(item.pnl, user?.currency)}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Performance by Market Session */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#262626]">
              <h4 className="text-xs font-mono font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Clock size={13} className="text-[#FF3333]" />
                Performance by Market Session
              </h4>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#262626] bg-[#0D0D0D]">
              <table className="w-full text-left font-mono text-xs tabular-nums">
                <thead className="bg-[#141414] text-[#A3A3A3] text-[10px] uppercase border-b border-[#262626]">
                  <tr>
                    <th className="px-3.5 py-2.5">Sesi Pasar</th>
                    <th className="px-3.5 py-2.5">Jam WIB</th>
                    <th className="px-3.5 py-2.5 text-center">WR</th>
                    <th className="px-3.5 py-2.5 text-right">Net P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262626]">
                  {sessionPerformance.map(item => {
                    const isNegative = item.pnl < 0;
                    return (
                      <tr key={item.session} className="hover:bg-[#141414] transition-colors">
                        <td className="px-3.5 py-2.5 font-bold text-white">
                          {item.session}
                        </td>
                        <td className="px-3.5 py-2.5 text-[#A3A3A3] text-[11px]">
                          {item.hours}
                        </td>
                        <td className="px-3.5 py-2.5 text-center text-white font-bold">
                          {item.trades > 0 ? `${item.winRate}%` : '--'}
                        </td>
                        <td className={cn(
                          "px-3.5 py-2.5 text-right font-extrabold",
                          isNegative ? "text-[#FF3333]" : "text-white"
                        )}>
                          {item.pnl !== 0 ? `${item.pnl > 0 ? '+' : ''}${formatCurrency(item.pnl, user?.currency)}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
