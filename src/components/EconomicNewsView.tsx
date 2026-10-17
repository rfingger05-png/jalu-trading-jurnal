import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, 
  Flame, 
  Info, 
  CheckCircle2, 
  AlertCircle, 
  Calendar,
  Layers,
  ChevronRight,
  TrendingDown
} from 'lucide-react';
import { EconomicNewsItem } from '../lib/newsService';
import { authFetch } from '../utils';
import { cn } from '../lib/utils';

export default function EconomicNewsView() {
  const [news, setNews] = useState<EconomicNewsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  
  // Category filter chips: All Major, FOMC, CPI/PPI, NFP, PCE, GDP
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'FOMC' | 'CPI/PPI' | 'NFP' | 'PCE' | 'GDP'>('ALL');
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'passed'>('upcoming');
  const [nowTime, setNowTime] = useState<Date>(new Date());

  // Live countdown ticker
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

  // Strict Tier-1 Major Gold Catalysts Auto-Filtering:
  // FOMC, CPI & Core CPI, PPI & Core PPI, NFP & Employment Rate, PCE Price Index, GDP Growth Data
  const tier1News = useMemo(() => {
    return news.filter(item => {
      const isUsd = item.country?.toUpperCase() === 'USD';
      if (!isUsd) return false;

      const title = (item.title || '').toLowerCase();
      const isFOMC = title.includes('fomc') || title.includes('fed') || title.includes('federal funds rate');
      const isCPI = title.includes('cpi') || title.includes('consumer price');
      const isPPI = title.includes('ppi') || title.includes('producer price');
      const isNFP = title.includes('non-farm') || title.includes('nonfarm') || title.includes('employment') || title.includes('unemployment rate');
      const isPCE = title.includes('pce') || title.includes('personal consumption');
      const isGDP = title.includes('gdp') || title.includes('gross domestic product');

      const isHighImpact = String(item.impact).toLowerCase() === 'high';

      return (isFOMC || isCPI || isPPI || isNFP || isPCE || isGDP) || isHighImpact;
    });
  }, [news]);

  // Apply Category Filter Chips
  const filteredEvents = useMemo(() => {
    let result = tier1News;

    if (categoryFilter === 'FOMC') {
      result = result.filter(item => {
        const t = item.title.toLowerCase();
        return t.includes('fomc') || t.includes('fed') || t.includes('rate');
      });
    } else if (categoryFilter === 'CPI/PPI') {
      result = result.filter(item => {
        const t = item.title.toLowerCase();
        return t.includes('cpi') || t.includes('ppi') || t.includes('consumer price') || t.includes('producer price');
      });
    } else if (categoryFilter === 'NFP') {
      result = result.filter(item => {
        const t = item.title.toLowerCase();
        return t.includes('non-farm') || t.includes('nonfarm') || t.includes('employment');
      });
    } else if (categoryFilter === 'PCE') {
      result = result.filter(item => {
        const t = item.title.toLowerCase();
        return t.includes('pce') || t.includes('personal consumption');
      });
    } else if (categoryFilter === 'GDP') {
      result = result.filter(item => {
        const t = item.title.toLowerCase();
        return t.includes('gdp') || t.includes('gross domestic');
      });
    }

    if (timeFilter === 'upcoming') {
      result = result.filter(n => !n.is_passed);
    } else if (timeFilter === 'passed') {
      result = result.filter(n => n.is_passed);
    }

    return result;
  }, [tier1News, categoryFilter, timeFilter]);

  // Active selected event or default to next upcoming
  const activeEvent = useMemo(() => {
    if (selectedEventId) {
      const found = tier1News.find(n => (n.id || n.title) === selectedEventId);
      if (found) return found;
    }
    return tier1News.find(n => !n.is_passed) || tier1News[0] || null;
  }, [selectedEventId, tier1News]);

  // Countdown timer for active event
  const countdown = useMemo(() => {
    if (!activeEvent) return null;
    const eventTime = new Date(activeEvent.date).getTime();
    const diff = eventTime - nowTime.getTime();

    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, passed: true };

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, passed: false };
  }, [activeEvent, nowTime]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-white p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#2D2D2D]">
      <div className="max-w-7xl mx-auto space-y-5">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2D2D2D]">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#A3A3A3]">
              <span className="uppercase tracking-wider font-semibold">ECONOMIC CALENDAR</span>
              <span className="text-[#404040]">/</span>
              <span className="text-[#FF3333] font-bold">TIER-1 MAJOR EVENTS ONLY</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white uppercase font-mono mt-0.5">
              High Impact Gold Catalysts (XAUUSD)
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchNewsData(true)}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#2D2D2D] hover:border-[#FF3333] text-xs font-mono text-[#A3A3A3] hover:text-white transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin text-[#FF3333]" : ""} />
              <span>{refreshing ? 'Updating...' : 'Refresh Feed'}</span>
            </button>
          </div>
        </div>

        {/* Category Filter Chips Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1A1A1A] p-2.5 rounded-xl border border-[#2D2D2D]">
          {/* Quick Category Filter Chips: All Major, FOMC, CPI/PPI, NFP, PCE, GDP */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['ALL', 'FOMC', 'CPI/PPI', 'NFP', 'PCE', 'GDP'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-mono font-bold transition-all cursor-pointer",
                  categoryFilter === cat
                    ? "bg-[#FF3333] text-white shadow-[0_0_10px_rgba(255,51,51,0.5)]"
                    : "bg-[#121212] border border-[#262626] text-[#A3A3A3] hover:text-white hover:border-[#3D3D3D]"
                )}
              >
                {cat === 'ALL' ? 'All Major' : cat}
              </button>
            ))}
          </div>

          {/* Time Filter Segmented Toggle */}
          <div className="flex items-center bg-[#121212] p-0.5 rounded-md border border-[#262626] text-xs font-mono shrink-0">
            <button
              onClick={() => setTimeFilter('upcoming')}
              className={cn(
                "px-2.5 py-1 rounded transition-colors cursor-pointer font-bold",
                timeFilter === 'upcoming' ? "bg-[#2D2D2D] text-white" : "text-[#A3A3A3] hover:text-white"
              )}
            >
              Upcoming
            </button>
            <button
              onClick={() => setTimeFilter('passed')}
              className={cn(
                "px-2.5 py-1 rounded transition-colors cursor-pointer font-bold",
                timeFilter === 'passed' ? "bg-[#2D2D2D] text-white" : "text-[#A3A3A3] hover:text-white"
              )}
            >
              Passed
            </button>
            <button
              onClick={() => setTimeFilter('all')}
              className={cn(
                "px-2.5 py-1 rounded transition-colors cursor-pointer font-bold",
                timeFilter === 'all' ? "bg-[#2D2D2D] text-white" : "text-[#A3A3A3] hover:text-white"
              )}
            >
              All
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* Full 2-Column Side-by-Side Layout                        */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left Column (5 Cols): Major Economic Event List */}
          <div className="lg:col-span-5 bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#262626]">
              <span className="text-xs font-mono uppercase tracking-wider text-white font-bold flex items-center gap-2">
                <Layers size={13} className="text-[#FF3333]" />
                Major Events ({filteredEvents.length})
              </span>
              <span className="text-[10px] font-mono text-[#A3A3A3]">
                Sorted by schedule
              </span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-[#A3A3A3] font-mono animate-pulse">
                Loading live economic events...
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#A3A3A3] font-mono">
                Tidak ada agenda berita Tier-1 pada filter ini.
              </div>
            ) : (
              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {filteredEvents.map(item => {
                  const id = item.id || item.title;
                  const isSelected = activeEvent && (activeEvent.id || activeEvent.title) === id;
                  const isHigh = String(item.impact).toLowerCase() === 'high';

                  return (
                    <div
                      key={id}
                      onClick={() => setSelectedEventId(id)}
                      className={cn(
                        "p-3 rounded-lg border transition-all cursor-pointer font-mono text-xs flex flex-col gap-1.5",
                        isSelected
                          ? "bg-[#221515] border-[#FF3333] shadow-xs"
                          : "bg-[#141414] border-[#262626] hover:border-[#3D3D3D] hover:bg-[#1A1A1A]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "w-2 h-2 rounded-full",
                            isHigh ? "bg-[#FF3333]" : "bg-white"
                          )}></span>
                          <span className="text-[10px] text-[#A3A3A3] font-semibold">
                            {item.date_wib} · {item.time_wib} WIB
                          </span>
                        </div>
                        {item.is_passed ? (
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-[#202020] text-[#A3A3A3]">
                            Passed
                          </span>
                        ) : (
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-[#2A1010] text-[#FF3333] font-bold">
                            Upcoming
                          </span>
                        )}
                      </div>

                      <div className="font-bold text-white text-xs leading-snug">
                        {item.title}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#A3A3A3] pt-1 border-t border-[#222222]">
                        <span>Prev: <strong className="text-white">{item.previous || '-'}</strong></span>
                        <span>Frcst: <strong className="text-white">{item.forecast || '-'}</strong></span>
                        {item.actual && (
                          <span className="text-[#FF3333] font-bold">Act: {item.actual}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column (7 Cols): Event Detail Panel & Live Countdown */}
          <div className="lg:col-span-7 bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 sm:p-6 space-y-6 sticky top-20 shadow-md">
            {activeEvent ? (
              <>
                {/* Event Title Header */}
                <div className="space-y-2 pb-4 border-b border-[#2D2D2D]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-[#FF3333] text-white tracking-wider flex items-center gap-1 shadow-xs">
                      <Flame size={12} />
                      TIER-1 MAJOR EVENT
                    </span>
                    <span className="text-xs font-mono text-white font-bold">
                      Currency: USD
                    </span>
                    <span className="text-[#404040]">·</span>
                    <span className="text-xs font-mono text-[#A3A3A3]">
                      Schedule: {activeEvent.date_wib} · {activeEvent.time_wib} WIB
                    </span>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white font-mono">
                    {activeEvent.title}
                  </h2>
                </div>

                {/* Live Interactive Countdown Timer Panel */}
                <div className="p-4 rounded-xl bg-[#121212] border border-[#262626] space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#A3A3A3] uppercase font-bold tracking-wider">
                      Event Countdown:
                    </span>
                    <span className={cn(
                      "font-bold text-xs uppercase px-2 py-0.5 rounded",
                      activeEvent.is_passed ? "bg-[#252525] text-[#A3A3A3]" : "bg-[#201010] text-[#FF3333]"
                    )}>
                      {activeEvent.is_passed ? 'Event Telah Dilewati' : 'Live Timer'}
                    </span>
                  </div>

                  {activeEvent.is_passed ? (
                    <div className="py-4 text-center font-mono text-xs text-[#A3A3A3]">
                      Rilis data ini telah selesai dilewati. Periksa angka Actual vs Forecast di bawah.
                    </div>
                  ) : countdown ? (
                    <div className="grid grid-cols-4 gap-2 font-mono text-center pt-2">
                      <div className="p-2.5 rounded-lg bg-[#181818] border border-[#282828]">
                        <span className="text-2xl sm:text-3xl font-black text-white tabular-nums block">
                          {String(countdown.days).padStart(2, '0')}
                        </span>
                        <span className="text-[10px] text-[#A3A3A3] uppercase">Days</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#181818] border border-[#282828]">
                        <span className="text-2xl sm:text-3xl font-black text-[#FF3333] tabular-nums block">
                          {String(countdown.hours).padStart(2, '0')}
                        </span>
                        <span className="text-[10px] text-[#A3A3A3] uppercase">Hours</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#181818] border border-[#282828]">
                        <span className="text-2xl sm:text-3xl font-black text-white tabular-nums block">
                          {String(countdown.minutes).padStart(2, '0')}
                        </span>
                        <span className="text-[10px] text-[#A3A3A3] uppercase">Mins</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#181818] border border-[#282828]">
                        <span className="text-2xl sm:text-3xl font-black text-[#FF3333] tabular-nums block animate-pulse">
                          {String(countdown.seconds).padStart(2, '0')}
                        </span>
                        <span className="text-[10px] text-[#A3A3A3] uppercase">Secs</span>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Forecast vs Previous vs Actual Numbers */}
                <div className="space-y-2">
                  <span className="text-xs font-mono uppercase font-bold text-white tracking-wider">
                    Forecast vs Previous vs Actual
                  </span>

                  <div className="grid grid-cols-3 gap-3 font-mono text-center">
                    <div className="p-3 rounded-lg bg-[#141414] border border-[#262626]">
                      <span className="text-[10px] text-[#A3A3A3] uppercase block mb-1">Previous</span>
                      <span className="text-base font-bold text-white tabular-nums">
                        {activeEvent.previous || '--'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#141414] border border-[#262626]">
                      <span className="text-[10px] text-[#A3A3A3] uppercase block mb-1">Forecast</span>
                      <span className="text-base font-bold text-white tabular-nums">
                        {activeEvent.forecast || '--'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#141414] border border-[#FF3333]/40">
                      <span className="text-[10px] text-[#FF3333] uppercase block mb-1 font-bold">Actual</span>
                      <span className="text-base font-black text-white tabular-nums">
                        {activeEvent.actual || 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Market Impact Details (Specifically for XAUUSD/Gold) */}
                <div className="p-4 rounded-xl bg-[#141414] border border-[#2D2D2D] space-y-3 font-mono text-xs">
                  <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider">
                    <TrendingDown size={14} className="text-[#FF3333]" />
                    <span>Market Impact Logic (XAUUSD / Gold)</span>
                  </div>

                  <p className="text-[#A3A3A3] leading-relaxed text-[11px]">
                    <strong className="text-white">Prinsip Korelasi USD vs Emas:</strong> Nilai aktual USD yang lebih tinggi dari Forecast (Bullish USD) umumnya memicu tekanan jual tajam pada emas (<strong className="text-[#FF3333]">Bearish XAUUSD / SELL</strong>). Sebaliknya, rilis data USD yang mengecewakan atau di bawah proyeksi memicu reli dorongan harga emas (<strong className="text-white">Bullish XAUUSD / BUY</strong>).
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#222222] text-[11px]">
                    <div className="p-2.5 rounded bg-[#181818] border border-[#282828] space-y-1">
                      <div className="text-white font-bold">Actual &gt; Forecast</div>
                      <div className="text-[#A3A3A3]">USD Menguat · Potensi Emas Anjlok (Tekanan SELL)</div>
                    </div>

                    <div className="p-2.5 rounded bg-[#181818] border border-[#282828] space-y-1">
                      <div className="text-white font-bold">Actual &lt; Forecast</div>
                      <div className="text-[#A3A3A3]">USD Melemah · Potensi Emas Reli Naik (Peluang BUY)</div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-20 text-center text-xs text-[#A3A3A3] font-mono">
                Pilih salah satu agenda berita di kolom kiri untuk melihat rincian kalkulasi dan live timer.
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
