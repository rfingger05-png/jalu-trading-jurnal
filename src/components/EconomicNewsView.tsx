import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Clock, Flame, Info, CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { EconomicNewsItem } from '../lib/newsService';
import { authFetch } from '../utils';
import { cn } from '../lib/utils';

export default function EconomicNewsView() {
  const [news, setNews] = useState<EconomicNewsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [viewFilter, setViewFilter] = useState<'all' | 'upcoming' | 'passed'>('upcoming');
  const [nowTime, setNowTime] = useState<Date>(new Date());

  // Keep live time ticking for countdown
  useEffect(() => {
    const timer = setInterval(() => setNowTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchNewsData = async (force = false) => {
    try {
      if (force) setRefreshing(true);
      else setLoading(true);

      const res = await authFetch(`/api/news?refresh=${force ? 'true' : 'false'}`);
      if (res.ok) {
        const data = await res.json();
        if (data.news && Array.isArray(data.news)) {
          setNews(data.news);
        }
      }
    } catch (e) {
      console.error("Failed to fetch news:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNewsData();
  }, []);

  // Filter specifically for major events impacting XAUUSD (USD High / Medium Impact)
  const majorNews = useMemo(() => {
    return news.filter(item => {
      const isHighOrMed = String(item.impact).toLowerCase() === 'high' || String(item.impact).toLowerCase() === 'medium';
      const isUsd = item.country?.toUpperCase() === 'USD';
      return isUsd && (item.is_xauusd || isHighOrMed);
    });
  }, [news]);

  // Next upcoming major event
  const nextEvent = useMemo(() => {
    return majorNews.find(item => !item.is_passed && String(item.impact).toLowerCase() === 'high') ||
           majorNews.find(item => !item.is_passed);
  }, [majorNews]);

  // Countdown computation
  const countdown = useMemo(() => {
    if (!nextEvent) return null;
    const eventTime = new Date(nextEvent.date).getTime();
    const diff = eventTime - nowTime.getTime();

    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, passed: true };

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, passed: false };
  }, [nextEvent, nowTime]);

  // Filtered list by upcoming or passed
  const displayedNews = useMemo(() => {
    if (viewFilter === 'upcoming') {
      return majorNews.filter(n => !n.is_passed);
    }
    if (viewFilter === 'passed') {
      return majorNews.filter(n => n.is_passed);
    }
    return majorNews;
  }, [majorNews, viewFilter]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-white p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#2D2D2D]">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#A3A3A3]">
              <span className="uppercase tracking-wider">ECONOMIC NEWS</span>
              <span className="text-[#404040]">/</span>
              <span className="text-[#FF3333] font-bold">XAUUSD MAJOR EVENTS</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white mt-1">
              High Impact Gold Catalysts
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchNewsData(true)}
              disabled={refreshing}
              className="px-3 py-1.5 rounded bg-[#1A1A1A] border border-[#2D2D2D] hover:border-[#3D3D3D] text-xs font-mono text-[#A3A3A3] hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin text-[#FF3333]" : ""} />
              <span>Refresh Feed</span>
            </button>
          </div>
        </div>

        {/* Hero: Next Major Event Countdown Banner */}
        {nextEvent && (
          <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 sm:p-6 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#FF3333]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-bold font-mono uppercase bg-[#FF3333] text-white tracking-wider flex items-center gap-1 shadow-xs">
                    <Flame size={12} />
                    HIGH IMPACT EVENT
                  </span>
                  <span className="text-xs font-mono text-[#A3A3A3]">
                    Currency: <strong className="text-white">USD</strong>
                  </span>
                  <span className="text-[#404040]">·</span>
                  <span className="text-xs font-mono text-[#A3A3A3]">
                    {nextEvent.date_wib} · {nextEvent.time_wib} WIB
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  {nextEvent.title}
                </h2>

                <div className="flex items-center gap-4 text-xs font-mono text-[#A3A3A3] pt-1">
                  {nextEvent.forecast && (
                    <span>Forecast: <strong className="text-white">{nextEvent.forecast}</strong></span>
                  )}
                  {nextEvent.previous && (
                    <span>Previous: <strong className="text-white">{nextEvent.previous}</strong></span>
                  )}
                </div>
              </div>

              {/* Countdown Digits Box */}
              {countdown && (
                <div className="bg-[#121212] border border-[#2D2D2D] rounded-lg p-3.5 sm:p-4 flex items-center gap-2.5 sm:gap-4 shrink-0 font-mono text-center">
                  <div className="flex flex-col px-2 sm:px-3">
                    <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                      {String(countdown.days).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] text-[#A3A3A3] uppercase">Days</span>
                  </div>
                  <span className="text-xl font-bold text-[#404040]">:</span>
                  <div className="flex flex-col px-2 sm:px-3">
                    <span className="text-2xl sm:text-3xl font-black text-[#FF3333] tabular-nums">
                      {String(countdown.hours).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] text-[#A3A3A3] uppercase">Hours</span>
                  </div>
                  <span className="text-xl font-bold text-[#404040]">:</span>
                  <div className="flex flex-col px-2 sm:px-3">
                    <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                      {String(countdown.minutes).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] text-[#A3A3A3] uppercase">Mins</span>
                  </div>
                  <span className="text-xl font-bold text-[#404040]">:</span>
                  <div className="flex flex-col px-2 sm:px-3">
                    <span className="text-2xl sm:text-3xl font-black text-[#00E676] tabular-nums">
                      {String(countdown.seconds).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] text-[#A3A3A3] uppercase">Secs</span>
                  </div>
                </div>
              )}
            </div>

            {/* Market Mechanics Note for Gold */}
            <div className="mt-4 pt-4 border-t border-[#262626] flex items-start gap-2.5 text-xs text-[#A3A3A3]">
              <Info size={15} className="text-[#FF3333] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="text-white">Gold Correlation Rule:</strong> Data USD aktual yang lebih tinggi dari Forecast (Bullish USD) umumnya menekan harga emas (<span className="text-[#FF3333] font-semibold">Bearish XAUUSD</span>). Sebaliknya, data USD yang melemah memicu dorongan reli pada emas (<span className="text-[#00E676] font-semibold">Bullish XAUUSD</span>).
              </p>
            </div>
          </div>
        )}

        {/* Tab Filters: Upcoming vs Passed Releases */}
        <div className="flex items-center justify-between gap-3 bg-[#1A1A1A] p-3 rounded-lg border border-[#2D2D2D]">
          <div className="flex items-center gap-1 bg-[#121212] p-1 rounded-md border border-[#262626] text-xs font-mono">
            <button
              onClick={() => setViewFilter('upcoming')}
              className={cn(
                "px-3 py-1.5 rounded transition-colors cursor-pointer font-semibold",
                viewFilter === 'upcoming'
                  ? "bg-[#2D2D2D] text-white shadow-xs"
                  : "text-[#A3A3A3] hover:text-white"
              )}
            >
              Upcoming ({majorNews.filter(n => !n.is_passed).length})
            </button>
            <button
              onClick={() => setViewFilter('passed')}
              className={cn(
                "px-3 py-1.5 rounded transition-colors cursor-pointer font-semibold",
                viewFilter === 'passed'
                  ? "bg-[#2D2D2D] text-white shadow-xs"
                  : "text-[#A3A3A3] hover:text-white"
              )}
            >
              Passed / 30-Day History ({majorNews.filter(n => n.is_passed).length})
            </button>
            <button
              onClick={() => setViewFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded transition-colors cursor-pointer font-semibold",
                viewFilter === 'all'
                  ? "bg-[#2D2D2D] text-white shadow-xs"
                  : "text-[#A3A3A3] hover:text-white"
              )}
            >
              All Releases
            </button>
          </div>

          <div className="text-[11px] font-mono text-[#A3A3A3] hidden sm:block">
            Auto-filtered for USD Core CPI, NFP, FOMC, GDP, PPI, PMI, Unemployment
          </div>
        </div>

        {/* News Items Table / List */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs font-mono text-[#A3A3A3] flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin text-[#FF3333]" />
              <span>Memuat data kalender ekonomi...</span>
            </div>
          ) : displayedNews.length === 0 ? (
            <div className="p-12 text-center text-xs font-mono text-[#A3A3A3]">
              Tidak ada rilis berita dalam filter ini.
            </div>
          ) : (
            <div className="divide-y divide-[#262626]">
              {displayedNews.map(item => {
                const isHigh = String(item.impact).toLowerCase() === 'high';
                const hasActual = Boolean(item.actual);

                return (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 hover:bg-[#202020] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* High Impact Scarlet Crimson Red Badge */}
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider",
                          isHigh
                            ? "bg-[#FF3333] text-white shadow-xs"
                            : "bg-[#262626] text-amber-400 border border-amber-900/40"
                        )}>
                          {item.impact} IMPACT
                        </span>

                        <span className="text-[11px] font-mono font-bold text-white bg-[#121212] px-1.5 py-0.5 rounded border border-[#2D2D2D]">
                          {item.country}
                        </span>

                        <span className="text-xs font-mono text-[#A3A3A3]">
                          {item.date_wib} · {item.time_wib} WIB
                        </span>

                        {item.is_passed ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00E676]/10 text-[#00E676] border border-[#00E676]/30 font-semibold flex items-center gap-1">
                            <CheckCircle2 size={11} />
                            Passed
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1">
                            <Clock size={11} />
                            Upcoming
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                        {item.title}
                      </h3>
                    </div>

                    {/* Numerical Data (Actual / Forecast / Previous) */}
                    <div className="flex items-center gap-4 text-xs font-mono shrink-0 bg-[#121212] p-2.5 rounded-lg border border-[#262626]">
                      <div className="flex flex-col items-center min-w-[54px]">
                        <span className="text-[10px] text-[#A3A3A3] uppercase">Actual</span>
                        <span className={cn(
                          "font-bold text-sm",
                          hasActual ? "text-[#00E676]" : "text-[#737373]"
                        )}>
                          {item.actual || '--'}
                        </span>
                      </div>

                      <div className="h-6 w-px bg-[#262626]"></div>

                      <div className="flex flex-col items-center min-w-[54px]">
                        <span className="text-[10px] text-[#A3A3A3] uppercase">Forecast</span>
                        <span className="font-semibold text-white text-sm">
                          {item.forecast || '--'}
                        </span>
                      </div>

                      <div className="h-6 w-px bg-[#262626]"></div>

                      <div className="flex flex-col items-center min-w-[54px]">
                        <span className="text-[10px] text-[#A3A3A3] uppercase">Previous</span>
                        <span className="text-[#A3A3A3] text-sm">
                          {item.previous || '--'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
