import React, { useState, useEffect } from 'react';
import { Trade, User, Transaction } from './types';
import TradeForm from './components/TradeForm';
import Dashboard from './components/Dashboard';
import History from './components/History';
import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import Settings from './components/Settings';
import Calculators from './components/Calculators';
import PropFirm from './components/PropFirm';
import PublicProfile from './components/PublicProfile';
import BankingModal from './components/BankingModal';
import EconomicCalendarModal from './components/EconomicCalendarModal';
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
  Newspaper
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'log' | 'history' | 'propfirm' | 'calculators' | 'admin' | 'settings'>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showBankingModal, setShowBankingModal] = useState(false);
  const [showNewsModal, setShowNewsModal] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
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
      // Not logged in or network error
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
      // Gracefully handle network blips
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
      <div className="bg-slate-50 dark:bg-[#070b13] min-h-screen flex items-center justify-center font-sans text-slate-600 dark:text-slate-300">
        <div className="text-xs font-semibold tracking-wider flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
          Loading Trading Journal...
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
    <div className="bg-slate-50 dark:bg-[#070b13] min-h-screen flex flex-col font-sans text-slate-900 dark:text-slate-100">
      
      {/* Top Navigation Header */}
      <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#090d16]/95 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between gap-6">
        
        {/* Zone 1: Brand & Workspace Mode */}
        <div className="flex items-center gap-3 shrink-0 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
          <div className="w-7 h-7 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-mono font-bold text-xs tracking-tighter shadow-xs">
            TT
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              TRADING TERMINAL
            </span>
            <span className="text-slate-300 dark:text-slate-700 select-none">/</span>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
              {user.current_mode}
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 text-xs font-medium">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'dashboard'
                ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart2 size={14} />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('log')}
            className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'log'
                ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <PlusCircle size={14} />
            <span>Log Trade</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <HistoryIcon size={14} />
            <span>History</span>
          </button>

          <button
            onClick={() => setActiveTab('propfirm')}
            className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'propfirm'
                ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Shield size={14} />
            <span>Prop Firm</span>
          </button>

          <button
            onClick={() => setActiveTab('calculators')}
            className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'calculators'
                ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Calculator size={14} />
            <span>Calculators</span>
          </button>

          <button
            onClick={() => setShowNewsModal(true)}
            className="px-3 py-1.5 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 font-bold border border-amber-500/20 cursor-pointer"
            title="Kalender Berita Emas (XAUUSD)"
          >
            <Newspaper size={14} />
            <span>News XAUUSD</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <SettingsIcon size={14} />
            <span>Settings</span>
          </button>

          {user.role === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap font-medium ${
                activeTab === 'admin'
                  ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 font-semibold'
                  : 'text-amber-600 dark:text-amber-400 hover:underline'
              }`}
            >
              Admin
            </button>
          )}
        </nav>

        {/* Zone 3: Financial Telemetry & Account Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3 text-xs shrink-0">
          
          {/* Telegram Bot Live Status */}
          {telegramBotInfo?.authenticated && (
            <button
              onClick={() => setActiveTab('settings')}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 rounded bg-slate-50/50 dark:bg-slate-900/50 transition-colors"
              title="Telegram Bot Connected"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>@{telegramBotInfo.username}</span>
            </button>
          )}

          {/* Equity & Deposit/Withdraw Quick Trigger */}
          <button
            onClick={() => setShowBankingModal(true)}
            className="px-3 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors flex items-center gap-2 text-slate-700 dark:text-slate-200"
            title="Manage Balance & Transactions"
          >
            <Wallet size={13} className="text-slate-400" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Equity</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                {formatCurrency(currentEquity, user.currency)}
              </span>
            </div>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors"
            title="Toggle Dark / Light Theme"
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* User & Logout */}
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{user.username}</span>
            <button
              onClick={handleLogout}
              className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded border border-slate-200 dark:border-slate-800"
          >
            {menuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>

        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMenuOpen(false)}></div>
          <div className="relative ml-auto w-72 bg-white dark:bg-[#090d16] h-full shadow-2xl p-6 flex flex-col z-50 border-l border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold text-sm text-slate-900 dark:text-white">Navigation</span>
              <button onClick={() => setMenuOpen(false)} className="text-slate-400 p-1"><X size={18} /></button>
            </div>

            <div className="flex flex-col gap-1 py-4 text-xs font-medium">
              <button
                onClick={() => { setActiveTab('dashboard'); setMenuOpen(false); }}
                className={`p-2.5 rounded text-left flex items-center gap-2.5 ${activeTab === 'dashboard' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <BarChart2 size={16} />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => { setActiveTab('log'); setMenuOpen(false); }}
                className={`p-2.5 rounded text-left flex items-center gap-2.5 ${activeTab === 'log' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <PlusCircle size={16} />
                <span>Log Trade</span>
              </button>

              <button
                onClick={() => { setActiveTab('history'); setMenuOpen(false); }}
                className={`p-2.5 rounded text-left flex items-center gap-2.5 ${activeTab === 'history' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <HistoryIcon size={16} />
                <span>Trade History</span>
              </button>

              <button
                onClick={() => { setActiveTab('propfirm'); setMenuOpen(false); }}
                className={`p-2.5 rounded text-left flex items-center gap-2.5 ${activeTab === 'propfirm' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <Shield size={16} />
                <span>Prop Firm Challenge</span>
              </button>

              <button
                onClick={() => { setActiveTab('calculators'); setMenuOpen(false); }}
                className={`p-2.5 rounded text-left flex items-center gap-2.5 ${activeTab === 'calculators' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <Calculator size={16} />
                <span>Calculators</span>
              </button>

              <button
                onClick={() => { setShowNewsModal(true); setMenuOpen(false); }}
                className="p-2.5 rounded text-left flex items-center gap-2.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 font-bold border border-amber-500/20"
              >
                <Newspaper size={16} />
                <span>News XAUUSD (Gold)</span>
              </button>

              <button
                onClick={() => { setActiveTab('settings'); setMenuOpen(false); }}
                className={`p-2.5 rounded text-left flex items-center gap-2.5 ${activeTab === 'settings' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <SettingsIcon size={16} />
                <span>Settings</span>
              </button>

              {user.role === 'admin' && (
                <button
                  onClick={() => { setActiveTab('admin'); setMenuOpen(false); }}
                  className="p-2.5 rounded text-left flex items-center gap-2.5 text-amber-600 dark:text-amber-400 font-semibold"
                >
                  <UserIcon size={16} />
                  <span>Admin Panel</span>
                </button>
              )}
            </div>

            <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold">{user.username}</span>
              <button onClick={handleLogout} className="text-xs text-rose-500 font-semibold flex items-center gap-1">
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
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs font-semibold tracking-wider gap-2">
            <div className="w-5 h-5 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
            Loading trade data...
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <Dashboard 
                trades={trades} 
                user={user} 
                transactions={transactions} 
                onOpenLogTrade={() => setActiveTab('log')}
                onOpenBanking={() => setShowBankingModal(true)}
                onOpenHistory={() => setActiveTab('history')}
              />
            )}

            {activeTab === 'log' && (
              <div className="flex-1 flex justify-center p-4 sm:p-8 overflow-y-auto">
                <div className="w-full max-w-2xl bg-white dark:bg-[#0c1220] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-md shadow-xs">
                  <TradeForm 
                    onTradeAdded={handleTradeAdded} 
                    currentEquity={currentEquity} 
                    user={user} 
                  />
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <History trades={trades} onTradeUpdated={fetchTrades} user={user} />
            )}

            {activeTab === 'propfirm' && (
              <PropFirm 
                trades={trades} 
                user={user} 
                onLocalUpdate={handleUserLocalUpdate} 
                onTradeAdded={fetchTrades} 
              />
            )}

            {activeTab === 'calculators' && (
              <Calculators currentEquity={currentEquity} user={user} />
            )}

            {activeTab === 'settings' && (
              <Settings 
                user={user} 
                onUserUpdate={fetchUser} 
                onLocalUpdate={handleUserLocalUpdate} 
                onModeChange={fetchTrades} 
                onLogout={handleLogout} 
              />
            )}

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

      {/* Economic News Calendar Modal (XAUUSD Gold Only) */}
      {showNewsModal && (
        <EconomicCalendarModal
          onClose={() => setShowNewsModal(false)}
        />
      )}

    </div>
  );
}
