import React, { useMemo, useState, useEffect } from 'react';
import { Trade, User } from '../types';
import { cn } from '../lib/utils';
import { 
  format, 
  subDays, 
  startOfDay, 
  endOfDay,
  isSameDay, 
  startOfWeek, 
  endOfWeek, 
  subWeeks 
} from 'date-fns';
import { formatCurrency, safeParseDate } from '../utils';
import { 
  Calendar, 
  DollarSign, 
  Percent, 
  Award, 
  AlertTriangle,
  Flame,
  Clock,
  Info,
  Shield,
  Sliders,
  CheckCircle2,
  ChevronDown,
  Layers,
  TrendingDown,
  Image as ImageIcon,
  ExternalLink,
  X
} from 'lucide-react';

interface AnalyticsViewProps {
  trades: Trade[];
  user?: User | null;
  startingBalance: number;
  currentEquity: number;
  onOpenGallery?: () => void;
  onOpenHistory?: () => void;
  onUserUpdate?: () => void;
}

export default function AnalyticsView({
  trades,
  user,
  startingBalance,
  currentEquity,
  onOpenGallery,
  onOpenHistory,
  onUserUpdate
}: AnalyticsViewProps) {
  // Primary Timeframe Dropdown: 'daily' (Harian) or 'weekly' (Mingguan)
  const [timeframeMode, setTimeframeMode] = useState<'daily' | 'weekly'>(
    user?.analytics_timeframe === 'daily' ? 'daily' : 'weekly'
  );

  // Sub-filters
  const [selectedWeek, setSelectedWeek] = useState<'current' | 'previous'>('current');
  const [selectedDayType, setSelectedDayType] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDateStr, setCustomDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Modals & UI states
  const [showMatrixLegend, setShowMatrixLegend] = useState<boolean>(false);
  const [showDDSettingsModal, setShowDDSettingsModal] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form states for DD Settings Modal
  const [inputDailyDD, setInputDailyDD] = useState<number>(user?.prop_firm_daily_dd || 5.0);
  const [inputWeeklyDD, setInputWeeklyDD] = useState<number>(user?.prop_firm_max_dd || user?.weekly_dd || 10.0);
  const [isSavingDD, setIsSavingDD] = useState<boolean>(false);

  // Sync internal state if user prop changes
  useEffect(() => {
    if (user?.analytics_timeframe && user.analytics_timeframe !== timeframeMode) {
      setTimeframeMode(user.analytics_timeframe);
    }
  }, [user?.analytics_timeframe]);

  useEffect(() => {
    if (user?.prop_firm_daily_dd) setInputDailyDD(Number(user.prop_firm_daily_dd));
    if (user?.prop_firm_max_dd) setInputWeeklyDD(Number(user.prop_firm_max_dd));
  }, [user?.prop_firm_daily_dd, user?.prop_firm_max_dd]);

  // Handle switching dropdown mode & persist to server
  const handleTimeframeChange = async (newMode: 'daily' | 'weekly') => {
    setTimeframeMode(newMode);
    setSyncStatus('Menyimpan ke bot & web...');
    try {
      const res = await fetch('/api/user/analytics-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics_timeframe: newMode })
      });
      if (res.ok) {
        setSyncStatus(`Tersinkron: ${newMode === 'daily' ? 'Harian' : 'Weekly'}`);
        onUserUpdate?.();
      } else {
        setSyncStatus(null);
      }
    } catch {
      setSyncStatus(null);
    }
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // Save DD Settings to server
  const handleSaveDDSettings = async (dDD?: number, wDD?: number) => {
    const dailyVal = dDD !== undefined ? dDD : inputDailyDD;
    const weeklyVal = wDD !== undefined ? wDD : inputWeeklyDD;
    setIsSavingDD(true);
    try {
      const res = await fetch('/api/user/analytics-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prop_firm_daily_dd: dailyVal,
          prop_firm_max_dd: weeklyVal,
          weekly_dd: weeklyVal,
          analytics_timeframe: timeframeMode
        })
      });
      if (res.ok) {
        setShowDDSettingsModal(false);
        setSyncStatus('Batas Drawdown tersimpan!');
        onUserUpdate?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingDD(false);
      setTimeout(() => setSyncStatus(null), 3500);
    }
  };

  // Closed trades sorted chronologically
  const closedTrades = useMemo(() => {
    return trades
      .filter(t => t.result && t.result.toLowerCase() !== 'pending')
      .sort((a, b) => safeParseDate(a.created_at).getTime() - safeParseDate(b.created_at).getTime());
  }, [trades]);

  const now = new Date();

  // ========================================================
  // 1. DATE BOUNDARIES: WEEKLY
  // ========================================================
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const prevWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  const activeWeekStart = selectedWeek === 'current' ? currentWeekStart : prevWeekStart;
  const activeWeekEnd = selectedWeek === 'current' ? currentWeekEnd : prevWeekEnd;

  // Filter trades for active week
  const weekTrades = useMemo(() => {
    const startTime = activeWeekStart.getTime();
    const endTime = activeWeekEnd.getTime();
    return closedTrades.filter(t => {
      const time = safeParseDate(t.created_at).getTime();
      return time >= startTime && time <= endTime;
    });
  }, [closedTrades, activeWeekStart, activeWeekEnd]);

  // Top KPI Metrics for Active Week
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

  // ========================================================
  // 2. DATE BOUNDARIES: DAILY
  // ========================================================
  const activeDayDate = useMemo(() => {
    if (selectedDayType === 'today') return startOfDay(now);
    if (selectedDayType === 'yesterday') return startOfDay(subDays(now, 1));
    const parsed = new Date(customDateStr);
    return isNaN(parsed.getTime()) ? startOfDay(now) : startOfDay(parsed);
  }, [selectedDayType, customDateStr]);

  const activeDayStart = useMemo(() => startOfDay(activeDayDate), [activeDayDate]);
  const activeDayEnd = useMemo(() => endOfDay(activeDayDate), [activeDayDate]);

  // Filter trades for active day
  const dayTrades = useMemo(() => {
    const startTime = activeDayStart.getTime();
    const endTime = activeDayEnd.getTime();
    return closedTrades.filter(t => {
      const time = safeParseDate(t.created_at).getTime();
      return time >= startTime && time <= endTime;
    });
  }, [closedTrades, activeDayStart, activeDayEnd]);

  // Top KPI Metrics for Active Day
  const dayKPI = useMemo(() => {
    const total = dayTrades.length;
    const wins = dayTrades.filter(t => t.result.toLowerCase() === 'win').length;
    const losses = dayTrades.filter(t => t.result.toLowerCase() === 'loss').length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    let grossProfit = 0;
    let grossLoss = 0;
    let totalPips = 0;

    dayTrades.forEach(t => {
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
  }, [dayTrades]);

  // ========================================================
  // 3. DRAWDOWN (DD) CALCULATIONS: DAILY & WEEKLY
  // ========================================================
  const baseBal = Math.max(100, startingBalance || 1000);
  const dailyDDPct = user?.prop_firm_daily_dd ? Number(user?.prop_firm_daily_dd) : 5.0;
  const weeklyDDPct = user?.prop_firm_max_dd ? Number(user?.prop_firm_max_dd) : (user?.weekly_dd ? Number(user?.weekly_dd) : 10.0);

  // Daily DD values
  const dailyMaxLoss = Math.max(25, (baseBal * dailyDDPct) / 100);
  const currentDayLoss = dayKPI.grossLoss;
  const dailyDDRemaining = Math.max(0, dailyMaxLoss - currentDayLoss);
  const dailyDDUsedPct = dailyMaxLoss > 0 ? Math.min(100, (currentDayLoss / dailyMaxLoss) * 100) : 0;

  // Weekly DD values
  const weeklyMaxLoss = Math.max(50, (baseBal * weeklyDDPct) / 100);
  const currentWeekLoss = weekKPI.grossLoss;
  const weeklyDDRemaining = Math.max(0, weeklyMaxLoss - currentWeekLoss);
  const weeklyDDUsedPct = weeklyMaxLoss > 0 ? Math.min(100, (currentWeekLoss / weeklyMaxLoss) * 100) : 0;

  // Active view DD
  const activeDD = timeframeMode === 'daily'
    ? {
        label: 'Daily Drawdown (DD Harian)',
        limitPct: dailyDDPct,
        maxLoss: dailyMaxLoss,
        usedLoss: currentDayLoss,
        remaining: dailyDDRemaining,
        usedPct: dailyDDUsedPct
      }
    : {
        label: 'Weekly Drawdown (DD Mingguan)',
        limitPct: weeklyDDPct,
        maxLoss: weeklyMaxLoss,
        usedLoss: currentWeekLoss,
        remaining: weeklyDDRemaining,
        usedPct: weeklyDDUsedPct
      };

  // ========================================================
  // 4. RHYTHM DAYS (BEST & WORST DAY OF WEEK)
  // ========================================================
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

  // ========================================================
  // 5. 30-DAY CONSISTENCY MATRIX
  // ========================================================
  const matrixDays = useMemo(() => {
    const todayDate = startOfDay(new Date());
    const days = [];

    for (let i = 29; i >= 0; i--) {
      const d = subDays(todayDate, i);
      const dayT = closedTrades.filter(t => {
        const tDate = startOfDay(safeParseDate(t.created_at));
        return isSameDay(tDate, d);
      });

      let dayPL = 0;
      let dayWins = 0;
      let dayLosses = 0;
      let status: 'win' | 'loss' | 'be' | 'empty' = 'empty';

      if (dayT.length > 0) {
        dayWins = dayT.filter(t => t.result.toLowerCase() === 'win').length;
        dayLosses = dayT.filter(t => t.result.toLowerCase() === 'loss').length;
        dayPL = dayT.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
        if (dayPL > 0) status = 'win';
        else if (dayPL < 0) status = 'loss';
        else status = 'be';
      }

      const wr = dayT.length > 0 ? dayWins / dayT.length : -1;
      days.push({
        date: d,
        displayDate: format(d, 'dd MMM'),
        tradesCount: dayT.length,
        dayPL,
        wr,
        wins: dayWins,
        losses: dayLosses,
        status
      });
    }
    return days;
  }, [closedTrades]);

  // ========================================================
  // 6. WEEKDAY STATS (SENIN - JUMAT)
  // ========================================================
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

  // ========================================================
  // 7. SESSION PERFORMANCE (HARIAN / MINGGUAN)
  // ========================================================
  const targetTradesForSession = timeframeMode === 'daily' ? dayTrades : closedTrades;
  const sessionPerformance = useMemo(() => {
    const acc: Record<string, { hours: string; trades: number; wins: number; losses: number; pnl: number }> = {
      'Asian': { hours: '06:00 - 14:00 WIB', trades: 0, wins: 0, losses: 0, pnl: 0 },
      'London': { hours: '14:00 - 20:00 WIB', trades: 0, wins: 0, losses: 0, pnl: 0 },
      'NY Overlap': { hours: '19:00 - 23:00 WIB', trades: 0, wins: 0, losses: 0, pnl: 0 },
      'New York': { hours: '20:00 - 04:00 WIB', trades: 0, wins: 0, losses: 0, pnl: 0 }
    };

    targetTradesForSession.forEach(t => {
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
  }, [targetTradesForSession]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-white p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#262626]">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ======================================================== */}
        {/* PAGE HEADER & TIMEFRAME DROPDOWN SELECTOR                */}
        {/* ======================================================== */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-[#262626]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-mono font-black uppercase tracking-wider text-white">
                MODUL F: ANALYTICS &amp; PERFORMANCE EVALUATION
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141414] text-[#FF3333] border border-[#FF3333]/30 font-bold uppercase">
                {timeframeMode === 'daily' ? 'EVALUASI HARIAN' : 'EVALUASI MINGGUAN'}
              </span>
              {syncStatus && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  {syncStatus}
                </span>
              )}
            </div>
            <p className="text-xs text-[#A3A3A3] mt-0.5 font-mono">
              Analisis performa, rasio win rate, evaluasi sesi pasar &amp; batas Drawdown (DD) tersinkron dengan Telegram Bot
            </p>
          </div>

          {/* Controls: Dropdown Harian vs Weekly & Sub-Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. Main Timeframe Dropdown (Harian vs Weekly) */}
            <div className="relative flex items-center bg-[#141414] rounded-lg border border-[#262626] p-1 text-xs font-mono">
              <div className="flex items-center gap-1.5 px-2 text-[#A3A3A3]">
                <Calendar size={13} className="text-[#FF3333]" />
                <span className="text-[11px] font-bold">Mode:</span>
              </div>
              <select
                value={timeframeMode}
                onChange={(e) => handleTimeframeChange(e.target.value as 'daily' | 'weekly')}
                aria-label="Pilih Mode Dropdown Analytics"
                className="bg-[#1C1C1C] text-white font-bold text-xs rounded-md px-2.5 py-1.5 border border-[#333333] cursor-pointer focus:outline-hidden focus:border-[#FF3333]"
              >
                <option value="daily">📅 Harian (Daily)</option>
                <option value="weekly">📆 Mingguan (Weekly)</option>
              </select>
            </div>

            {/* 2. Sub-Filter Pills */}
            {timeframeMode === 'weekly' ? (
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
                  Minggu Ini
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
                  Minggu Lalu
                </button>
              </div>
            ) : (
              <div className="flex items-center bg-[#141414] p-1 rounded-lg border border-[#262626] text-xs font-mono gap-1">
                <button
                  onClick={() => setSelectedDayType('today')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md font-bold transition-all cursor-pointer",
                    selectedDayType === 'today'
                      ? "bg-[#FF3333] text-white shadow-xs"
                      : "text-[#A3A3A3] hover:text-white"
                  )}
                >
                  Hari Ini
                </button>
                <button
                  onClick={() => setSelectedDayType('yesterday')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md font-bold transition-all cursor-pointer",
                    selectedDayType === 'yesterday'
                      ? "bg-[#FF3333] text-white shadow-xs"
                      : "text-[#A3A3A3] hover:text-white"
                  )}
                >
                  Kemarin
                </button>
                <input
                  type="date"
                  value={customDateStr}
                  onChange={(e) => {
                    setCustomDateStr(e.target.value);
                    setSelectedDayType('custom');
                  }}
                  aria-label="Pilih Tanggal Tertentu"
                  className={cn(
                    "px-2 py-1 bg-[#1C1C1C] border text-xs font-mono rounded cursor-pointer",
                    selectedDayType === 'custom'
                      ? "border-[#FF3333] text-white font-bold"
                      : "border-[#333333] text-[#A3A3A3]"
                  )}
                />
              </div>
            )}

            {/* 3. Atur Batas Drawdown (DD) Button */}
            <button
              onClick={() => setShowDDSettingsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1C1C1C] text-white border border-[#262626] hover:border-[#444444] rounded-lg text-xs font-mono font-bold transition-all cursor-pointer"
            >
              <Shield size={13} className="text-[#FF3333]" />
              <span>Atur DD</span>
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* TELEGRAM BOT SYNC NOTIFICATION BANNER                   */}
        {/* ======================================================== */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[#A3A3A3]">
              Tersinkron dengan Telegram: Ketik <code className="text-white bg-[#1F1F1F] px-1.5 py-0.5 rounded border border-[#333333]">/analytic</code> untuk melihat report, atau <code className="text-white bg-[#1F1F1F] px-1.5 py-0.5 rounded border border-[#333333]">/setdd [persen]</code> untuk set Drawdown.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-[#777777]">Mode Aktif:</span>
            <span className="px-2 py-0.5 rounded bg-[#1F1F1F] border border-[#333333] text-white font-bold text-[11px]">
              {timeframeMode === 'daily' ? '📅 Harian' : '📆 Weekly'}
            </span>
            <span className="px-2 py-0.5 rounded bg-[#1F1F1F] border border-[#333333] text-[#FF3333] font-bold text-[11px]">
              DD: {dailyDDPct}% / {weeklyDDPct}%
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 1. TOP KPI CARDS (4-Column Layout)                       */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Net P/L (Harian / Mingguan) */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626] mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-bold">
                {timeframeMode === 'daily' ? 'Net P/L Harian' : 'Net P/L Mingguan'}
              </span>
              <DollarSign size={14} className="text-[#A3A3A3]" />
            </div>
            <div>
              <div className={cn(
                "text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums",
                (timeframeMode === 'daily' ? dayKPI.netPL : weekKPI.netPL) < 0 ? "text-[#FF3333]" : "text-white"
              )}>
                {(timeframeMode === 'daily' ? dayKPI.netPL : weekKPI.netPL) >= 0 ? '+' : ''}
                {formatCurrency(timeframeMode === 'daily' ? dayKPI.netPL : weekKPI.netPL, user?.currency)}
              </div>
              <div className="text-[11px] font-mono text-[#A3A3A3] mt-2 flex items-center gap-1">
                <span>Kalender:</span>
                <strong className="text-white">
                  {timeframeMode === 'daily' 
                    ? format(activeDayStart, 'dd MMMM yyyy')
                    : `${format(activeWeekStart, 'dd MMM')} – ${format(activeWeekEnd, 'dd MMM yyyy')}`}
                </strong>
              </div>
            </div>
          </div>

          {/* Card 2: Win Rate (Harian / Mingguan) */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626] mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-bold">
                {timeframeMode === 'daily' ? 'Win Rate Harian' : 'Win Rate Mingguan'}
              </span>
              <Percent size={14} className="text-[#A3A3A3]" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white tabular-nums">
                {(timeframeMode === 'daily' ? dayKPI.total : weekKPI.total) > 0 
                  ? `${timeframeMode === 'daily' ? dayKPI.winRate : weekKPI.winRate}%` 
                  : '0%'}
              </div>
              <div className="text-[11px] font-mono text-[#A3A3A3] mt-2">
                {(timeframeMode === 'daily' ? dayKPI.total : weekKPI.total) > 0 
                  ? `${timeframeMode === 'daily' ? dayKPI.wins : weekKPI.wins} Menang · ${timeframeMode === 'daily' ? dayKPI.losses : weekKPI.losses} Kalah` 
                  : '0 Menang · 0 Kalah (Data Bersih)'}
              </div>
            </div>
          </div>

          {/* Card 3: Drawdown (DD) Tracker */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626] mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-bold">
                {timeframeMode === 'daily' ? 'Drawdown Harian (DD)' : 'Weekly Drawdown (DD)'}
              </span>
              <Shield size={14} className="text-[#FF3333]" />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className={cn(
                  "text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums",
                  activeDD.usedLoss > 0 ? "text-[#FF3333]" : "text-white"
                )}>
                  {activeDD.usedLoss > 0 ? '-' : ''}{formatCurrency(activeDD.usedLoss, user?.currency)}
                </span>
                <span className="text-xs font-mono font-bold text-[#A3A3A3]">
                  Batas {activeDD.limitPct}%
                </span>
              </div>
              <div className="text-[11px] font-mono mt-2 flex items-center justify-between text-[#A3A3A3]">
                <span>Sisa Buffer Aman:</span>
                <strong className={cn(
                  "font-bold",
                  activeDD.remaining <= 0 ? "text-[#FF3333]" : "text-white"
                )}>
                  {formatCurrency(activeDD.remaining, user?.currency)}
                </strong>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#262626] rounded-full mt-2 overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-300",
                    activeDD.usedPct >= 100 ? "bg-[#FF3333]" : activeDD.usedPct >= 70 ? "bg-amber-400" : "bg-white"
                  )}
                  style={{ width: `${Math.min(100, activeDD.usedPct)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Profit Factor & Pips */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626] mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-bold">
                Profit Factor &amp; Pips
              </span>
              <Flame size={14} className="text-[#FF3333]" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white tabular-nums">
                {timeframeMode === 'daily' ? dayKPI.profitFactor : weekKPI.profitFactor}
              </div>
              <div className="text-[11px] font-mono text-[#A3A3A3] mt-2 flex items-center justify-between">
                <span>Total Pips:</span>
                <strong className="text-white">
                  {(timeframeMode === 'daily' ? dayKPI.totalPips : weekKPI.totalPips) >= 0 ? '+' : ''}
                  {timeframeMode === 'daily' ? dayKPI.totalPips : weekKPI.totalPips} Pips
                </strong>
              </div>
            </div>
          </div>

        </div>

        {/* ======================================================== */}
        {/* CONDITIONAL CONTENT: HARIAN (DAILY) VS WEEKLY            */}
        {/* ======================================================== */}
        {timeframeMode === 'daily' ? (
          /* ======================================================== */
          /* HARIAN VIEW: TRADES OF THE DAY & SESSION BREAKDOWN       */
          /* ======================================================== */
          <div className="space-y-6">
            
            {/* Daily Execution Trades Table */}
            <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 sm:p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
                <div>
                  <h3 className="text-xs font-mono font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <Calendar size={13} className="text-[#FF3333]" />
                    Daftar Trade Hari Ini: {format(activeDayStart, 'dd MMMM yyyy')}
                  </h3>
                  <p className="text-[11px] font-mono text-[#A3A3A3] mt-0.5">
                    Total {dayTrades.length} eksekusi posisi pada hari ini
                  </p>
                </div>
                {onOpenHistory && (
                  <button
                    onClick={onOpenHistory}
                    className="text-xs font-mono text-[#A3A3A3] hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Buka Riwayat Penuh</span>
                    <ExternalLink size={12} />
                  </button>
                )}
              </div>

              {dayTrades.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[#262626] rounded-xl font-mono space-y-2">
                  <div className="w-10 h-10 rounded-full bg-[#1C1C1C] flex items-center justify-center mx-auto text-[#A3A3A3]">
                    <Clock size={18} />
                  </div>
                  <p className="text-sm font-bold text-white">Belum Ada Trade Pada Tanggal Ini</p>
                  <p className="text-xs text-[#A3A3A3] max-w-sm mx-auto">
                    Anda belum mencatat trade closed pada tanggal {format(activeDayStart, 'dd MMM yyyy')}. Catat trade baru via menu atau Telegram bot.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#262626] bg-[#0D0D0D]">
                  <table className="w-full text-left font-mono text-xs tabular-nums">
                    <thead className="bg-[#141414] text-[#A3A3A3] text-[10px] uppercase border-b border-[#262626]">
                      <tr>
                        <th className="px-3.5 py-2.5">Jam / Waktu</th>
                        <th className="px-3.5 py-2.5">Pair / Arah</th>
                        <th className="px-3.5 py-2.5">Lot</th>
                        <th className="px-3.5 py-2.5">Entry / SL / TP</th>
                        <th className="px-3.5 py-2.5 text-center">Status</th>
                        <th className="px-3.5 py-2.5 text-right">Pips</th>
                        <th className="px-3.5 py-2.5 text-right">Net P/L</th>
                        <th className="px-3.5 py-2.5">Setup / Catatan</th>
                        <th className="px-3.5 py-2.5 text-center">Chart</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#262626]">
                      {dayTrades.map(t => {
                        const isWin = (t.result || '').toLowerCase() === 'win';
                        const isLoss = (t.result || '').toLowerCase() === 'loss';
                        const pl = t.realized_pl || 0;
                        const date = safeParseDate(t.created_at);

                        return (
                          <tr key={t.id} className="hover:bg-[#141414] transition-colors">
                            <td className="px-3.5 py-2.5 text-[#A3A3A3]">
                              {format(date, 'HH:mm:ss')} WIB
                            </td>
                            <td className="px-3.5 py-2.5 font-bold text-white flex items-center gap-1.5">
                              <span>{t.pair}</span>
                              <span className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                                (t.direction || '').toLowerCase() === 'buy'
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-[#FF3333]/10 text-[#FF3333] border border-[#FF3333]/20"
                              )}>
                                {t.direction}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-white">
                              {t.position_size || 0.01}
                            </td>
                            <td className="px-3.5 py-2.5 text-[#A3A3A3] text-[11px]">
                              {t.entry_price || '-'} | {t.sl || '-'} | {t.tp || '-'}
                            </td>
                            <td className="px-3.5 py-2.5 text-center">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-extrabold uppercase",
                                isWin 
                                  ? "bg-white text-black" 
                                  : isLoss 
                                  ? "bg-[#FF3333] text-white" 
                                  : "bg-[#2D2D2D] text-white"
                              )}>
                                {t.result}
                              </span>
                            </td>
                            <td className={cn(
                              "px-3.5 py-2.5 text-right font-bold",
                              (t.pips || 0) >= 0 ? "text-white" : "text-[#FF3333]"
                            )}>
                              {(t.pips || 0) >= 0 ? '+' : ''}{t.pips || 0}
                            </td>
                            <td className={cn(
                              "px-3.5 py-2.5 text-right font-black",
                              pl < 0 ? "text-[#FF3333]" : "text-white"
                            )}>
                              {pl >= 0 ? '+' : ''}{formatCurrency(pl, user?.currency)}
                            </td>
                            <td className="px-3.5 py-2.5 text-[#A3A3A3] max-w-xs truncate">
                              <strong className="text-white block">{t.setup_name || 'Setup Pribadi'}</strong>
                              <span className="text-[10px] text-[#777777]">{t.notes || '-'}</span>
                            </td>
                            <td className="px-3.5 py-2.5 text-center">
                              {t.image || t.image_url || t.image_before || t.image_after ? (
                                <button
                                  onClick={() => setPreviewImage(t.image || t.image_url || t.image_before || t.image_after || null)}
                                  className="p-1 rounded bg-[#1C1C1C] hover:bg-[#262626] text-[#A3A3A3] hover:text-white transition-colors cursor-pointer"
                                  title="Lihat Screenshot"
                                >
                                  <ImageIcon size={14} />
                                </button>
                              ) : (
                                <span className="text-[#444444]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Performance by Market Session for the Day */}
            <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#262626]">
                <h4 className="text-xs font-mono font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <Clock size={13} className="text-[#FF3333]" />
                  Performa Sesi Pasar (Hari Ini)
                </h4>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#262626] bg-[#0D0D0D]">
                <table className="w-full text-left font-mono text-xs tabular-nums">
                  <thead className="bg-[#141414] text-[#A3A3A3] text-[10px] uppercase border-b border-[#262626]">
                    <tr>
                      <th className="px-3.5 py-2.5">Sesi Pasar</th>
                      <th className="px-3.5 py-2.5">Jam WIB</th>
                      <th className="px-3.5 py-2.5 text-center">Trades</th>
                      <th className="px-3.5 py-2.5 text-center">Win Rate</th>
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
                          <td className="px-3.5 py-2.5 text-center text-white">
                            {item.trades}
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
        ) : (
          /* ======================================================== */
          /* WEEKLY VIEW: RHYTHM DAYS, MATRIX & STATS TABLES          */
          /* ======================================================== */
          <div className="space-y-6">

            {/* Rhythm Days (Best Day & Worst Day) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Best Day */}
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

              {/* Worst Day */}
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

            {/* Consistency & Win Rate Matrix (30-Day Gradation) */}
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

            {/* Performance Tables (Weekday & Market Session) */}
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
        )}

      </div>

      {/* ======================================================== */}
      {/* MODAL: PENGATURAN BATAS DRAWDOWN (DD)                    */}
      {/* ======================================================== */}
      {showDDSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#262626] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-[#FF3333]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Pengaturan Batas Drawdown (DD)
                </h3>
              </div>
              <button 
                onClick={() => setShowDDSettingsModal(false)}
                className="text-[#A3A3A3] hover:text-white p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[#A3A3A3] text-xs leading-relaxed">
              Atur persentase toleransi Drawdown akun Anda. Pengaturan ini akan tersinkronisasi otomatis dengan Telegram Bot (<code className="text-white">/setdd</code>).
            </p>

            <div className="space-y-4">
              {/* Daily DD Setting */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-white uppercase">
                  Daily Drawdown (Batas Harian) %
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="50"
                    value={inputDailyDD}
                    onChange={(e) => setInputDailyDD(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#1C1C1C] border border-[#333333] rounded-lg px-3 py-2 text-white font-bold text-sm focus:border-[#FF3333] focus:outline-hidden"
                  />
                  <span className="text-[#A3A3A3] font-bold">%</span>
                </div>
                <div className="flex gap-1.5 mt-1">
                  {[3, 4, 5, 8].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setInputDailyDD(preset)}
                      className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer",
                        inputDailyDD === preset
                          ? "bg-[#FF3333] text-white border-[#FF3333]"
                          : "bg-[#1C1C1C] text-[#A3A3A3] border-[#333333] hover:text-white"
                      )}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-[#777777] block mt-0.5">
                  Max Loss Harian: {formatCurrency((baseBal * inputDailyDD) / 100, user?.currency)}
                </span>
              </div>

              {/* Weekly / Max DD Setting */}
              <div className="space-y-1.5 pt-2 border-t border-[#262626]">
                <label className="text-[11px] font-bold text-white uppercase">
                  Weekly / Max Drawdown (Batas Mingguan) %
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="50"
                    value={inputWeeklyDD}
                    onChange={(e) => setInputWeeklyDD(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#1C1C1C] border border-[#333333] rounded-lg px-3 py-2 text-white font-bold text-sm focus:border-[#FF3333] focus:outline-hidden"
                  />
                  <span className="text-[#A3A3A3] font-bold">%</span>
                </div>
                <div className="flex gap-1.5 mt-1">
                  {[8, 10, 12, 15].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setInputWeeklyDD(preset)}
                      className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer",
                        inputWeeklyDD === preset
                          ? "bg-[#FF3333] text-white border-[#FF3333]"
                          : "bg-[#1C1C1C] text-[#A3A3A3] border-[#333333] hover:text-white"
                      )}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-[#777777] block mt-0.5">
                  Max Loss Mingguan: {formatCurrency((baseBal * inputWeeklyDD) / 100, user?.currency)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#262626]">
              <button
                type="button"
                onClick={() => setShowDDSettingsModal(false)}
                className="px-4 py-2 rounded-lg bg-[#1C1C1C] hover:bg-[#262626] text-[#A3A3A3] hover:text-white font-bold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingDD}
                onClick={() => handleSaveDDSettings()}
                className="px-4 py-2 rounded-lg bg-[#FF3333] hover:bg-[#e62e2e] text-white font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSavingDD ? 'Menyimpan...' : 'Simpan Batas DD'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: PREVIEW CHART IMAGE                               */}
      {/* ======================================================== */}
      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-[#141414] border border-[#262626] rounded-2xl overflow-hidden p-2">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X size={18} />
            </button>
            <img 
              src={previewImage} 
              alt="Chart Preview" 
              className="w-full h-auto max-h-[85vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}

    </div>
  );
}
