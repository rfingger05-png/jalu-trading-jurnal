import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Calendar, Clock, AlertTriangle, CheckCircle2, ChevronRight, ShieldAlert, Sparkles, Filter } from 'lucide-react';
import { EconomicNewsItem } from '../lib/newsService';
import { authFetch } from '../utils';

interface EconomicCalendarModalProps {
  onClose: () => void;
}

export default function EconomicCalendarModal({ onClose }: EconomicCalendarModalProps) {
  const [news, setNews] = useState<EconomicNewsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'all' | 'passed' | 'upcoming' | 'high'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

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

  // Filtered news
  const filteredNews = React.useMemo(() => {
    return news.filter(item => {
      // Impact & passed filter
      if (filterMode === 'passed' && !item.is_passed) return false;
      if (filterMode === 'upcoming' && item.is_passed) return false;
      if (filterMode === 'high' && String(item.impact).toLowerCase() !== 'high') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.title.toLowerCase().includes(q) || item.country.toLowerCase().includes(q);
      }
      return true;
    });
  }, [news, filterMode, searchQuery]);

  // Next upcoming event for gold
  const nextEvent = React.useMemo(() => {
    return news.find(item => !item.is_passed && String(item.impact).toLowerCase() === 'high') || 
           news.find(item => !item.is_passed);
  }, [news]);

  const passedCount = news.filter(n => n.is_passed).length;
  const upcomingCount = news.filter(n => !n.is_passed).length;
  const highCount = news.filter(n => String(n.impact).toLowerCase() === 'high').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#0c111d] border border-slate-200 dark:border-slate-800 w-full max-w-3xl rounded-sm shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#090d16] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-sm">
              🥇
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white uppercase">
                  Kalender News XAUUSD (Gold Only)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  USD High/Med Impact
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Berita berdampak langsung ke Emas. Dilengkapi status <b className="text-emerald-500">√ Sudah Dilewati</b> dalam 1 bulan terakhir.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchNewsData(true)}
              disabled={refreshing}
              className="p-1.5 rounded-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
              title="Refresh Berita"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin text-cyan-500" : ""} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Next High Impact News Banner */}
        {nextEvent && (
          <div className="px-5 py-2.5 bg-linear-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="font-bold text-amber-600 dark:text-amber-400 uppercase text-[10px] tracking-wider">
                Event Rilis Berikutnya:
              </span>
              <span className="font-bold text-slate-800 dark:text-white">
                {nextEvent.title} ({nextEvent.country})
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-300">
              <Clock size={12} className="text-amber-500" />
              <span>{nextEvent.date_wib}</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{nextEvent.time_wib}</span>
            </div>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="p-3 sm:px-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0c111d] flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-semibold">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-sm whitespace-nowrap transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Semua XAUUSD ({news.length})
            </button>
            <button
              onClick={() => setFilterMode('upcoming')}
              className={`px-3 py-1.5 rounded-sm whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'upcoming'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-cyan-600'
              }`}
            >
              <span>⏳ Akan Datang</span>
              <span className="text-[10px] opacity-80 font-mono">({upcomingCount})</span>
            </button>
            <button
              onClick={() => setFilterMode('passed')}
              className={`px-3 py-1.5 rounded-sm whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'passed'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-emerald-600'
              }`}
            >
              <span>√ Sudah Dilewati (1 Bln)</span>
              <span className="text-[10px] opacity-80 font-mono">({passedCount})</span>
            </button>
            <button
              onClick={() => setFilterMode('high')}
              className={`px-3 py-1.5 rounded-sm whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'high'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-rose-600'
              }`}
            >
              <span>🔴 High Impact</span>
              <span className="text-[10px] opacity-80 font-mono">({highCount})</span>
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Cari berita (CPI, NFP, Fed)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-sm bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white w-full sm:w-56 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* News List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {loading ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw size={24} className="animate-spin text-amber-500" />
              <span className="text-xs font-mono">Memuat Kalender Berita XAUUSD...</span>
            </div>
          ) : filteredNews.length === 0 ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500">
              <Calendar size={28} className="mx-auto mb-2 opacity-50 text-slate-400" />
              <p className="text-xs font-semibold">Tidak ada berita yang cocok dengan filter ini.</p>
            </div>
          ) : (
            filteredNews.map((item, idx) => {
              const isHigh = String(item.impact).toLowerCase() === 'high';
              const isPassed = item.is_passed;

              return (
                <div
                  key={item.id || idx}
                  className={`p-3.5 rounded-sm border transition-all ${
                    isPassed
                      ? 'bg-white dark:bg-[#0e1422] border-slate-200 dark:border-slate-800/80 opacity-90'
                      : isHigh
                      ? 'bg-rose-50/20 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 shadow-2xs'
                      : 'bg-white dark:bg-[#0e1422] border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    
                    {/* Left: Status, Currency Flag, and Title */}
                    <div className="flex items-start gap-2.5">
                      <div className="pt-0.5 shrink-0">
                        {isPassed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 size={11} />
                            <span>√ Sudah Dilewati</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                            <Clock size={11} />
                            <span>⏳ Akan Datang</span>
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">🇺🇸</span>
                          <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300">
                            {item.country}
                          </span>
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-xs border ${
                            isHigh 
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' 
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          }`}>
                            {isHigh ? 'High Impact' : 'Medium Impact'}
                          </span>
                          <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded-xs border border-amber-500/20">
                            XAUUSD Focus
                          </span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-1">
                          {item.title}
                        </h4>
                      </div>
                    </div>

                    {/* Right: Date, Time & Numbers */}
                    <div className="flex flex-col sm:items-end gap-1 shrink-0 text-left sm:text-right pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                      <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 font-semibold flex items-center sm:justify-end gap-1">
                        <Calendar size={11} className="text-slate-400" />
                        <span>{item.date_wib}</span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="font-bold text-slate-900 dark:text-white">{item.time_wib}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        {item.actual && (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            Actual: <b>{item.actual}</b>
                          </span>
                        )}
                        {item.forecast && (
                          <span>Forecast: <b className="text-slate-700 dark:text-slate-200">{item.forecast}</b></span>
                        )}
                        {item.previous && (
                          <span>Prev: <b className="text-slate-700 dark:text-slate-200">{item.previous}</b></span>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#090d16] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={13} className="text-amber-500 shrink-0" />
            <span>XAUUSD sangat reaktif saat event High Impact. Disarankan hindari entry 15 menit sebelum & sesudah rilis.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold rounded-sm hover:opacity-90 transition-opacity cursor-pointer self-end sm:self-auto"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}
