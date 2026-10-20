import React, { useState, useEffect } from 'react';
import { Trade, User, Transaction } from './types';
import TradeForm from './components/TradeForm';
import Dashboard from './components/Dashboard';
import History from './components/History';
import AnalyticsView from './components/AnalyticsView';
import EconomicNewsView from './components/EconomicNewsView';
import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import Settings from './components/Settings';
import Calculators from './components/Calculators';
import PropFirm from './components/PropFirm';
import PublicProfile from './components/PublicProfile';
import BankingModal from './components/BankingModal';
import EconomicCalendarModal from './components/EconomicCalendarModal';
import TradeGallery from './components/TradeGallery';
import { 
  Menu, 
  X, 
  Moon, 
  Sun, 
  Wallet, 
  BarChart2, 
  PlusCircle, 
  History as HistoryIcon, 
  Shield, 
  Calculator, 
  Settings as SettingsIcon,
  LogOut,
  TrendingUp,
  User as UserIcon,
  Newspaper,
  Images,
  Activity,
  Send
} from 'lucide-react';
import { formatCurrency, authFetch, setAuthToken } from './utils';

export default function App() {
  const [isPublicRoute, setIsPublicRoute] = useState(false);
  const [publicUsername, setPublicUsername] = useState('');

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/p/')) {
      const parts = path.split('/');
      if (parts.length >= 3 && parts[2]) {
        setIsPublicRoute(true);
        setPublicUsername(parts[2]);
      }
    }
  }, []);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLoading, setUserLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  // Core navigation routes housed strictly via Hamburger Menu:
  // 'dashboard' | 'history' | 'analytics' | 'news' | 'settings' | 'log' | 'gallery' | 'calculators' | 'propfirm' | 'admin'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'analytics' | 'news' | 'settings' | 'log' | 'gallery' | 'calculators' | 'propfirm' | 'admin'>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showBankingModal, setShowBankingModal] = useState(false);
  const [showNewsModal, setShowNewsModal] = useState(false);

  const tradesWithImagesCount = trades.filter(t => Boolean(t.image || t.image_url)).length;

  // Dark Mode is the primary default
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  const [telegramBotInfo, setTelegramBotInfo] = useState<{ authenticated: boolean; username: string | null } | null>(null);

  useEffect(() => {
    authFetch('/api/telegram/status')
      .then(r => r.json())
      .then(d => {
        if (d?.authenticated) {
          setTelegramBotInfo({ authenticated: true, username: d.username });
        }
      })
      .catch(() => {});
  }, []);

  const fetchUser = async () => {
    try {
      const res = await authFetch('/api/auth/me?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else if (res.status === 401) {
        setAuthToken(null);
        setUser(null);
      }
    } catch(e) {
      // Ignored
    } finally {
      setUserLoading(false);
    }
  };

  useEffect(() => {
    if (!isPublicRoute) {
      fetchUser();
    }
  }, [isPublicRoute]);

  const fetchTrades = async () => {
    try {
      const [tradesRes, transactionsRes] = await Promise.all([
        authFetch('/api/trades?t=' + Date.now()),
        authFetch('/api/transactions?t=' + Date.now())
      ]);
      if (tradesRes.status === 401 || transactionsRes.status === 401) {
        setAuthToken(null);
        setUser(null);
        return;
      }
      if (tradesRes.ok) {
        setTrades(await tradesRes.json());
      }
      if (transactionsRes.ok) {
        setTransactions(await transactionsRes.json());
      }
    } catch (error) {
      // Gracefully handle
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTrades();
      const interval = setInterval(() => {
        fetchTrades();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleTradeAdded = () => {
    fetchTrades();
    setActiveTab('history');
  };

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch(e) {
      // Ignored
    } finally {
      setAuthToken(null);
      setUser(null);
      setTrades([]);
      setTransactions([]);
    }
  };

  const handleUserLocalUpdate = (updates: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  };

  if (isPublicRoute) {
    return <PublicProfile username={publicUsername} />;
  }

  if (userLoading) {
    return (
      <div className="bg-[#0D0D0D] min-h-screen flex items-center justify-center font-mono text-white">
        <div className="text-xs font-semibold tracking-wider flex items-center gap-2.5">
          <div className="w-4 h-4 border-2 border-[#FF3333] border-t-transparent rounded-full animate-spin"></div>
          <span>Memuat JURNALKU...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  // Calculate current equity
  const baseEquity = user.prop_firm_enabled 
    ? (user.prop_firm_balance || 10000) 
    : (user.initial_balance ?? (trades.length > 0 ? trades[trades.length - 1].account_balance : 10000));
  
  const totalDeposits = transactions.filter(t => t.type === 'deposit').reduce((acc, t) => acc + t.amount, 0);
  const totalWithdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((acc, t) => acc + t.amount, 0);

  let currentEquity = trades.length > 0
    ? trades.reduce((acc, t) => acc + (t.realized_pl || 0), baseEquity)
    : baseEquity;
  
  currentEquity = currentEquity + totalDeposits - totalWithdrawals;

  if (user.prop_firm_enabled) {
    currentEquity -= (user.prop_firm_payout_total || 0);
  }

  return (
    <div className="bg-[#0D0D0D] min-h-screen flex flex-col font-sans text-white">
      
      {/* Global Navigation Header — Strict Red-Black-White, JK JURNALKU Branding */}
      <header className="h-14 shrink-0 border-b border-[#262626] bg-[#000000]/95 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between gap-4">
        
        {/* Left: Official Branding "JK JURNALKU" (ikon kotak gelap dengan huruf putih "J" dan merah "K", berdampingan dengan teks "JURNAL" putih dan "KU" merah) */}
        <div 
          className="flex items-center gap-2.5 cursor-pointer select-none group" 
          onClick={() => setActiveTab('dashboard')}
        >
          <div className="w-8 h-8 rounded-lg bg-[#141414] border border-[#262626] text-white flex items-center justify-center font-mono font-black text-xs tracking-tighter shadow-inner group-hover:border-[#FF3333] transition-colors">
            <span className="text-white">J</span><span className="text-[#FF3333]">K</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black tracking-tight font-mono">
              <span className="text-white">JURNAL</span><span className="text-[#FF3333]">KU</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#141414] text-[#A3A3A3] border border-[#262626] font-semibold">
              XAUUSD
            </span>
          </div>
        </div>

        {/* Desktop Quick Nav Tabs (Direct 6 Modules Access) */}
        <nav className="hidden lg:flex items-center gap-1 font-mono text-xs">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'history', label: 'History' },
            { id: 'gallery', label: 'Gallery Chart' },
            { id: 'calculators', label: 'Lot & MM' },
            { id: 'news', label: 'News (Gold)' },
            { id: 'analytics', label: 'Analytics' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeTab === item.id
                  ? 'bg-[#FF3333] text-white shadow-xs'
                  : 'text-[#A3A3A3] hover:text-white hover:bg-[#141414]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right: Quick Equity Pill, Theme Toggle, and Hamburger Menu Icon */}
        <div className="flex items-center gap-2.5 text-xs shrink-0">
          
          {/* Telegram Indicator (if connected) */}
          {telegramBotInfo?.authenticated && (
            <div 
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-[#A3A3A3] border border-[#262626] rounded-md bg-[#141414]"
              title="Telegram Bot Aktif"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFFFFF] animate-pulse"></span>
              <span>@{telegramBotInfo.username}</span>
            </div>
          )}

          {/* Quick Equity Pill / Banking Trigger */}
          <button
            onClick={() => setShowBankingModal(true)}
            className="px-3 py-1.5 rounded-md border border-[#262626] bg-[#141414] hover:border-[#3D3D3D] transition-colors flex items-center gap-2 text-white cursor-pointer"
            title="Kelola Saldo & Transaksi"
          >
            <Wallet size={13} className="text-[#A3A3A3]" />
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider font-semibold">Equity</span>
              <span className="font-extrabold tabular-nums text-white">
                {formatCurrency(currentEquity, user.currency)}
              </span>
            </div>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 text-[#A3A3A3] hover:text-white rounded-md border border-[#262626] bg-[#141414] hover:border-[#3D3D3D] transition-colors cursor-pointer"
            title="Toggle Dark / Light Mode"
          >
            {darkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-sky-400" />}
          </button>

          {/* Hamburger Menu Trigger (3-line icon) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`p-2 rounded-md border transition-colors cursor-pointer flex items-center justify-center ${
              menuOpen 
                ? 'border-[#FF3333] bg-[#FF3333] text-white' 
                : 'border-[#262626] bg-[#141414] text-white hover:border-[#FF3333]'
            }`}
            title="Menu Navigasi"
            aria-label="Open Navigation"
          >
            {menuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>

        </div>
      </header>

      {/* Hamburger Menu Drawer Navigation (Houses all 6 modules & utilities) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/85 backdrop-blur-xs transition-opacity" 
            onClick={() => setMenuOpen(false)}
          ></div>

          {/* Drawer Sidebar */}
          <div className="relative ml-auto w-80 bg-[#121212] h-full shadow-2xl p-6 flex flex-col z-50 border-l border-[#262626] animate-in slide-in-from-right duration-200">
            
            {/* Drawer Header with Official Logo */}
            <div className="flex items-center justify-between pb-4 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#141414] border border-[#262626] text-white flex items-center justify-center font-mono font-black text-xs">
                  <span className="text-white">J</span><span className="text-[#FF3333]">K</span>
                </div>
                <span className="font-black text-sm font-mono tracking-tight">
                  <span className="text-white">JURNAL</span><span className="text-[#FF3333]">KU</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#141414] text-[#A3A3A3] border border-[#262626]">
                  XAUUSD
                </span>
              </div>
              <button 
                onClick={() => setMenuOpen(false)} 
                className="text-[#A3A3A3] hover:text-white p-1 rounded hover:bg-[#141414] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Account Quick Card */}
            <div className="mt-4 p-3 rounded-lg bg-[#141414] border border-[#262626] flex items-center justify-between font-mono text-xs">
              <div className="flex flex-col">
                <span className="text-[10px] text-[#A3A3A3] uppercase">Akun Trader</span>
                <span className="font-bold text-white">@{user.username}</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[10px] text-[#A3A3A3] uppercase">Mata Uang</span>
                <span className="font-bold text-white">{user.currency}</span>
              </div>
            </div>

            {/* Core 6 Modules Navigation */}
            <div className="flex flex-col gap-1.5 py-4 text-xs font-mono overflow-y-auto">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#737373] px-2 mb-1">
                6 Modul Aplikasi
              </span>

              {/* Modul A: Dashboard (Quick Lot Calculator & Overview) */}
              <button
                onClick={() => { setActiveTab('dashboard'); setMenuOpen(false); }}
                className={`p-2.5 rounded-lg text-left flex items-center gap-3 cursor-pointer transition-colors ${
                  activeTab === 'dashboard' 
                    ? 'bg-[#FF3333] text-white font-bold' 
                    : 'text-[#A3A3A3] hover:text-white hover:bg-[#141414]'
                }`}
              >
                <BarChart2 size={16} />
                <span>Modul A: Dashboard / Quick Lot</span>
              </button>

              {/* Modul B: Trade History (Full Logs & CSV Export) */}
              <button
                onClick={() => { setActiveTab('history'); setMenuOpen(false); }}
                className={`p-2.5 rounded-lg text-left flex items-center gap-3 cursor-pointer transition-colors ${
                  activeTab === 'history' 
                    ? 'bg-[#FF3333] text-white font-bold' 
                    : 'text-[#A3A3A3] hover:text-white hover:bg-[#141414]'
                }`}
              >
                <HistoryIcon size={16} />
                <span>Modul B: Trade History (Closed)</span>
              </button>

              {/* Modul C: Gallery Chart (Before & After Grid) */}
              <button
                onClick={() => { setActiveTab('gallery'); setMenuOpen(false); }}
                className={`p-2.5 rounded-lg text-left flex items-center justify-between cursor-pointer transition-colors ${
                  activeTab === 'gallery' 
                    ? 'bg-[#FF3333] text-white font-bold' 
                    : 'text-[#A3A3A3] hover:text-white hover:bg-[#141414]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Images size={16} />
                  <span>Modul C: Gallery Chart (B/A)</span>
                </div>
                {tradesWithImagesCount > 0 && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#000000] text-white font-bold border border-[#262626]">
                    {tradesWithImagesCount}
                  </span>
                )}
              </button>

              {/* Modul D: Lot Auto-Calculator & MM Compounding */}
              <button
                onClick={() => { setActiveTab('calculators'); setMenuOpen(false); }}
                className={`p-2.5 rounded-lg text-left flex items-center gap-3 cursor-pointer transition-colors ${
                  activeTab === 'calculators' 
                    ? 'bg-[#FF3333] text-white font-bold' 
                    : 'text-[#A3A3A3] hover:text-white hover:bg-[#141414]'
                }`}
              >
                <Calculator size={16} />
                <span>Modul D: Lot & MM Compounding</span>
              </button>

              {/* Modul E: Economic News (Tier-1 Major Events) */}
              <button
                onClick={() => { setActiveTab('news'); setMenuOpen(false); }}
                className={`p-2.5 rounded-lg text-left flex items-center justify-between cursor-pointer transition-colors ${
                  activeTab === 'news' 
                    ? 'bg-[#FF3333] text-white font-bold' 
                    : 'text-[#A3A3A3] hover:text-white hover:bg-[#141414]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Newspaper size={16} />
                  <span>Modul E: Economic News (Gold)</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-[#FF3333] animate-pulse"></span>
              </button>

              {/* Modul F: Analytics / Weekly Review */}
              <button
                onClick={() => { setActiveTab('analytics'); setMenuOpen(false); }}
                className={`p-2.5 rounded-lg text-left flex items-center gap-3 cursor-pointer transition-colors ${
                  activeTab === 'analytics' 
                    ? 'bg-[#FF3333] text-white font-bold' 
                    : 'text-[#A3A3A3] hover:text-white hover:bg-[#141414]'
                }`}
              >
                <Activity size={16} />
                <span>Modul F: Analytics & Review</span>
              </button>
            </div>

            {/* Utility Actions Section */}
            <div className="flex flex-col gap-1.5 pt-3 border-t border-[#262626] text-xs font-mono">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#737373] px-2 mb-1">
                Aksi & Pengaturan
              </span>

              {/* + Log Trade */}
              <button
                onClick={() => { setActiveTab('log'); setMenuOpen(false); }}
                className={`p-2 rounded-lg text-left flex items-center gap-2.5 cursor-pointer transition-colors ${
                  activeTab === 'log' ? 'bg-[#FF3333] text-white font-bold' : 'text-[#A3A3A3] hover:text-white'
                }`}
              >
                <PlusCircle size={15} />
                <span>+ Catat Trade Baru</span>
              </button>

              {/* Banking / Saldo */}
              <button
                onClick={() => { setShowBankingModal(true); setMenuOpen(false); }}
                className="p-2 rounded-lg text-left flex items-center gap-2.5 text-[#A3A3A3] hover:text-white cursor-pointer"
              >
                <Wallet size={15} />
                <span>Deposit / Withdraw Saldo</span>
              </button>

              {/* Settings */}
              <button
                onClick={() => { setActiveTab('settings'); setMenuOpen(false); }}
                className={`p-2 rounded-lg text-left flex items-center gap-2.5 cursor-pointer transition-colors ${
                  activeTab === 'settings' ? 'bg-[#FF3333] text-white font-bold' : 'text-[#A3A3A3] hover:text-white'
                }`}
              >
                <SettingsIcon size={15} />
                <span>Pengaturan Akun & Risiko</span>
              </button>

              {/* Prop Firm (if enabled) */}
              {user.prop_firm_enabled && (
                <button
                  onClick={() => { setActiveTab('propfirm'); setMenuOpen(false); }}
                  className={`p-2 rounded-lg text-left flex items-center gap-2.5 cursor-pointer transition-colors ${
                    activeTab === 'propfirm' ? 'bg-[#FF3333] text-white font-bold' : 'text-[#A3A3A3] hover:text-white'
                  }`}
                >
                  <Shield size={15} />
                  <span>Prop Firm Challenge</span>
                </button>
              )}

              {/* Admin Panel (if admin) */}
              {user.role === 'admin' && (
                <button
                  onClick={() => { setActiveTab('admin'); setMenuOpen(false); }}
                  className="p-2 rounded-lg text-left flex items-center gap-2.5 text-[#FF3333] font-semibold cursor-pointer"
                >
                  <UserIcon size={15} />
                  <span>Admin Panel</span>
                </button>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="mt-auto pt-4 border-t border-[#2D2D2D] flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-1.5 text-[#A3A3A3]">
                <Send size={12} className="text-sky-400" />
                <span className="text-[11px]">{telegramBotInfo?.authenticated ? `@${telegramBotInfo.username}` : 'Bot Standby'}</span>
              </div>
              <button 
                onClick={handleLogout} 
                className="text-xs text-[#FF3333] hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <LogOut size={13} />
                <span>Logout</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#A3A3A3] text-xs font-mono font-semibold tracking-wider gap-2">
            <div className="w-5 h-5 border-2 border-[#FF3333] border-t-transparent rounded-full animate-spin"></div>
            Memuat data transaksi...
          </div>
        ) : (
          <>
            {/* Route 1: Dashboard (Main Overview) */}
            {activeTab === 'dashboard' && (
              <Dashboard 
                trades={trades} 
                user={user} 
                currentEquity={currentEquity}
                onOpenLogTrade={() => setActiveTab('log')}
                onOpenBanking={() => setShowBankingModal(true)}
                onOpenHistory={() => setActiveTab('history')}
                onOpenCalculators={() => setActiveTab('calculators')}
              />
            )}

            {/* Route 2: Trade History (Full Logs & CSV Export) */}
            {activeTab === 'history' && (
              <History 
                trades={trades} 
                onTradeUpdated={fetchTrades} 
                user={user} 
                onOpenGallery={() => setActiveTab('gallery')}
              />
            )}

            {/* Route 3: Analytics & Weekly Review */}
            {activeTab === 'analytics' && (
              <AnalyticsView
                trades={trades}
                user={user}
                startingBalance={baseEquity}
                currentEquity={currentEquity}
                onOpenGallery={() => setActiveTab('gallery')}
                onOpenHistory={() => setActiveTab('history')}
                onUserUpdate={fetchUser}
              />
            )}

            {/* Route 4: Economic News (Major Events Only) */}
            {activeTab === 'news' && (
              <EconomicNewsView />
            )}

            {/* Route 5: Settings */}
            {activeTab === 'settings' && (
              <Settings 
                user={user} 
                onUserUpdate={() => {
                  setTrades([]);
                  setTransactions([]);
                  fetchUser();
                  fetchTrades();
                }} 
                onLocalUpdate={handleUserLocalUpdate} 
                onLogout={handleLogout} 
              />
            )}

            {/* Utility View: Log Trade */}
            {activeTab === 'log' && (
              <div className="flex-1 flex justify-center p-4 sm:p-8 overflow-y-auto bg-[#0D0D0D]">
                <div className="w-full max-w-2xl bg-[#1A1A1A] border border-[#2D2D2D] p-6 sm:p-8 rounded-xl shadow-xs">
                  <TradeForm 
                    onTradeAdded={handleTradeAdded} 
                    currentEquity={currentEquity} 
                    user={user} 
                  />
                </div>
              </div>
            )}

            {/* Utility View: Chart Gallery */}
            {activeTab === 'gallery' && (
              <TradeGallery 
                trades={trades} 
                user={user} 
                onTradeUpdated={fetchTrades} 
                onOpenLogTrade={() => setActiveTab('log')}
              />
            )}

            {/* Utility View: Lot Size Calculator */}
            {activeTab === 'calculators' && (
              <Calculators currentEquity={currentEquity} user={user} />
            )}

            {/* Utility View: Prop Firm Challenge */}
            {activeTab === 'propfirm' && (
              <PropFirm 
                trades={trades} 
                user={user} 
                onLocalUpdate={handleUserLocalUpdate} 
                onTradeAdded={fetchTrades} 
              />
            )}

            {/* Utility View: Admin Panel */}
            {activeTab === 'admin' && (
              <AdminPanel />
            )}
          </>
        )}
      </main>

      {/* Banking Modal (Deposit / Withdraw) */}
      {showBankingModal && (
        <BankingModal
          onClose={() => setShowBankingModal(false)}
          onTransactionComplete={() => {
            setShowBankingModal(false);
            fetchTrades();
          }}
        />
      )}

      {/* Economic News Modal fallback */}
      {showNewsModal && (
        <EconomicCalendarModal
          onClose={() => setShowNewsModal(false)}
        />
      )}

    </div>
  );
}
