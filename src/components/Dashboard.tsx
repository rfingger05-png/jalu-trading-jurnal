import React, { useMemo, useState } from 'react';
import { Trade, User } from '../types';
import { cn } from '../lib/utils';
import { format, subDays, startOfDay } from 'date-fns';
import { formatCurrency, safeParseDate, safeFormatDate } from '../utils';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Scale,
  CalendarDays,
  ArrowRight,
  ShieldCheck,
  ChevronRight
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
import EquityTargetTracker from './EquityTargetTracker';

interface DashboardProps {
  trades: Trade[];
  user?: User | null;
  onOpenLogTrade?: () => void;
  onOpenCalculators?: () => void;
  onOpenHistory?: () => void;
  onOpenBanking?: () => void;
  currentEquity?: number;
}

export default function Dashboard({
  trades,
  user,
  onOpenLogTrade,
  onOpenCalculators,
  onOpenHistory,
  onOpenBanking,
  currentEquity: propEquity
}: DashboardProps) {
  // Global Period Filter state
  const [selectedPeriod, setSelectedPeriod] = useState<'ALL' | '30D' | '7D' | 'TODAY'>('ALL');

  // Baseline starting balance reference
  const startingBalance = useMemo(() => {
    return user?.initial_balance ?? (trades.length > 0 ? trades[trades.length - 1].account_balance : 10000);
  }, [user?.initial_balance, trades]);

  const currentEquity = useMemo(() => {
    if (typeof propEquity === 'number') return propEquity;
    if (trades.length > 0) return trades[trades.length - 1].account_balance;
    return startingBalance;
  }, [propEquity, trades, startingBalance]);

  // Closed trades sorted chronologically
  const completedTrades = useMemo(() => {
    return trades
      .filter(t => t.result && t.result.toLowerCase() !== 'pending')
      .sort((a, b) => safeParseDate(a.created_at).getTime() - safeParseDate(b.created_at).getTime());
  }, [trades]);

  // Synchronized trades filtered by the active period
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
      // 30D
      cutoff = startOfDay(subDays(now, 30));
    }

    const cutoffTime = cutoff.getTime();
    return completedTrades.filter(t => safeParseDate(t.created_at).getTime() >= cutoffTime);
  }, [completedTrades, selectedPeriod]);

  // Calculate Starting Equity for the active period
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
    const wins = periodTrades.filter(t => t.result.toLowerCase() === 'win');
    const losses = periodTrades.filter(t => t.result.toLowerCase() === 'loss');
    const breakevens = periodTrades.filter(t => t.result.toLowerCase() === 'breakeven');

    const totalWins = wins.length;
    const totalLosses = losses.length;

    // 1. Net Realized P/L
    const netRealizedPL = periodTrades.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
    const returnPercent = periodBaseEquity > 0 ? (netRealizedPL / periodBaseEquity) * 100 : 0;

    // 2. Win Rate
    const winRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0;

    // 3. Profit Factor (Gross Profit / Gross Loss)
    const grossProfit = wins.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (t.realized_pl || 0), 0));
    const profitFactor = grossLoss > 0 
      ? Number((grossProfit / grossLoss).toFixed(2)) 
      : grossProfit > 0 ? 99.9 : 0;

    return {
      netRealizedPL,
      returnPercent,
      winRate,
      totalWins,
      totalLosses,
      breakevensCount: breakevens.length,
      totalTrades,
      profitFactor,
      grossProfit,
      grossLoss
    };
  }, [periodTrades, periodBaseEquity]);

  // Chart Data preparation
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

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-white font-sans selection:bg-[#2D2D2D]">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Section A: Quick Trade Setup (Lot Calculator) */}
        <QuickLotDisplay 
          currentEquity={currentEquity} 
          user={user} 
          onOpenCalculators={onOpenCalculators} 
        />

        {/* Section B: Global Period Filter & 4 Primary Core Metrics */}
        <div className="space-y-3">
          {/* Compact Period Selector Bar */}
          <div className="flex items-center justify-between gap-3 bg-[#1A1A1A] px-3.5 py-2.5 rounded-lg border border-[#2D2D2D]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#A3A3A3] flex items-center gap-1.5">
                <CalendarDays size={13} className="text-[#00E676]" />
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
                      ? "bg-[#2D2D2D] text-white font-bold shadow-xs"
                      : "text-[#A3A3A3] hover:text-white"
                  )}
                >
                  {period === 'TODAY' ? 'Today' : period === '7D' ? '7D' : period === '30D' ? '30D' : 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* Core Metrics Grid (4 Primary Cards — Desktop 4x1, Mobile 2x2) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

            {/* 1. Net Realized P/L */}
            <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-4 sm:p-5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#262626] mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-semibold">
                    Net Realized P/L
                  </span>
                  <DollarSign size={13} className="text-[#737373]" />
                </div>
                <div className={cn(
                  "text-xl sm:text-2xl font-extrabold font-mono tracking-tight tabular-nums",
                  coreMetrics.netRealizedPL >= 0 ? "text-[#00E676]" : "text-[#FF3333]"
                )}>
                  {coreMetrics.netRealizedPL > 0 ? '+' : ''}{formatCurrency(coreMetrics.netRealizedPL, user?.currency)}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#A3A3A3]">Return:</span>
                <span className={cn(
                  "font-bold flex items-center gap-0.5",
                  coreMetrics.returnPercent >= 0 ? "text-[#00E676]" : "text-[#FF3333]"
                )}>
                  {coreMetrics.returnPercent >= 0 ? '+' : ''}{coreMetrics.returnPercent.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* 2. Current Equity */}
            <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-4 sm:p-5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#262626] mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-semibold">
                    Current Equity
                  </span>
                  <ShieldCheck size={13} className="text-[#737373]" />
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-white tabular-nums">
                  {formatCurrency(currentEquity, user?.currency)}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#A3A3A3]">Starting:</span>
                <span className="text-[#A3A3A3] font-medium tabular-nums">
                  {formatCurrency(startingBalance, user?.currency)}
                </span>
              </div>
            </div>

            {/* 3. Win Rate */}
            <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-4 sm:p-5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#262626] mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-semibold">
                    Win Rate
                  </span>
                  <Percent size={13} className="text-[#737373]" />
                </div>
                <div className={cn(
                  "text-xl sm:text-2xl font-extrabold font-mono tracking-tight tabular-nums",
                  coreMetrics.winRate >= 50 ? "text-[#00E676]" : "text-white"
                )}>
                  {coreMetrics.totalTrades > 0 ? `${coreMetrics.winRate}%` : '--'}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#A3A3A3]">Record:</span>
                <span className="text-white font-medium">
                  {coreMetrics.totalWins}W · {coreMetrics.totalLosses}L
                </span>
              </div>
            </div>

            {/* 4. Profit Factor */}
            <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-4 sm:p-5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#262626] mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] font-semibold">
                    Profit Factor
                  </span>
                  <Scale size={13} className="text-[#737373]" />
                </div>
                <div className={cn(
                  "text-xl sm:text-2xl font-extrabold font-mono tracking-tight tabular-nums",
                  coreMetrics.profitFactor >= 1.5 ? "text-[#00E676]" : "text-white"
                )}>
                  {coreMetrics.totalTrades > 0 ? coreMetrics.profitFactor.toFixed(2) : '--'}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono text-[#A3A3A3]">
                <span>Gross W/L:</span>
                <span className="text-white font-medium tabular-nums">
                  {formatCurrency(coreMetrics.grossProfit, user?.currency).replace('.00', '')} / {formatCurrency(coreMetrics.grossLoss, user?.currency).replace('.00', '')}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Section C: Equity Target Tracker */}
        <EquityTargetTracker
          currentEquity={currentEquity}
          startingBalance={startingBalance}
          user={user}
        />

        {/* Section D: Account Equity Growth Chart */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#2D2D2D]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold tracking-tight text-white uppercase font-mono">
                  Account Equity Growth
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#121212] text-[#A3A3A3] border border-[#262626]">
                  {periodLabel}
                </span>
              </div>
              <p className="text-xs text-[#A3A3A3] mt-0.5">
                Kurva pertumbuhan modal akun real-time dengan garis referensi starting equity
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-[#A3A3A3]">
                <span className="w-2.5 h-0.5 bg-[#555555]"></span>
                <span className="text-[10px]">Starting: {formatCurrency(startingBalance, user?.currency)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#00E676]">
                <span className="w-2.5 h-0.5 bg-[#00E676]"></span>
                <span className="text-[10px] font-bold">Equity: {formatCurrency(currentEquity, user?.currency)}</span>
              </div>
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="equityFillGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E676" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00E676" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  stroke="#555555" 
                  fontSize={11} 
                  fontFamily="monospace"
                  tickLine={false} 
                  axisLine={{ stroke: '#2D2D2D' }}
                  minTickGap={35}
                />
                <YAxis 
                  stroke="#555555" 
                  fontSize={11} 
                  fontFamily="monospace"
                  tickLine={false} 
                  axisLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={(val) => {
                    if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}k`;
                    return `$${val}`;
                  }}
                  width={60}
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
                            <span className="font-bold text-white text-sm tabular-nums">
                              {formatCurrency(data.balance, user?.currency)}
                            </span>
                          </div>
                          {hasPL && (
                            <div className="flex items-baseline justify-between gap-4 pt-1 border-t border-[#262626]">
                              <span className="text-[#A3A3A3]">{data.pair} ({data.direction}):</span>
                              <span className={cn("font-bold tabular-nums", data.tradePL > 0 ? "text-[#00E676]" : "text-[#FF3333]")}>
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
                  stroke="#00E676" 
                  strokeWidth={2} 
                  fillOpacity={1} 
                  fill="url(#equityFillGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Section E: Recent Trades (5 Latest Trades) */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#2D2D2D] mb-4">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white font-mono">
                Recent Trades
              </h3>
              <p className="text-[11px] text-[#A3A3A3] mt-0.5">
                5 transaksi terakhir yang tercatat
              </p>
            </div>

            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                className="text-xs font-mono font-bold text-[#00E676] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View Full History</span>
                <ChevronRight size={13} />
              </button>
            )}
          </div>

          {recentTrades.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#A3A3A3] font-mono">
              Belum ada transaksi tercatat. Mulai jurnal atau gunakan Telegram Bot untuk mencatat trade.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#262626]">
                    {recentTrades.map(t => {
                      const isWin = (t.result || '').toLowerCase() === 'win';
                      const isLoss = (t.result || '').toLowerCase() === 'loss';
                      const isBuy = t.direction?.toLowerCase() === 'buy';

                      return (
                        <tr key={t.id} className="hover:bg-[#202020] transition-colors">
                          <td className="px-3.5 py-3 text-[#A3A3A3]">
                            {safeFormatDate(t.created_at, 'dd MMM, HH:mm')}
                          </td>
                          <td className="px-3.5 py-3 font-bold text-white">
                            {t.pair || 'XAUUSD'}
                          </td>
                          <td className="px-3.5 py-3">
                            {/* Direction Badge: BUY in #00E676, SELL in #FF3333 */}
                            <span className={cn(
                              "text-[10px] font-extrabold uppercase px-2 py-0.5 rounded tracking-wider",
                              isBuy
                                ? "bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30"
                                : "bg-[#FF3333]/15 text-[#FF3333] border border-[#FF3333]/30"
                            )}>
                              {t.direction}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-white">
                            {t.position_size ? t.position_size.toFixed(2) : '--'}
                          </td>
                          <td className={cn(
                            "px-3.5 py-3 text-right font-medium",
                            (t.pips || 0) > 0 ? "text-[#00E676]" : (t.pips || 0) < 0 ? "text-[#FF3333]" : "text-[#A3A3A3]"
                          )}>
                            {t.pips !== null && t.pips !== undefined && Number(t.pips) !== 0
                              ? `${Number(t.pips) > 0 ? '+' : ''}${Number(t.pips).toFixed(1)}p` 
                              : '-'}
                          </td>
                          <td className={cn(
                            "px-3.5 py-3 text-right font-extrabold tabular-nums",
                            (t.realized_pl || 0) > 0 ? "text-[#00E676]" : (t.realized_pl || 0) < 0 ? "text-[#FF3333]" : "text-white"
                          )}>
                            {t.realized_pl !== null && t.realized_pl !== undefined 
                              ? `${t.realized_pl > 0 ? '+' : ''}${formatCurrency(t.realized_pl, user?.currency)}` 
                              : '-'}
                          </td>
                          <td className="px-3.5 py-3 text-center">
                            <span className={cn(
                              "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                              isWin 
                                ? "bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30" 
                                : isLoss 
                                ? "bg-[#FF3333]/15 text-[#FF3333] border border-[#FF3333]/30" 
                                : "bg-[#262626] text-[#A3A3A3]"
                            )}>
                              {t.result || 'Pending'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card-List (Zero Horizontal Overflow, Touch-Friendly) */}
              <div className="sm:hidden space-y-2.5">
                {recentTrades.map(t => {
                  const isWin = (t.result || '').toLowerCase() === 'win';
                  const isLoss = (t.result || '').toLowerCase() === 'loss';
                  const isBuy = t.direction?.toLowerCase() === 'buy';

                  return (
                    <div 
                      key={t.id}
                      className="p-3.5 rounded-lg bg-[#121212] border border-[#2D2D2D] flex flex-col gap-2 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white text-sm">{t.pair || 'XAUUSD'}</span>
                          <span className={cn(
                            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                            isBuy ? "bg-[#00E676]/15 text-[#00E676]" : "bg-[#FF3333]/15 text-[#FF3333]"
                          )}>
                            {t.direction}
                          </span>
                          <span className="text-[10px] text-[#A3A3A3]">
                            Lot: {t.position_size ? t.position_size.toFixed(2) : '--'}
                          </span>
                        </div>

                        <span className={cn(
                          "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                          isWin ? "bg-[#00E676]/15 text-[#00E676]" : isLoss ? "bg-[#FF3333]/15 text-[#FF3333]" : "bg-[#262626] text-[#A3A3A3]"
                        )}>
                          {t.result || 'Pending'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[#A3A3A3] text-[11px] pt-1.5 border-t border-[#262626]">
                        <span>{safeFormatDate(t.created_at, 'dd MMM, HH:mm')}</span>
                        <div className="flex items-center gap-2">
                          {t.pips !== null && t.pips !== undefined && Number(t.pips) !== 0 && (
                            <span className={Number(t.pips) > 0 ? "text-[#00E676]" : "text-[#FF3333]"}>
                              {Number(t.pips) > 0 ? '+' : ''}{Number(t.pips).toFixed(1)}p
                            </span>
                          )}
                          <span className={cn(
                            "font-extrabold text-sm",
                            (t.realized_pl || 0) > 0 ? "text-[#00E676]" : (t.realized_pl || 0) < 0 ? "text-[#FF3333]" : "text-white"
                          )}>
                            {t.realized_pl !== null && t.realized_pl !== undefined 
                              ? `${t.realized_pl > 0 ? '+' : ''}${formatCurrency(t.realized_pl, user?.currency)}` 
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
