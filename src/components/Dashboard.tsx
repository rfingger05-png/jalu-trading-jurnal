import React, { useMemo, useState } from 'react';
import { Trade, User } from '../types';
import { cn } from '../lib/utils';
import { subDays, startOfDay, format } from 'date-fns';
import { formatCurrency, safeParseDate, safeFormatDate, authFetch } from '../utils';
import {
  TrendingDown,
  DollarSign,
  Percent,
  Scale,
  CalendarDays,
  ChevronRight,
  Info,
  X,
  Target,
  ExternalLink,
  Flame,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine
} from 'recharts';
import QuickLotDisplay from './QuickLotDisplay';

interface DashboardProps {
  trades: Trade[];
  user?: User | null;
  onOpenLogTrade?: () => void;
  onOpenCalculators?: () => void;
  onOpenHistory?: () => void;
  onOpenBanking?: () => void;
  currentEquity?: number;
  onUserUpdated?: (user: User) => void;
}

export default function Dashboard({
  trades,
  user,
  onOpenCalculators,
  onOpenHistory,
  currentEquity: propEquity,
  onUserUpdated
}: DashboardProps) {
  // Global Period Filter state
  const [selectedPeriod, setSelectedPeriod] = useState<'ALL' | '30D' | '7D' | 'TODAY'>('ALL');

  // Milestone Detail Modal state
  const [showMilestoneModal, setShowMilestoneModal] = useState<boolean>(false);
  const [editingTargetValue, setEditingTargetValue] = useState<string>('');
  const [isSavingTarget, setIsSavingTarget] = useState<boolean>(false);

  // Screenshot Preview Modal state
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Info Tooltip for Consistency Matrix
  const [showMatrixLegend, setShowMatrixLegend] = useState<boolean>(false);

  // Baseline starting balance reference
  const startingBalance = useMemo(() => {
    return user?.initial_balance ?? (trades.length > 0 ? trades[trades.length - 1].account_balance : 10000);
  }, [user?.initial_balance, trades]);

  const currentEquity = useMemo(() => {
    if (typeof propEquity === 'number') return propEquity;
    if (trades.length > 0) return trades[trades.length - 1].account_balance;
    return startingBalance;
  }, [propEquity, trades, startingBalance]);

  // Target Balance for Account Growth Phase
  const targetBalance = useMemo(() => {
    if (user?.target_balance && Number(user.target_balance) > 0) {
      return Number(user.target_balance);
    }
    return startingBalance > 0 ? Math.round(startingBalance * 1.2) : 10800;
  }, [user?.target_balance, startingBalance]);

  // Account Growth Phase Metrics
  const growthPhase = useMemo(() => {
    const needed = Math.max(0, targetBalance - startingBalance);
    const achieved = Math.max(0, currentEquity - startingBalance);
    let pct = 0;
    if (needed > 0) {
      pct = Math.min(100, Math.max(0, (achieved / needed) * 100));
    } else if (targetBalance > 0) {
      pct = Math.min(100, Math.max(0, (currentEquity / targetBalance) * 100));
    }
    const remaining = Math.max(0, targetBalance - currentEquity);
    const requiredReturn = currentEquity > 0 ? (remaining / currentEquity) * 100 : 0;

    return {
      phaseName: 'Phase 1: Capital Growth',
      percent: Math.round(pct),
      percentExact: Number(pct.toFixed(1)),
      targetBalance,
      remaining,
      requiredReturn: Number(requiredReturn.toFixed(1)),
      isCompleted: currentEquity >= targetBalance
    };
  }, [targetBalance, startingBalance, currentEquity]);

  // Closed trades sorted chronologically
  const completedTrades = useMemo(() => {
    return trades
      .filter(t => t.result && t.result.toLowerCase() !== 'pending')
      .sort((a, b) => safeParseDate(a.created_at).getTime() - safeParseDate(b.created_at).getTime());
  }, [trades]);

  // Synchronized trades filtered by active period
  const periodTrades = useMemo(() => {
    if (selectedPeriod === 'ALL') {
      return completedTrades;
    }

    const now = new Date();
    let cutoff: Date;

    if (selectedPeriod === 'TODAY') {
      cutoff = startOfDay(now);
    } else if (selectedPeriod === '7D') {
      cutoff = startOfDay(subDays(now, 7));
    } else {
      cutoff = startOfDay(subDays(now, 30));
    }

    const cutoffTime = cutoff.getTime();
    return completedTrades.filter(t => safeParseDate(t.created_at).getTime() >= cutoffTime);
  }, [completedTrades, selectedPeriod]);

  // Starting Equity for active period
  const periodBaseEquity = useMemo(() => {
    if (selectedPeriod === 'ALL') {
      return startingBalance;
    }
    const pnlInPeriod = periodTrades.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
    return currentEquity - pnlInPeriod;
  }, [selectedPeriod, startingBalance, periodTrades, currentEquity]);

  // 4 Core Metrics
  const coreMetrics = useMemo(() => {
    const totalTrades = periodTrades.length;
    const wins = periodTrades.filter(t => (t.result || '').toLowerCase() === 'win');
    const losses = periodTrades.filter(t => (t.result || '').toLowerCase() === 'loss');

    const totalWins = wins.length;
    const totalLosses = losses.length;

    // 1. Net Realized P/L
    const netRealizedPL = periodTrades.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
    const returnPercent = periodBaseEquity > 0 ? (netRealizedPL / periodBaseEquity) * 100 : 0;

    // 2. Win Rate
    const winRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0;

    // 3. Profit Factor
    const grossProfit = wins.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (t.realized_pl || 0), 0));
    const profitFactor = grossLoss > 0 
      ? Number((grossProfit / grossLoss).toFixed(2)) 
      : grossProfit > 0 ? 99.9 : 0;

    // 4. Total Pips & Avg R:R
    const totalPips = periodTrades.reduce((acc, t) => {
      const p = (t.pips !== null && t.pips !== undefined && !isNaN(Number(t.pips))) ? Number(t.pips) : 0;
      return acc + p;
    }, 0);

    const avgWin = totalWins > 0 ? grossProfit / totalWins : 0;
    const avgLoss = totalLosses > 0 ? grossLoss / totalLosses : 0;
    const avgRR = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : (avgWin > 0 ? 1.0 : 0);

    return {
      netRealizedPL,
      returnPercent,
      winRate,
      totalWins,
      totalLosses,
      totalTrades,
      profitFactor,
      grossProfit,
      grossLoss,
      totalPips: Math.round(totalPips),
      avgRR
    };
  }, [periodTrades, periodBaseEquity]);

  // Chart Data preparation (Clean line chart with short vertical height)
  const chartData = useMemo(() => {
    if (completedTrades.length === 0) {
      return [
        { date: 'Start', fullDate: 'Initial Balance', balance: startingBalance, tradePL: 0, pair: '-' },
        { date: 'Now', fullDate: 'Current Balance', balance: currentEquity, tradePL: 0, pair: '-' }
      ];
    }

    if (periodTrades.length === 0) {
      return [
        { date: 'Start', fullDate: 'Period Start', balance: currentEquity, tradePL: 0, pair: '-' },
        { date: 'Now', fullDate: 'Current Balance', balance: currentEquity, tradePL: 0, pair: '-' }
      ];
    }

    let running = periodBaseEquity;
    const initialPoint = {
      date: 'Start',
      fullDate: selectedPeriod === 'ALL' ? 'Starting Balance' : 'Period Open',
      balance: running,
      tradePL: 0,
      pair: '-'
    };

    const points = periodTrades.map(t => {
      running += (t.realized_pl || 0);
      const d = safeParseDate(t.created_at);
      return {
        date: safeFormatDate(d, 'dd MMM'),
        fullDate: safeFormatDate(d, 'dd MMM yyyy, HH:mm'),
        balance: running,
        tradePL: t.realized_pl || 0,
        pair: t.pair || 'XAUUSD',
        direction: t.direction || 'Buy',
        result: t.result || 'Win'
      };
    });

    return [initialPoint, ...points];
  }, [completedTrades, periodTrades, startingBalance, currentEquity, periodBaseEquity, selectedPeriod]);

  // 30-Day Consistency & Win Rate Matrix
  const consistencyMatrix = useMemo(() => {
    const now = new Date();
    const days: {
      dateStr: string;
      displayDate: string;
      tradesCount: number;
      pnl: number;
      status: 'win' | 'loss' | 'be' | 'empty';
    }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = subDays(now, i);
      const dateKey = format(d, 'yyyy-MM-dd');
      const displayDate = format(d, 'dd MMM');

      const dayTrades = completedTrades.filter(t => {
        try {
          return format(safeParseDate(t.created_at), 'yyyy-MM-dd') === dateKey;
        } catch {
          return false;
        }
      });

      const dayPnl = dayTrades.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
      let status: 'win' | 'loss' | 'be' | 'empty' = 'empty';
      if (dayTrades.length > 0) {
        if (dayPnl > 0) status = 'win';
        else if (dayPnl < 0) status = 'loss';
        else status = 'be';
      }

      days.push({
        dateStr: dateKey,
        displayDate,
        tradesCount: dayTrades.length,
        pnl: dayPnl,
        status
      });
    }

    const activeDays = days.filter(d => d.tradesCount > 0);
    const winDays = days.filter(d => d.status === 'win');
    const consistencyRate = activeDays.length > 0 
      ? Math.round((winDays.length / activeDays.length) * 100) 
      : 0;

    return {
      days,
      activeDaysCount: activeDays.length,
      winDaysCount: winDays.length,
      consistencyRate
    };
  }, [completedTrades]);

  // Recent 5 Trades (chronological descending)
  const recentTrades = useMemo(() => {
    return [...trades]
      .sort((a, b) => safeParseDate(b.created_at).getTime() - safeParseDate(a.created_at).getTime())
      .slice(0, 5);
  }, [trades]);

  const periodLabel = selectedPeriod === 'TODAY' 
    ? 'Today' 
    : selectedPeriod === '7D' 
    ? 'Past 7 Days' 
    : selectedPeriod === '30D' 
    ? 'Past 30 Days' 
    : 'All Time';

  // Handle Save Target in Milestone Modal
  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(editingTargetValue);
    if (isNaN(val) || val <= 0) return;

    try {
      setIsSavingTarget(true);
      const res = await authFetch('/api/auth/target-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_balance: val })
      });

      if (res.ok) {
        if (user && onUserUpdated) {
          onUserUpdated({ ...user, target_balance: val });
        }
        setShowMilestoneModal(false);
      }
    } catch (err) {
      console.error('Failed to save target goal:', err);
    } finally {
      setIsSavingTarget(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-white font-sans selection:bg-[#2D2D2D]">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* ======================================================== */}
        {/* Section A: Quick Trade Setup (Lot Calculator Mini-Bar)     */}
        {/* ======================================================== */}
        <QuickLotDisplay 
          currentEquity={currentEquity} 
          user={user} 
          onOpenCalculators={onOpenCalculators} 
        />

        {/* ======================================================== */}
        {/* Section B: Core Metrics Grid (4 Primary Cards: 1x4 or 2x2) */}
        {/* ======================================================== */}
        <div className="space-y-3">
          {/* Period Filter Bar */}
          <div className="flex items-center justify-between gap-3 bg-[#1A1A1A] px-3.5 py-2.5 rounded-lg border border-[#2D2D2D]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#A3A3A3] flex items-center gap-1.5">
                <CalendarDays size={13} className="text-[#FF3333]" />
                Range:
              </span>
              <span className="text-xs font-mono text-white font-bold">
                {periodLabel}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#121212] text-[#A3A3A3] border border-[#262626]">
                {periodTrades.length} trades
              </span>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center bg-[#121212] border border-[#262626] rounded-md p-0.5 text-xs font-mono">
              {(['TODAY', '7D', '30D', 'ALL'] as const).map(period => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={cn(
                    "px-2.5 sm:px-3 py-1 rounded transition-colors cursor-pointer",
                    selectedPeriod === period
                      ? "bg-[#2D2D2D] text-white font-bold shadow-xs border border-[#3D3D3D]"
                      : "text-[#A3A3A3] hover:text-white"
                  )}
                >
                  {period === 'TODAY' ? 'Today' : period === '7D' ? '7D' : period === '30D' ? '30D' : 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* 4 Primary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

            {/* Card 1: Net Realized P/L */}
            <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-4 sm:p-5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#262626] mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-semibold">
                    Net Realized P/L
                  </span>
                  <DollarSign size={13} className="text-[#A3A3A3]" />
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-white tabular-nums">
                  {coreMetrics.netRealizedPL >= 0 ? '+' : ''}{formatCurrency(coreMetrics.netRealizedPL, user?.currency)}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#A3A3A3]">Growth:</span>
                <span className={cn(
                  "font-bold tabular-nums",
                  coreMetrics.returnPercent < 0 ? "text-[#FF3333]" : "text-white"
                )}>
                  {coreMetrics.returnPercent >= 0 ? '+' : ''}{coreMetrics.returnPercent.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Card 2: Current Equity */}
            <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-4 sm:p-5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#262626] mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-semibold">
                    Current Equity
                  </span>
                  <Scale size={13} className="text-[#A3A3A3]" />
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-white tabular-nums">
                  {formatCurrency(currentEquity, user?.currency)}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono text-[#A3A3A3]">
                <span>Starting Bal:</span>
                <span className="text-white font-medium tabular-nums">
                  {formatCurrency(startingBalance, user?.currency)}
                </span>
              </div>
            </div>

            {/* Card 3: Win Rate */}
            <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-4 sm:p-5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#262626] mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-semibold">
                    Win Rate
                  </span>
                  <Percent size={13} className="text-[#A3A3A3]" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-white tabular-nums">
                    {coreMetrics.totalTrades > 0 ? `${coreMetrics.winRate}%` : '--'}
                  </span>
                  {coreMetrics.totalTrades > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#201010] text-[#FF3333] border border-[#FF3333]/30 font-bold">
                      {coreMetrics.totalWins}W
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#A3A3A3]">Win / Loss Ratio:</span>
                <span className="text-white font-medium">
                  {coreMetrics.totalWins}W · {coreMetrics.totalLosses}L
                </span>
              </div>
            </div>

            {/* Card 4: Total Pips / Avg R:R */}
            <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-4 sm:p-5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#262626] mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-semibold">
                    Total Pips / Avg R:R
                  </span>
                  <Flame size={13} className="text-[#FF3333]" />
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-white tabular-nums">
                  {coreMetrics.totalPips >= 0 ? '+' : ''}{coreMetrics.totalPips} <span className="text-xs text-[#A3A3A3] font-normal">pips</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono text-[#A3A3A3]">
                <span>Avg R:R:</span>
                <span className="text-[#FF3333] font-bold tabular-nums">
                  1:{coreMetrics.avgRR}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* ======================================================== */}
        {/* Section C: Account Growth Phase (Interactive Progress)   */}
        {/* ======================================================== */}
        <div 
          onClick={() => {
            setEditingTargetValue(String(growthPhase.targetBalance));
            setShowMilestoneModal(true);
          }}
          className="bg-[#1A1A1A] hover:bg-[#202020] border border-[#2D2D2D] hover:border-[#FF3333]/50 rounded-xl p-4 transition-all duration-200 cursor-pointer shadow-xs group"
          title="Klik untuk membuka detail target milestone & edit target"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FF3333] animate-pulse"></span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                Account Growth: {growthPhase.phaseName}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#201010] text-[#FF3333] border border-[#FF3333]/40 font-bold">
                {growthPhase.percent}% Reached
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-[#A3A3A3]">
              <span>Target: <strong className="text-white">{formatCurrency(growthPhase.targetBalance, user?.currency)}</strong></span>
              <span className="text-[#404040]">·</span>
              <span>Sisa: <strong className="text-[#FF3333]">{formatCurrency(growthPhase.remaining, user?.currency)}</strong></span>
              <span className="text-xs text-[#FF3333] font-bold group-hover:translate-x-0.5 transition-transform">
                &gt;
              </span>
            </div>
          </div>

          {/* Slim Progress Bar with Glowing Crimson Red Fill */}
          <div className="w-full bg-[#121212] h-2 rounded-full overflow-hidden border border-[#262626]">
            <div 
              className="bg-[#FF3333] h-full rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(255,51,51,0.6)]"
              style={{ width: `${Math.min(100, Math.max(2, growthPhase.percent))}%` }}
            ></div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* Section D: Main Analytics Section (2-Column PC Layout)   */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left Column: Account Equity Growth Chart */}
          <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D2D2D] mb-3">
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-white font-mono">
                  Account Equity Growth
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-[10px] text-[#A3A3A3]">
                  Start: {formatCurrency(startingBalance, user?.currency)}
                </span>
                <span className="text-[10px] text-white font-bold">
                  Now: {formatCurrency(currentEquity, user?.currency)}
                </span>
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityRedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF3333" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#FF3333" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    stroke="#555555" 
                    fontSize={10} 
                    fontFamily="monospace"
                    tickLine={false} 
                    axisLine={{ stroke: '#2D2D2D' }}
                    minTickGap={30}
                  />
                  <YAxis 
                    stroke="#555555" 
                    fontSize={10} 
                    fontFamily="monospace"
                    tickLine={false} 
                    axisLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => {
                      if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}k`;
                      return `$${val}`;
                    }}
                    width={55}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const hasPL = data.tradePL !== 0;
                        return (
                          <div className="bg-[#121212] border border-[#2D2D2D] p-3 rounded-lg shadow-xl text-xs font-mono space-y-1">
                            <div className="text-[10px] text-[#A3A3A3] pb-1 border-b border-[#262626]">
                              {data.fullDate || data.date}
                            </div>
                            <div className="flex items-baseline justify-between gap-4">
                              <span className="text-[#A3A3A3]">Equity:</span>
                              <span className="font-bold text-white tabular-nums">
                                {formatCurrency(data.balance, user?.currency)}
                              </span>
                            </div>
                            {hasPL && (
                              <div className="flex items-baseline justify-between gap-4 pt-1 border-t border-[#262626]">
                                <span className="text-[#A3A3A3]">{data.pair} ({data.direction}):</span>
                                <span className="font-bold text-white tabular-nums">
                                  {data.tradePL > 0 ? '+' : ''}{formatCurrency(data.tradePL, user?.currency)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine 
                    y={startingBalance} 
                    stroke="#555555" 
                    strokeDasharray="3 3" 
                    strokeWidth={1}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="balance" 
                    stroke="#FF3333" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#equityRedGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right Column: Consistency & Win Rate Matrix (30-Day Calendar) */}
          <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 shadow-xs flex flex-col justify-between relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D2D2D] mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-white font-mono">
                  Consistency &amp; Win Rate Matrix
                </h3>
                {/* Info Tooltip Icon concealing legends */}
                <div className="relative">
                  <button
                    onClick={() => setShowMatrixLegend(!showMatrixLegend)}
                    className="p-1 rounded text-[#A3A3A3] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer"
                    title="Keterangan Warna Matrix"
                  >
                    <Info size={13} />
                  </button>
                  {showMatrixLegend && (
                    <div className="absolute left-0 top-6 z-30 w-52 p-2.5 rounded-lg bg-[#121212] border border-[#333333] shadow-xl text-[11px] font-mono space-y-1.5 animate-in fade-in duration-150">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded bg-[#FFFFFF]"></span>
                        <span className="text-white">Profit Day (Win)</span>
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
                        <span className="w-3 h-3 rounded bg-[#141414] border border-[#282828]"></span>
                        <span className="text-[#737373]">No Trades</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-xs font-mono text-[#A3A3A3]">
                <span>30-Day Consistency: </span>
                <strong className="text-white">{consistencyMatrix.consistencyRate}%</strong>
              </div>
            </div>

            {/* 30-Day Grid */}
            <div className="grid grid-cols-6 sm:grid-cols-10 gap-2 my-auto py-2">
              {consistencyMatrix.days.map((day, idx) => {
                const isWin = day.status === 'win';
                const isLoss = day.status === 'loss';
                const isBE = day.status === 'be';

                return (
                  <div
                    key={day.dateStr}
                    className={cn(
                      "aspect-square rounded-md p-1 flex flex-col justify-between text-center transition-all cursor-default relative group",
                      isWin 
                        ? "bg-[#FFFFFF] text-black font-extrabold shadow-[0_0_8px_rgba(255,255,255,0.35)]" 
                        : isLoss 
                        ? "bg-[#FF3333] text-white font-bold shadow-[0_0_8px_rgba(255,51,51,0.35)]"
                        : isBE
                        ? "bg-[#2D2D2D] text-white"
                        : "bg-[#141414] border border-[#222222] text-[#444444]"
                    )}
                  >
                    <span className="text-[9px] font-mono leading-none font-bold">
                      {day.displayDate.split(' ')[0]}
                    </span>
                    <span className="text-[8px] font-mono leading-none opacity-80">
                      {isWin ? '✓' : isLoss ? '✕' : isBE ? '—' : '·'}
                    </span>

                    {/* Day Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-20 pointer-events-none whitespace-nowrap bg-[#121212] border border-[#333333] px-2 py-1 rounded text-[10px] font-mono shadow-xl text-white">
                      <div>{day.displayDate}</div>
                      <div>{day.tradesCount} trades · {day.pnl >= 0 ? '+' : ''}{formatCurrency(day.pnl, user?.currency)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Matrix Micro Footer */}
            <div className="flex items-center justify-between text-[11px] font-mono text-[#A3A3A3] pt-3 border-t border-[#262626] mt-2">
              <span>Active: <strong className="text-white">{consistencyMatrix.activeDaysCount} Days</strong></span>
              <span>Profit Days: <strong className="text-white">{consistencyMatrix.winDaysCount} Days</strong></span>
            </div>
          </div>

        </div>

        {/* ======================================================== */}
        {/* Section E: Recent Trade Activity (Last 5 Executed Trades) */}
        {/* ======================================================== */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#2D2D2D] mb-4">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white font-mono">
                Recent Trade Activity
              </h3>
              <p className="text-[11px] text-[#A3A3A3] mt-0.5">
                5 transaksi terakhir yang tercatat
              </p>
            </div>

            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                className="text-xs font-mono font-bold text-[#FF3333] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View Full History &gt;</span>
              </button>
            )}
          </div>

          {recentTrades.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#A3A3A3] font-mono">
              Belum ada transaksi tercatat. Catat trade melalui Telegram Bot atau gunakan menu + Log New Trade.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="bg-[#121212] uppercase text-[#A3A3A3] text-[10px] tracking-wider border-b border-[#2D2D2D]">
                  <tr>
                    <th className="px-3.5 py-2.5">Date / Time</th>
                    <th className="px-3.5 py-2.5">Pair</th>
                    <th className="px-3.5 py-2.5">Direction</th>
                    <th className="px-3.5 py-2.5">Lot</th>
                    <th className="px-3.5 py-2.5 text-right">Pips</th>
                    <th className="px-3.5 py-2.5 text-right">Realized P/L</th>
                    <th className="px-3.5 py-2.5 text-center">Outcome</th>
                    <th className="px-3.5 py-2.5 text-center">Chart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262626]">
                  {recentTrades.map(t => {
                    const isWin = (t.result || '').toLowerCase() === 'win';
                    const isLoss = (t.result || '').toLowerCase() === 'loss';
                    const isBuy = (t.direction || '').toLowerCase() === 'buy';
                    const hasImage = Boolean(t.image || t.image_url);

                    return (
                      <tr key={t.id} className="hover:bg-[#202020] transition-colors">
                        <td className="px-3.5 py-3 text-[#A3A3A3]">
                          {safeFormatDate(t.created_at, 'dd MMM, HH:mm')}
                        </td>
                        <td className="px-3.5 py-3 font-bold text-white">
                          {t.pair || 'XAUUSD'}
                        </td>
                        <td className="px-3.5 py-3">
                          <span className={cn(
                            "text-[10px] font-extrabold uppercase px-2 py-0.5 rounded tracking-wider",
                            isBuy
                              ? "bg-[#252525] text-white border border-[#3D3D3D]"
                              : "bg-[#2A1010] text-[#FF3333] border border-[#FF3333]/40"
                          )}>
                            {t.direction}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-white">
                          {t.position_size ? t.position_size.toFixed(2) : '--'}
                        </td>
                        <td className="px-3.5 py-3 text-right text-[#A3A3A3]">
                          {t.pips !== null && t.pips !== undefined && Number(t.pips) !== 0
                            ? `${Number(t.pips) > 0 ? '+' : ''}${Number(t.pips).toFixed(1)}p` 
                            : '-'}
                        </td>
                        <td className={cn(
                          "px-3.5 py-3 text-right font-extrabold tabular-nums",
                          isLoss ? "text-[#FF3333]" : "text-white"
                        )}>
                          {t.realized_pl !== null && t.realized_pl !== undefined 
                            ? `${t.realized_pl > 0 ? '+' : ''}${formatCurrency(t.realized_pl, user?.currency)}` 
                            : '-'}
                        </td>
                        <td className="px-3.5 py-3 text-center">
                          <span className={cn(
                            "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                            isWin 
                              ? "bg-[#222222] text-white border border-[#444444]" 
                              : isLoss 
                              ? "bg-[#2A1010] text-[#FF3333] border border-[#FF3333]/40" 
                              : "bg-[#262626] text-[#A3A3A3]"
                          )}>
                            {t.result || 'Pending'}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-center">
                          {hasImage ? (
                            <button
                              onClick={() => setPreviewImage(t.image || t.image_url || null)}
                              className="text-[10px] font-mono text-[#FF3333] hover:underline flex items-center gap-1 mx-auto cursor-pointer"
                              title="Lihat screenshot chart"
                            >
                              <ExternalLink size={12} />
                              <span>View</span>
                            </button>
                          ) : (
                            <span className="text-[#555555]">-</span>
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

      </div>

      {/* ======================================================== */}
      {/* Milestone Detail Modal (Triggered by Account Growth Card) */}
      {/* ======================================================== */}
      {showMilestoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-2xl w-full max-w-lg p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#2D2D2D]">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-[#FF3333]" />
                <h3 className="text-sm font-extrabold uppercase tracking-tight text-white font-mono">
                  Account Growth Milestone Detail
                </h3>
              </div>
              <button 
                onClick={() => setShowMilestoneModal(false)}
                className="text-[#A3A3A3] hover:text-white p-1 rounded hover:bg-[#252525] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-4 space-y-4 font-mono text-xs">
              {/* Progress Summary Card */}
              <div className="p-4 rounded-xl bg-[#121212] border border-[#262626] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#A3A3A3]">Phase:</span>
                  <span className="text-white font-bold">{growthPhase.phaseName}</span>
                </div>
                
                {/* Glowing Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#A3A3A3]">Progress:</span>
                    <span className="text-[#FF3333] font-bold">{growthPhase.percent}% Reached</span>
                  </div>
                  <div className="w-full bg-[#202020] h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#FF3333] h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(255,51,51,0.6)]"
                      style={{ width: `${Math.min(100, Math.max(2, growthPhase.percent))}%` }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#222222] text-[11px]">
                  <div>
                    <span className="text-[#A3A3A3]">Starting Balance:</span>
                    <div className="text-white font-bold">{formatCurrency(startingBalance, user?.currency)}</div>
                  </div>
                  <div>
                    <span className="text-[#A3A3A3]">Current Equity:</span>
                    <div className="text-white font-bold">{formatCurrency(currentEquity, user?.currency)}</div>
                  </div>
                  <div>
                    <span className="text-[#A3A3A3]">Target Balance:</span>
                    <div className="text-[#FF3333] font-bold">{formatCurrency(growthPhase.targetBalance, user?.currency)}</div>
                  </div>
                  <div>
                    <span className="text-[#A3A3A3]">Remaining Needed:</span>
                    <div className="text-white font-bold">{formatCurrency(growthPhase.remaining, user?.currency)}</div>
                  </div>
                </div>
              </div>

              {/* Edit Target Form */}
              <form onSubmit={handleSaveTarget} className="p-4 rounded-xl bg-[#121212] border border-[#262626] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Ubah Target Balance Akun</span>
                  <span className="text-[10px] text-[#A3A3A3]">Tersinkron ke Telegram &amp; Dashboard</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="100"
                    min="100"
                    required
                    value={editingTargetValue}
                    onChange={(e) => setEditingTargetValue(e.target.value)}
                    placeholder="Contoh: 15000"
                    className="flex-1 px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#333333] text-white text-sm font-bold focus:border-[#FF3333] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isSavingTarget}
                    className="px-4 py-2 rounded-lg bg-[#FF3333] hover:bg-[#E62E2E] text-white text-xs font-bold cursor-pointer transition-colors shrink-0 disabled:opacity-50"
                  >
                    {isSavingTarget ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px]">
                  <span className="text-[#737373]">Quick presets:</span>
                  {[1.1, 1.2, 1.5, 2.0].map(multiplier => {
                    const presetVal = Math.round(startingBalance * multiplier);
                    return (
                      <button
                        type="button"
                        key={multiplier}
                        onClick={() => setEditingTargetValue(String(presetVal))}
                        className="px-2 py-0.5 rounded bg-[#1A1A1A] hover:bg-[#252525] border border-[#333333] text-[#A3A3A3] hover:text-white cursor-pointer"
                      >
                        +{Math.round((multiplier - 1) * 100)}% ({formatCurrency(presetVal, user?.currency)})
                      </button>
                    );
                  })}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Chart Screenshot Preview Modal                            */}
      {/* ======================================================== */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-[#1A1A1A] p-2 rounded-xl border border-[#333333] shadow-2xl">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-[#FF3333] text-white flex items-center justify-center cursor-pointer shadow-lg hover:bg-[#E62E2E]"
            >
              <X size={16} />
            </button>
            <img 
              src={previewImage} 
              alt="Trade Chart Screenshot" 
              className="max-h-[85vh] w-auto rounded-lg object-contain"
            />
          </div>
        </div>
      )}

    </div>
  );
}
