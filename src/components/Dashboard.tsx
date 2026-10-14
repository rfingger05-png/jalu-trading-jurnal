import React, { useMemo, useState } from 'react';
import { Trade, User, Transaction } from '../types';
import { cn } from '../lib/utils';
import { format, subDays, startOfDay, isSameDay } from 'date-fns';
import { formatCurrency, safeParseDate, safeFormatDate, detectTradingSession } from '../utils';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Activity, Calendar, Clock, DollarSign, Wallet, Newspaper } from 'lucide-react';
import EconomicCalendarModal from './EconomicCalendarModal';

interface DashboardProps {
  trades: Trade[];
  user?: User | null;
  transactions?: Transaction[];
  onOpenLogTrade?: () => void;
  onOpenBanking?: () => void;
  onOpenHistory?: () => void;
}

export default function Dashboard({ 
  trades, 
  user, 
  transactions = [],
  onOpenLogTrade,
  onOpenBanking,
  onOpenHistory
}: DashboardProps) {
  const [showNewsModal, setShowNewsModal] = useState(false);

  const completedTrades = useMemo(() => {
    return trades
      .filter(t => t.result && t.result !== 'Pending')
      .sort((a, b) => safeParseDate(a.created_at).getTime() - safeParseDate(b.created_at).getTime());
  }, [trades]);

  const wins = completedTrades.filter(t => t.result.toLowerCase() === 'win').length;
  const losses = completedTrades.filter(t => t.result.toLowerCase() === 'loss').length;
  const breakevens = completedTrades.filter(t => t.result.toLowerCase() === 'breakeven').length;
  const totalCompleted = completedTrades.length;
  const winRate = totalCompleted > 0 ? Math.round((wins / totalCompleted) * 100) : 0;

  const totalPL = completedTrades.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
  const totalPips = completedTrades.reduce((acc, t) => acc + (t.pips || 0), 0);

  const startingBalance = user?.prop_firm_enabled 
    ? (user.prop_firm_balance || 10000) 
    : (user?.initial_balance ?? 10000);

  const totalDeposits = transactions.filter(t => t.type === 'deposit').reduce((acc, t) => acc + t.amount, 0);
  const totalWithdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((acc, t) => acc + t.amount, 0);

  const currentEquity = startingBalance + totalPL + totalDeposits - totalWithdrawals;
  const returnPercentage = startingBalance > 0 ? ((totalPL / startingBalance) * 100).toFixed(2) : '0.00';

  // Advanced Stats
  const { grossProfit, grossLoss, profitFactor, maxWinStreak, maxLossStreak, currentWinStreak, currentLossStreak, avgWin, avgLoss } = useMemo(() => {
    let gp = 0;
    let gl = 0;
    let cws = 0;
    let cls = 0;
    let mws = 0;
    let mls = 0;

    completedTrades.forEach(t => {
      const pl = t.realized_pl || 0;
      if (t.result.toLowerCase() === 'win') {
        gp += pl;
        cws++;
        cls = 0;
        if (cws > mws) mws = cws;
      } else if (t.result.toLowerCase() === 'loss') {
        gl += Math.abs(pl);
        cls++;
        cws = 0;
        if (cls > mls) mls = cls;
      } else {
        cws = 0;
        cls = 0;
      }
    });

    const pf = gl > 0 ? (gp / gl).toFixed(2) : gp > 0 ? '∞' : '0.00';
    const aw = wins > 0 ? gp / wins : 0;
    const al = losses > 0 ? gl / losses : 0;

    return {
      grossProfit: gp,
      grossLoss: gl,
      profitFactor: pf,
      maxWinStreak: mws,
      maxLossStreak: mls,
      currentWinStreak: cws,
      currentLossStreak: cls,
      avgWin: aw,
      avgLoss: al
    };
  }, [completedTrades, wins, losses]);

  // Equity Chart Data
  const chartData = useMemo(() => {
    if (completedTrades.length === 0) {
      return [
        { date: 'Start', fullDate: 'Initial Balance', balance: startingBalance }
      ];
    }

    let running = startingBalance;
    const initialPoint = {
      date: 'Start',
      fullDate: 'Initial Balance',
      balance: startingBalance
    };

    const points = completedTrades.map(t => {
      running += (t.realized_pl || 0);
      const d = safeParseDate(t.created_at);
      return {
        date: safeFormatDate(d, 'MMM dd'),
        fullDate: safeFormatDate(d, 'dd MMM yyyy, HH:mm'),
        balance: running,
        tradePL: t.realized_pl || 0,
        pair: t.pair
      };
    });

    return [initialPoint, ...points];
  }, [completedTrades, startingBalance]);

  // 30-Day Heatmap
  const today = startOfDay(new Date());
  const heatMapDays = useMemo(() => {
    const daysTotal = 29;
    const result = [];
    for (let i = 0; i <= daysTotal; i++) {
      const d = subDays(today, daysTotal - i);
      const dayTrades = completedTrades.filter(t => {
        const tDate = startOfDay(safeParseDate(t.created_at));
        return isSameDay(tDate, d);
      });

      let wr = -1;
      let dayPL = 0;
      let dayWins = 0;
      let dayLosses = 0;
      if (dayTrades.length > 0) {
        dayWins = dayTrades.filter(t => t.result.toLowerCase() === 'win').length;
        dayLosses = dayTrades.filter(t => t.result.toLowerCase() === 'loss').length;
        wr = dayWins / dayTrades.length;
        dayPL = dayTrades.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
      }
      result.push({ date: d, wr, count: dayTrades.length, dayPL, wins: dayWins, losses: dayLosses });
    }
    return result;
  }, [completedTrades, today]);

  const getHeatMapColor = (wr: number, count: number) => {
    if (count === 0) {
      return 'bg-slate-100/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 text-slate-400 dark:text-slate-600 hover:border-slate-400';
    }
    // WR Sangat Rendah (< 35%, merah tegas)
    if (wr < 0.35) {
      return 'bg-rose-500/25 dark:bg-rose-950/70 border-rose-400 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-extrabold ring-1 ring-rose-500/30';
    }
    // WR Rendah (35% - 49%, oranye / coral)
    if (wr < 0.50) {
      return 'bg-orange-500/20 dark:bg-orange-950/60 border-orange-400 dark:border-orange-800/80 text-orange-700 dark:text-orange-300 font-bold';
    }
    // WR Sedang (50% - 64%, kuning amber)
    if (wr < 0.65) {
      return 'bg-amber-500/20 dark:bg-amber-950/60 border-amber-400 dark:border-amber-700/80 text-amber-700 dark:text-amber-300 font-bold';
    }
    // WR Bagus (65% - 79%, hijau segar)
    if (wr < 0.80) {
      return 'bg-emerald-500/20 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-700/80 text-emerald-700 dark:text-emerald-300 font-bold';
    }
    // WR Sangat Tinggi (>= 80%, hijau zamrud tebal / elite)
    return 'bg-emerald-500/35 dark:bg-emerald-900/80 border-emerald-500 dark:border-emerald-400 text-emerald-800 dark:text-emerald-100 font-black ring-2 ring-emerald-500/50 shadow-xs';
  };

  // Day of Week Stats
  const dayStats = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const acc: Record<string, { trades: number, wins: number, pnl: number }> = {};
    
    completedTrades.forEach(t => {
      const date = safeParseDate(t.created_at);
      const dayName = days[date.getDay()];
      if (!acc[dayName]) acc[dayName] = { trades: 0, wins: 0, pnl: 0 };
      acc[dayName].trades += 1;
      if (t.result.toLowerCase() === 'win') acc[dayName].wins += 1;
      acc[dayName].pnl += (t.realized_pl || 0);
    });
    
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => {
      const data = acc[day] || { trades: 0, wins: 0, pnl: 0 };
      return {
        day,
        trades: data.trades,
        winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0,
        pnl: data.pnl
      };
    });
  }, [completedTrades]);

  // Session Stats (Asia, London, Overlap London-NY, New York)
  const sessionStats = useMemo(() => {
    const acc: Record<string, { trades: number, wins: number, pnl: number }> = {
      'Asian (06:00 - 14:00)': { trades: 0, wins: 0, pnl: 0 },
      'London (14:00 - 19:00)': { trades: 0, wins: 0, pnl: 0 },
      'Overlap London-NY (19:00 - 23:00)': { trades: 0, wins: 0, pnl: 0 },
      'New York (23:00 - 06:00)': { trades: 0, wins: 0, pnl: 0 }
    };
    
    completedTrades.forEach(t => {
      let sessionKey = 'Asian (06:00 - 14:00)';
      if (t.session) {
        if (t.session === 'London') sessionKey = 'London (14:00 - 19:00)';
        else if (t.session === 'Overlap') sessionKey = 'Overlap London-NY (19:00 - 23:00)';
        else if (t.session === 'New York') sessionKey = 'New York (23:00 - 06:00)';
        else if (t.session === 'Asian') sessionKey = 'Asian (06:00 - 14:00)';
      } else {
        const sessInfo = detectTradingSession(t.trade_time || t.created_at);
        if (sessInfo.name === 'London') sessionKey = 'London (14:00 - 19:00)';
        else if (sessInfo.name === 'Overlap') sessionKey = 'Overlap London-NY (19:00 - 23:00)';
        else if (sessInfo.name === 'New York') sessionKey = 'New York (23:00 - 06:00)';
        else sessionKey = 'Asian (06:00 - 14:00)';
      }
      
      acc[sessionKey].trades += 1;
      if (t.result.toLowerCase() === 'win') acc[sessionKey].wins += 1;
      acc[sessionKey].pnl += (t.realized_pl || 0);
    });
    
    return Object.entries(acc).map(([session, data]) => ({
      session,
      trades: data.trades,
      winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0,
      pnl: data.pnl
    }));
  }, [completedTrades]);

  // Recent 5 Trades
  const recentTrades = useMemo(() => {
    return [...trades]
      .sort((a, b) => safeParseDate(b.created_at).getTime() - safeParseDate(a.created_at).getTime())
      .slice(0, 5);
  }, [trades]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Executive Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold uppercase tracking-wider">Trading Journal Overview</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono uppercase">{user?.current_mode || 'backtest'} Mode</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
              Account Performance
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowNewsModal(true)}
              className="px-3.5 py-1.5 text-xs font-semibold rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Lihat Berita Berdampak ke Emas (XAUUSD)"
            >
              <Newspaper size={13} className="text-amber-500" />
              <span>News XAUUSD</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            </button>

            {onOpenBanking && (
              <button
                onClick={onOpenBanking}
                className="px-3.5 py-1.5 text-xs font-semibold rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs flex items-center gap-2"
              >
                <Wallet size={13} className="text-slate-500" />
                <span>Deposit / Withdraw</span>
              </button>
            )}
            {onOpenLogTrade && (
              <button
                onClick={onOpenLogTrade}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 transition-colors shadow-xs flex items-center gap-1.5"
              >
                <span>+ Log Trade</span>
              </button>
            )}
          </div>
        </div>

        {/* Primary Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          
          {/* Net Realized P/L */}
          <div className="p-4 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
            <span className="text-[11px] font-medium tracking-wide uppercase text-slate-500 dark:text-slate-400 block mb-1">Net Realized P/L</span>
            <div className={cn("text-xl sm:text-2xl font-bold font-mono tracking-tight tabular-nums", totalPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {totalPL > 0 ? '+' : ''}{formatCurrency(totalPL, user?.currency)}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-mono tabular-nums">
              {Number(returnPercentage) >= 0 ? (
                <ArrowUpRight size={13} className="text-emerald-500 shrink-0" />
              ) : (
                <ArrowDownRight size={13} className="text-rose-500 shrink-0" />
              )}
              <span className={Number(returnPercentage) >= 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-rose-600 dark:text-rose-400 font-semibold"}>
                {returnPercentage}%
              </span>
              <span>return</span>
            </div>
          </div>

          {/* Win Rate */}
          <div className="p-4 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
            <span className="text-[11px] font-medium tracking-wide uppercase text-slate-500 dark:text-slate-400 block mb-1">Win Rate</span>
            <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight tabular-nums text-slate-900 dark:text-white">
              {winRate}%
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{wins}W</span>
              <span className="mx-1">/</span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">{losses}L</span>
              {breakevens > 0 && <span className="text-slate-400"> / {breakevens}BE</span>}
            </div>
          </div>

          {/* Profit Factor */}
          <div className="p-4 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
            <span className="text-[11px] font-medium tracking-wide uppercase text-slate-500 dark:text-slate-400 block mb-1">Profit Factor</span>
            <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight tabular-nums text-slate-900 dark:text-white">
              {profitFactor}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Avg R:R: <span className="text-slate-700 dark:text-slate-300 font-medium">{avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : '-'}</span>
            </div>
          </div>

          {/* Total Pips */}
          <div className="p-4 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
            <span className="text-[11px] font-medium tracking-wide uppercase text-slate-500 dark:text-slate-400 block mb-1">Total Pips</span>
            <div className={cn("text-xl sm:text-2xl font-bold font-mono tracking-tight tabular-nums", totalPips >= 0 ? "text-slate-900 dark:text-white" : "text-rose-600 dark:text-rose-400")}>
              {totalPips > 0 ? '+' : ''}{totalPips.toLocaleString()} p
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Across <span className="font-semibold text-slate-700 dark:text-slate-300">{totalCompleted}</span> closed trades
            </div>
          </div>

          {/* Streak Tracker */}
          <div className="p-4 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
            <span className="text-[11px] font-medium tracking-wide uppercase text-slate-500 dark:text-slate-400 block mb-1">Streak Tracker</span>
            <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight tabular-nums text-slate-900 dark:text-white">
              {currentWinStreak > 0 ? `${currentWinStreak} Win` : currentLossStreak > 0 ? `${currentLossStreak} Loss` : 'None'}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2">
              <span>Best: <b className="text-emerald-500">{maxWinStreak}W</b></span>
              <span aria-hidden="true">·</span>
              <span>Worst: <b className="text-rose-500">{maxLossStreak}L</b></span>
            </div>
          </div>

        </div>

        {/* Equity Curve Chart */}
        <div className="p-5 sm:p-6 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Account Equity Growth</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cumulative balance progression over time</p>
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Current Equity: <b className="text-slate-900 dark:text-white font-semibold">{formatCurrency(currentEquity, user?.currency)}</b>
            </div>
          </div>

          <div className="w-full min-w-0 h-[280px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={['dataMin - 100', 'dataMax + 100']} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded text-xs font-mono shadow-xl border border-slate-800">
                          <div className="text-slate-400 mb-1">{data.fullDate}</div>
                          <div className="font-bold text-white text-sm tabular-nums">{formatCurrency(data.balance as number, user?.currency)}</div>
                          {data.tradePL !== undefined && (
                            <div className={cn("mt-1 text-[11px] tabular-nums", data.tradePL >= 0 ? "text-emerald-400" : "text-rose-400")}>
                              {data.pair}: {data.tradePL > 0 ? '+' : ''}{formatCurrency(data.tradePL, user?.currency)}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorEquity)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 30-Day Activity Heatmap - GRADASI WARNA BERDASARKAN WIN RATE (WR) */}
        <div className="p-5 sm:p-6 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Kotak Konsistensi Trading & Win Rate (30 Hari Terakhir)</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  Gradasi WR
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Warna kotak otomatis menyesuaikan persentase Win Rate harian (Tinggi = Hijau Emerald, Rendah = Merah Pekat)</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"></span> 
                No Trade
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500/30 border border-rose-500"></span> 
                WR &lt;35% (Sangat Rendah)
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-orange-500/30 border border-orange-500"></span> 
                WR 35-49% (Rendah)
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500/30 border border-amber-500"></span> 
                WR 50-64% (Sedang)
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500/30 border border-emerald-500"></span> 
                WR 65-79% (Bagus)
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-200 font-bold">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 border border-emerald-400"></span> 
                WR ≥80% (Tinggi / Elite)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-[repeat(15,minmax(0,1fr))] gap-2">
            {heatMapDays.map((d, i) => {
              const wrPercent = d.wr >= 0 ? Math.round(d.wr * 100) : -1;
              const signPL = d.dayPL >= 0 ? '+' : '';
              const tooltipTitle = d.count > 0 
                ? `📅 ${format(d.date, 'dd MMM yyyy')}\n🎯 Win Rate: ${wrPercent}% (${d.wins} Win, ${d.losses} Loss)\n📦 Total Trades: ${d.count}\n💰 Net P/L: ${signPL}${formatCurrency(d.dayPL, user?.currency)}`
                : `📅 ${format(d.date, 'dd MMM yyyy')}: Tidak ada transaksi`;

              return (
                <div 
                  key={i} 
                  className={cn(
                    "min-h-[52px] p-1 rounded-sm border flex flex-col items-center justify-between text-xs font-mono transition-all hover:scale-105 cursor-pointer tabular-nums shadow-2xs select-none", 
                    getHeatMapColor(d.wr, d.count)
                  )}
                  title={tooltipTitle}
                >
                  <span className="text-[10px] font-sans opacity-70 leading-none">{format(d.date, 'd')}</span>
                  {d.count > 0 ? (
                    <div className="flex flex-col items-center my-0.5">
                      <span className="text-[10px] font-black tracking-tight leading-tight">
                        {wrPercent}%
                      </span>
                      <span className="text-[8px] opacity-75 font-sans font-medium leading-none">
                        {d.wins}W {d.losses}L
                      </span>
                    </div>
                  ) : (
                    <span className="text-[8px] opacity-30 my-auto">-</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Day of Week & Session Performance Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Day of Week */}
          <div className="p-5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Performance by Day of Week
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="bg-slate-50 dark:bg-slate-900/50 uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2 text-center">Trades</th>
                    <th className="px-3 py-2 text-center">Win Rate</th>
                    <th className="px-3 py-2 text-right">Net P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {dayStats.map(s => (
                    <tr key={s.day} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                      <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">{s.day}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{s.trades}</td>
                      <td className="px-3 py-2.5 text-center">
                        {s.trades > 0 ? (
                          <span className={cn("px-1.5 py-0.5 rounded-xs text-[10px] font-semibold", s.winRate >= 50 ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50" : "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50")}>
                            {s.winRate}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-medium", s.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {s.pnl > 0 ? '+' : ''}{formatCurrency(s.pnl, user?.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Session Performance */}
          <div className="p-5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Performance by Trading Session
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="bg-slate-50 dark:bg-slate-900/50 uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2">Session</th>
                    <th className="px-3 py-2 text-center">Trades</th>
                    <th className="px-3 py-2 text-center">Win Rate</th>
                    <th className="px-3 py-2 text-right">Net P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {sessionStats.map(s => (
                    <tr key={s.session} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                      <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">{s.session}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{s.trades}</td>
                      <td className="px-3 py-2.5 text-center">
                        {s.trades > 0 ? (
                          <span className={cn("px-1.5 py-0.5 rounded-xs text-[10px] font-semibold", s.winRate >= 50 ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50" : "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50")}>
                            {s.winRate}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-medium", s.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {s.pnl > 0 ? '+' : ''}{formatCurrency(s.pnl, user?.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Recent Trades Table */}
        <div className="p-5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Recent Trade Activity
            </h3>
            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:underline flex items-center gap-1"
              >
                <span>View All History</span>
                <ArrowUpRight size={13} />
              </button>
            )}
          </div>

          {recentTrades.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 font-mono">
              No trades recorded yet. Click &quot;+ Log New Trade&quot; to begin your journal.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-50 dark:bg-slate-900/50 uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Pair</th>
                    <th className="px-3 py-2">Direction</th>
                    <th className="px-3 py-2">Result</th>
                    <th className="px-3 py-2 text-right">Pips</th>
                    <th className="px-3 py-2 text-right">P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {recentTrades.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                      <td className="px-3 py-2.5 text-slate-500">{safeFormatDate(t.created_at, 'dd MMM HH:mm')}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">{t.pair}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("px-1.5 py-0.5 rounded-xs text-[10px] font-semibold", t.direction === 'Buy' ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40" : "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40")}>
                          {t.direction}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("px-1.5 py-0.5 rounded-xs text-[10px] font-semibold", t.result === 'Win' ? "text-emerald-600 dark:text-emerald-400" : t.result === 'Loss' ? "text-rose-600 dark:text-rose-400" : "text-slate-400")}>
                          {t.result}
                        </span>
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-medium", (t.pips || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : (t.pips || 0) < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400")}>
                        {t.pips !== null && t.pips !== undefined ? `${t.pips > 0 ? '+' : ''}${t.pips}p` : '-'}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-bold", (t.realized_pl || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : (t.realized_pl || 0) < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400")}>
                        {t.realized_pl !== null && t.realized_pl !== undefined ? `${t.realized_pl > 0 ? '+' : ''}${formatCurrency(t.realized_pl, user?.currency)}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {showNewsModal && (
        <EconomicCalendarModal onClose={() => setShowNewsModal(false)} />
      )}
    </div>
  );
}
