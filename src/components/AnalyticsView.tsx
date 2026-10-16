import React, { useMemo } from 'react';
import { Trade, User } from '../types';
import WeeklyReview from './WeeklyReview';
import { cn } from '../lib/utils';
import { format, subDays, startOfDay, isSameDay } from 'date-fns';
import { formatCurrency, safeParseDate } from '../utils';
import { Calendar, BarChart3, Clock, Flame, Activity } from 'lucide-react';

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
  const completedTrades = useMemo(() => {
    return trades
      .filter(t => t.result && t.result.toLowerCase() !== 'pending')
      .sort((a, b) => safeParseDate(a.created_at).getTime() - safeParseDate(b.created_at).getTime());
  }, [trades]);

  // 30-Day Activity Heatmap
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
      return 'bg-[#141414] border-[#262626] text-[#737373] hover:border-[#3D3D3D]';
    }
    if (wr < 0.35) {
      return 'bg-[#FF3333]/15 border-[#FF3333]/40 text-[#FF3333] hover:border-[#FF3333]';
    }
    if (wr < 0.50) {
      return 'bg-amber-950/40 border-amber-900/50 text-amber-300 hover:border-amber-700';
    }
    if (wr < 0.70) {
      return 'bg-[#00E676]/15 border-[#00E676]/35 text-[#00E676] hover:border-[#00E676]';
    }
    return 'bg-[#00E676]/25 border-[#00E676]/60 text-[#00E676] font-bold hover:border-[#00E676] ring-1 ring-[#00E676]/25';
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

  // Session Stats (Asian, London, Overlap London-NY, New York)
  const sessionStats = useMemo(() => {
    const acc: Record<string, { trades: number, wins: number, pnl: number }> = {
      'Asian (06:00 - 14:00)': { trades: 0, wins: 0, pnl: 0 },
      'London (14:00 - 20:00)': { trades: 0, wins: 0, pnl: 0 },
      'NY Overlap (19:00 - 23:00)': { trades: 0, wins: 0, pnl: 0 },
      'New York (20:00 - 04:00)': { trades: 0, wins: 0, pnl: 0 }
    };

    completedTrades.forEach(t => {
      const date = safeParseDate(t.created_at);
      const hours = date.getHours();
      let key = 'Asian (06:00 - 14:00)';
      if (hours >= 19 && hours <= 23) {
        key = 'NY Overlap (19:00 - 23:00)';
      } else if (hours >= 14 && hours < 20) {
        key = 'London (14:00 - 20:00)';
      } else if (hours >= 20 || hours < 4) {
        key = 'New York (20:00 - 04:00)';
      }

      acc[key].trades += 1;
      if (t.result.toLowerCase() === 'win') acc[key].wins += 1;
      acc[key].pnl += (t.realized_pl || 0);
    });

    return Object.entries(acc).map(([session, data]) => ({
      session,
      trades: data.trades,
      winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0,
      pnl: data.pnl
    }));
  }, [completedTrades]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-white p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#2D2D2D]">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Section 1: Weekly Performance Review (Weekend Evaluation Mode) */}
        <WeeklyReview
          trades={trades}
          user={user}
          startingBalance={startingBalance}
          currentEquity={currentEquity}
          onOpenGallery={onOpenGallery}
          onOpenHistory={onOpenHistory}
        />

        {/* Section 2: Consistency & Win Rate Matrix (30-Day Heatmap) */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#2D2D2D]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold tracking-tight text-white uppercase font-mono">
                  Consistency & Win Rate Matrix
                </h2>
                <span className="text-[10px] font-mono text-[#A3A3A3]">
                  (Past 30 Days)
                </span>
              </div>
              <p className="text-xs text-[#A3A3A3] mt-0.5">
                Evaluasi ritme harian dan konsistensi probabilitas win-rate
              </p>
            </div>

            {/* Restrained Inline Legend */}
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[#A3A3A3]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#141414] border border-[#262626]"></span> 
                <span>No Trade</span>
              </span>
              <span className="text-[#404040]">·</span>
              <span className="flex items-center gap-1.5 text-[#FF3333]">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#FF3333]/20 border border-[#FF3333]/40"></span> 
                <span>&lt;35%</span>
              </span>
              <span className="text-[#404040]">·</span>
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-950/40 border border-amber-800"></span> 
                <span>35-49%</span>
              </span>
              <span className="text-[#404040]">·</span>
              <span className="flex items-center gap-1.5 text-[#00E676]">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#00E676]/20 border border-[#00E676]/40"></span> 
                <span>50-69%</span>
              </span>
              <span className="text-[#404040]">·</span>
              <span className="flex items-center gap-1.5 text-[#00E676] font-bold">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#00E676] border border-[#00E676]"></span> 
                <span>≥70%</span>
              </span>
            </div>
          </div>

          {/* 30-Day Grid */}
          <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 lg:grid-cols-[repeat(15,minmax(0,1fr))] gap-2">
            {heatMapDays.map((d, i) => {
              const wrPercent = d.wr >= 0 ? Math.round(d.wr * 100) : -1;
              const signPL = d.dayPL >= 0 ? '+' : '';
              const tooltipTitle = d.count > 0 
                ? `${format(d.date, 'EEEE, dd MMM yyyy')}\nWin Rate: ${wrPercent}%\nRecord: ${d.wins} Win, ${d.losses} Loss (${d.count} total)\nNet P/L: ${signPL}${formatCurrency(d.dayPL, user?.currency)}`
                : `${format(d.date, 'EEEE, dd MMM yyyy')}: No trades logged`;

              return (
                <div 
                  key={i} 
                  className={cn(
                    "min-h-[54px] p-1.5 rounded-md border flex flex-col justify-between text-xs font-mono transition-all hover:scale-105 cursor-pointer tabular-nums select-none", 
                    getHeatMapColor(d.wr, d.count)
                  )}
                  title={tooltipTitle}
                >
                  <span className="text-[10px] opacity-60 leading-none">{format(d.date, 'd')}</span>
                  {d.count > 0 ? (
                    <div className="flex flex-col items-center my-0.5">
                      <span className="text-[11px] font-bold tracking-tight leading-tight">
                        {wrPercent}%
                      </span>
                      <span className="text-[8px] opacity-75 font-mono leading-none mt-0.5">
                        {d.wins}W {d.losses}L
                      </span>
                    </div>
                  ) : (
                    <span className="text-[8px] opacity-20 text-center my-auto">-</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Performance Breakdown (Weekday vs Market Session) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Table 1: Weekday */}
          <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D2D2D] mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white font-mono">
                Performance by Weekday
              </h3>
              <span className="text-[10px] font-mono text-[#A3A3A3]">Monday - Friday</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="bg-[#121212] uppercase text-[#A3A3A3] text-[10px] tracking-wider border-b border-[#2D2D2D]">
                  <tr>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2 text-center">Trades</th>
                    <th className="px-3 py-2 text-center">Win Rate</th>
                    <th className="px-3 py-2 text-right">Net P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262626]">
                  {dayStats.map(s => (
                    <tr key={s.day} className="hover:bg-[#202020] transition-colors">
                      <td className="px-3 py-2.5 font-bold text-white">{s.day}</td>
                      <td className="px-3 py-2.5 text-center text-[#A3A3A3]">{s.trades}</td>
                      <td className="px-3 py-2.5 text-center">
                        {s.trades > 0 ? (
                          <span className={cn(
                            "text-xs font-bold", 
                            s.winRate >= 50 ? "text-[#00E676]" : "text-amber-400"
                          )}>
                            {s.winRate}%
                          </span>
                        ) : (
                          <span className="text-[#555555]">-</span>
                        )}
                      </td>
                      <td className={cn(
                        "px-3 py-2.5 text-right font-bold", 
                        s.pnl > 0 ? "text-[#00E676]" : s.pnl < 0 ? "text-[#FF3333]" : "text-[#A3A3A3]"
                      )}>
                        {s.pnl !== 0 ? (s.pnl > 0 ? '+' : '') + formatCurrency(s.pnl, user?.currency) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Market Session */}
          <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D2D2D] mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white font-mono">
                Performance by Market Session
              </h3>
              <span className="text-[10px] font-mono text-[#A3A3A3]">Asia · London · NY Overlap</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="bg-[#121212] uppercase text-[#A3A3A3] text-[10px] tracking-wider border-b border-[#2D2D2D]">
                  <tr>
                    <th className="px-3 py-2">Session</th>
                    <th className="px-3 py-2 text-center">Trades</th>
                    <th className="px-3 py-2 text-center">Win Rate</th>
                    <th className="px-3 py-2 text-right">Net P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262626]">
                  {sessionStats.map(s => (
                    <tr key={s.session} className="hover:bg-[#202020] transition-colors">
                      <td className="px-3 py-2.5 font-bold text-white">{s.session}</td>
                      <td className="px-3 py-2.5 text-center text-[#A3A3A3]">{s.trades}</td>
                      <td className="px-3 py-2.5 text-center">
                        {s.trades > 0 ? (
                          <span className={cn(
                            "text-xs font-bold", 
                            s.winRate >= 50 ? "text-[#00E676]" : "text-amber-400"
                          )}>
                            {s.winRate}%
                          </span>
                        ) : (
                          <span className="text-[#555555]">-</span>
                        )}
                      </td>
                      <td className={cn(
                        "px-3 py-2.5 text-right font-bold", 
                        s.pnl > 0 ? "text-[#00E676]" : s.pnl < 0 ? "text-[#FF3333]" : "text-[#A3A3A3]"
                      )}>
                        {s.pnl !== 0 ? (s.pnl > 0 ? '+' : '') + formatCurrency(s.pnl, user?.currency) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
