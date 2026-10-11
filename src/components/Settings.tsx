import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { TestTubeDiagonal, MonitorPlay, Check, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { authFetch } from '../utils';

interface SettingsProps {
  user: User | null;
  onUserUpdate: () => void;
  onLocalUpdate?: (updates: Partial<User>) => void;
  onModeChange: () => void;
  onLogout: () => void;
}

export default function Settings({ user, onUserUpdate, onLocalUpdate, onModeChange, onLogout }: SettingsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currency, setCurrency] = useState(user?.currency || 'USD');
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencySuccess, setCurrencySuccess] = useState(false);

  const [initialBalance, setInitialBalance] = useState(user?.initial_balance !== null && user?.initial_balance !== undefined ? String(user.initial_balance) : '');
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [balanceSuccess, setBalanceSuccess] = useState(false);

  const [telegramTag, setTelegramTag] = useState(user?.telegram_tag || '');
  const [telegramIdInput, setTelegramIdInput] = useState(user?.telegram_id || '');
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramSuccess, setTelegramSuccess] = useState(false);

  const [linkCopied, setLinkCopied] = useState(false);
  const [botStatus, setBotStatus] = useState<{ configured: boolean; authenticated: boolean; username: string | null; error: string | null } | null>(null);

  useEffect(() => {
    fetch('/api/telegram/status')
      .then(r => r.json())
      .then(data => setBotStatus(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.currency) setCurrency(user.currency);
    if (user?.initial_balance !== undefined) {
      setInitialBalance(user.initial_balance !== null ? String(user.initial_balance) : '');
    }
    if (user?.telegram_tag !== undefined) setTelegramTag(user.telegram_tag || '');
    if (user?.telegram_id !== undefined) setTelegramIdInput(user.telegram_id || '');
  }, [user?.currency, user?.initial_balance, user?.telegram_tag, user?.telegram_id]);

  const handleSaveTelegramTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setTelegramSaving(true);
    setTelegramSuccess(false);
    setError(null);
    try {
      const res = await authFetch('/api/auth/telegram-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_tag: telegramTag.trim(),
          telegram_id: telegramIdInput.trim() || undefined
        })
      });
      if (res.ok) {
        setTelegramSuccess(true);
        if (onLocalUpdate) {
          onLocalUpdate({ 
            telegram_tag: telegramTag.trim().replace(/^@/, ''),
            telegram_id: telegramIdInput.trim() || user?.telegram_id 
          });
        }
        onUserUpdate();
        setTimeout(() => setTelegramSuccess(false), 3000);
      } else {
        const err = await res.json();
        setError(err.error || 'Gagal menyimpan tag telegram');
      }
    } catch (e: any) {
      setError(e.message || 'Gagal menyimpan tag telegram');
    } finally {
      setTelegramSaving(false);
    }
  };

  const saveBalance = async () => {
    setBalanceSaving(true);
    setBalanceSuccess(false);
    try {
      await authFetch('/api/auth/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_balance: initialBalance === '' ? null : Number(initialBalance) })
      });
      setBalanceSuccess(true);
      if (onLocalUpdate) {
        onLocalUpdate({ initial_balance: initialBalance === '' ? null : Number(initialBalance) });
      }
      setTimeout(() => setBalanceSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setBalanceSaving(false);
    }
  };

  const saveCurrency = async () => {
    setCurrencySaving(true);
    setCurrencySuccess(false);
    try {
      await authFetch('/api/auth/currency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency })
      });
      setCurrencySuccess(true);
      if (onLocalUpdate) {
        onLocalUpdate({ currency: currency as any });
      }
      setTimeout(() => setCurrencySuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setCurrencySaving(false);
    }
  };

  const handleModeChange = async (mode: 'backtest' | 'demo') => {
    if (user?.current_mode === mode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/auth/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (res.ok) {
         await onUserUpdate(); // fetch new trades and user details
         onModeChange(); // also trigger re-fetch of trades via App props
      } else {
         setError("Failed to change mode");
      }
    } catch(e) {
      setError("An unexpected error occurred");
      console.error("Failed to change mode");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex justify-center p-4 sm:p-8 overflow-y-auto w-full">
      <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm flex flex-col h-fit">
        <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-neutral-800 flex flex-col gap-2">
          <h2 className="text-xl font-bold tracking-tighter uppercase">Environment Settings</h2>
          <p className="text-slate-500 dark:text-neutral-500 text-sm">Configure your trading journal workspace.</p>
        </div>

        <div className="p-6 sm:p-8 flex flex-col gap-8">
           {error && (
             <div className="bg-red-50 text-red-600 p-4 rounded-sm border border-red-100 flex items-center gap-2 text-sm font-medium">
               <AlertCircle size={16} />
               {error}
             </div>
           )}

           <div className="flex flex-col gap-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Trading Mode</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <button 
                   onClick={() => handleModeChange('backtest')}
                   className={cn(
                     "relative p-6 border text-left flex flex-col gap-4 rounded-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black",
                     user?.current_mode === 'backtest' 
                       ? "border-black dark:border-neutral-500 bg-slate-50 dark:bg-neutral-950 shadow-sm ring-1 ring-black" 
                       : "border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:border-neutral-700 hover:bg-slate-50 dark:bg-neutral-950"
                   )}
                   disabled={loading}
                 >
                   {user?.current_mode === 'backtest' && (
                     <div className="absolute top-4 right-4 text-black dark:text-neutral-100">
                       <Check size={20} />
                     </div>
                   )}
                   <div className={cn(
                     "w-10 h-10 flex items-center justify-center rounded-sm",
                     user?.current_mode === 'backtest' ? "bg-black dark:bg-neutral-200 text-white dark:text-neutral-900" : "bg-slate-100 dark:bg-neutral-950 text-slate-500 dark:text-neutral-500"
                   )}>
                     <TestTubeDiagonal size={20} />
                   </div>
                   <div className="flex flex-col gap-1">
                     <span className={cn(
                       "font-bold uppercase tracking-widest text-sm",
                       user?.current_mode === 'backtest' ? "text-black dark:text-neutral-100" : "text-slate-700 dark:text-neutral-400"
                     )}>Backtest</span>
                     <span className="text-xs text-slate-500 dark:text-neutral-500 leading-relaxed">
                       Log hypothetical trades for continuous testing and strategy validation. Your statistics are separated.
                     </span>
                   </div>
                 </button>
                 
                 <button 
                   onClick={() => handleModeChange('demo')}
                   className={cn(
                     "relative p-6 border text-left flex flex-col gap-4 rounded-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black",
                     user?.current_mode === 'demo' 
                       ? "border-black dark:border-neutral-500 bg-slate-50 dark:bg-neutral-950 shadow-sm ring-1 ring-black" 
                       : "border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:border-neutral-700 hover:bg-slate-50 dark:bg-neutral-950"
                   )}
                   disabled={loading}
                 >
                   {user?.current_mode === 'demo' && (
                     <div className="absolute top-4 right-4 text-black dark:text-neutral-100">
                       <Check size={20} />
                     </div>
                   )}
                   <div className={cn(
                     "w-10 h-10 flex items-center justify-center rounded-sm",
                     user?.current_mode === 'demo' ? "bg-black dark:bg-neutral-200 text-white dark:text-neutral-900" : "bg-slate-100 dark:bg-neutral-950 text-slate-500 dark:text-neutral-500"
                   )}>
                     <MonitorPlay size={20} />
                   </div>
                   <div className="flex flex-col gap-1">
                     <span className={cn(
                       "font-bold uppercase tracking-widest text-sm",
                       user?.current_mode === 'demo' ? "text-black dark:text-neutral-100" : "text-slate-700 dark:text-neutral-400"
                     )}>Paper Trade</span>
                     <span className="text-xs text-slate-500 dark:text-neutral-500 leading-relaxed">
                       Log trades for paper trading sessions replicating live conditions. Helps identify psychological edges.
                     </span>
                   </div>
                 </button>
              </div>
           </div>

           
           <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-neutral-800 pt-8 mt-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400">Account Balance</h3>
              <div className="flex flex-col gap-4 max-w-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-neutral-500 mb-1">
                    Set a manual starting balance (e.g. 10000 for a $10k challenge). Leave empty to use auto-calculated default.
                  </span>
                  <input 
                    type="number" 
                    step="any"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    placeholder="Auto (10000)"
                    className="border border-slate-300 dark:border-neutral-700 p-2 text-sm focus:outline-none focus:border-black dark:border-neutral-500 rounded-sm bg-slate-50 dark:bg-neutral-950"
                  />
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={saveBalance}
                    disabled={balanceSaving}
                    className="px-4 py-2 bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    {balanceSaving ? 'Saving...' : 'Save Balance'}
                  </button>
                  {balanceSuccess && <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><Check size={14}/> Saved</span>}
                </div>
              </div>
           </div>

           <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-neutral-800 pt-8 mt-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400">Base Currency</h3>
              <div className="flex flex-col gap-4 max-w-sm">
                <select 
                  value={currency} 
                  onChange={(e) => setCurrency(e.target.value)}
                  className="border border-slate-300 dark:border-neutral-700 p-2 text-sm focus:outline-none focus:border-black dark:border-neutral-500 rounded-sm bg-slate-50 dark:bg-neutral-950"
                >
                  <option value="USD">USD ($)</option>
                  <option value="USC">USC (¢)</option>
                  <option value="IDR">IDR (Rp)</option>
                </select>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={saveCurrency}
                    disabled={currencySaving}
                    className="px-4 py-2 bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    {currencySaving ? 'Saving...' : 'Save Currency'}
                  </button>
                  {currencySuccess && <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><Check size={14}/> Saved</span>}
                </div>
              </div>
           </div>

           <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-neutral-800 pt-8 mt-4">
               <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-neutral-400">Telegram Bot Integration</h3>
                {botStatus?.authenticated ? (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Connected (@{botStatus.username})
                  </span>
                ) : botStatus?.error ? (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400 font-mono font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    {botStatus.error.includes('401') ? 'Token Unauthorized' : 'Offline'}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 font-mono">
                    Not Configured
                  </span>
                )}
              </div>

               <div className="p-6 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex flex-col gap-5 rounded">
                
                {/* Form to connect Telegram Tag */}
                <form onSubmit={handleSaveTelegramTag} className="flex flex-col gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Tautkan Username / Tag Telegram
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Masukkan username Telegram Anda (contoh: <code>@singga</code> atau <code>singga</code>) atau ID Telegram agar bot dapat mengenali Anda secara otomatis.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        Telegram Username / Tag:
                      </label>
                      <input
                        type="text"
                        value={telegramTag}
                        onChange={(e) => setTelegramTag(e.target.value)}
                        placeholder="@username_anda"
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white rounded focus:outline-none focus:border-slate-900 dark:focus:border-slate-200"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        Telegram ID (Opsional):
                      </label>
                      <input
                        type="text"
                        value={telegramIdInput}
                        onChange={(e) => setTelegramIdInput(e.target.value)}
                        placeholder="Contoh: 5061002416"
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white rounded focus:outline-none focus:border-slate-900 dark:focus:border-slate-200"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="submit"
                      disabled={telegramSaving}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold uppercase tracking-wider rounded transition-colors flex items-center gap-1.5"
                    >
                      {telegramSaving ? 'Menyimpan...' : 'Simpan Tag Telegram'}
                    </button>
                    {telegramSuccess && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Check size={14} /> Tag Berhasil Disimpan!
                      </span>
                    )}
                  </div>
                </form>

                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Status Akun Telegram:</span>
                    <span className="font-mono bg-white dark:bg-slate-900 px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded text-slate-800 dark:text-slate-200 tabular-nums">
                      {user?.telegram_tag ? `@${user.telegram_tag}` : user?.telegram_id ? `ID: ${user.telegram_id}` : 'Belum terhubung'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 mt-1">
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-xs">
                      Perintah aktif di Bot Telegram (@{botStatus?.username || 'jalu_trade_bot'}):
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] font-mono mt-1">
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded flex flex-col gap-1.5">
                        <span className="font-semibold text-slate-900 dark:text-white">📝 Jurnal &amp; Trade:</span>
                        <code>/jurnal (Wizard interaktif)</code>
                        <code>/quick XAUUSD BUY 0.1 +150 WIN</code>
                        <code>/buy XAUUSD 0.05 +80</code>
                        <code>/sell EURUSD 0.10 -40</code>
                        <code>/running (Lihat posisi terbuka)</code>
                        <code>/close 12 win 150 (Tutup trade)</code>
                      </div>
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded flex flex-col gap-1.5">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">📊 Saldo &amp; Akun:</span>
                        <code>/saldo (Cek balance &amp; equity)</code>
                        <code>/today (Rekap hari ini)</code>
                        <code>/lot 25 (Hitung ukuran lot)</code>
                        <code>/deposit 500 | /wd 200</code>
                        <code>/accounts | /switch {user?.username}</code>
                        <code>/menu (Control panel bot)</code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
           </div>

           <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-neutral-800 pt-8 mt-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400">Public Profile</h3>

              <div className="p-6 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex flex-col gap-3 rounded">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Share this read-only link to let others view your trading performance and journal metrics.
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <input 
                    type="text" 
                    readOnly 
                    value={`${window.location.origin}/p/${user?.username}`} 
                    className="flex-1 text-xs px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 font-mono text-slate-700 dark:text-slate-300 outline-none"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/p/${user?.username}`);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold uppercase tracking-wider rounded transition-colors shrink-0"
                  >
                    {linkCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>
           </div>

           <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-neutral-800 pt-8 mt-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-red-500">Danger Zone</h3>
              
              <div className="p-6 border border-red-200 bg-red-50 rounded-sm flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-bold uppercase tracking-widest text-sm text-red-900">Logout Session</span>
                  <span className="text-xs text-red-700">Clear your active session and return to the login screen.</span>
                </div>
                <button 
                  onClick={onLogout}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white dark:text-neutral-900 font-bold text-xs uppercase tracking-widest transition-colors rounded-sm shadow-sm"
                >
                  Logout
                </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
