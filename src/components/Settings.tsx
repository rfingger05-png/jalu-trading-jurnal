import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Check, AlertCircle, Trash2, Shield, Sliders, Send, Moon, Sun, Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { authFetch } from '../utils';

interface SettingsProps {
  user: User | null;
  onUserUpdate: () => void;
  onLocalUpdate?: (updates: Partial<User>) => void;
  onModeChange?: () => void;
  onLogout: () => void;
}

export default function Settings({ user, onUserUpdate, onLocalUpdate, onLogout }: SettingsProps) {
  const [error, setError] = useState<string | null>(null);

  const [currency, setCurrency] = useState(user?.currency || 'USD');
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencySuccess, setCurrencySuccess] = useState(false);

  const [initialBalance, setInitialBalance] = useState(user?.initial_balance !== null && user?.initial_balance !== undefined ? String(user.initial_balance) : '');
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [balanceSuccess, setBalanceSuccess] = useState(false);

  // Risk profile defaults (saved to localStorage)
  const [defaultRisk, setDefaultRisk] = useState<string>(() => localStorage.getItem('jurnalku_default_risk') || '1.0');
  const [defaultSl, setDefaultSl] = useState<string>(() => localStorage.getItem('jurnalku_default_sl') || '30');
  const [riskSuccess, setRiskSuccess] = useState(false);

  const [telegramTag, setTelegramTag] = useState(user?.telegram_tag || '');
  const [telegramIdInput, setTelegramIdInput] = useState(user?.telegram_id || '');
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramSuccess, setTelegramSuccess] = useState(false);

  const [linkCopied, setLinkCopied] = useState(false);
  const [botStatus, setBotStatus] = useState<{ configured: boolean; authenticated: boolean; username: string | null; error: string | null } | null>(null);

  // Dark mode
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') !== 'false';
  });

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('darkMode', String(next));
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Reset data state
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleResetData = async () => {
    setResetting(true);
    setError(null);
    try {
      const res = await authFetch('/api/account/reset', { method: 'POST' });
      if (res.ok) {
        setResetSuccess(true);
        setConfirmReset(false);
        onUserUpdate();
        setTimeout(() => setResetSuccess(false), 5000);
      } else {
        const err = await res.json();
        setError(err.error || 'Gagal mereset data akun.');
      }
    } catch (e: any) {
      setError(e?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    authFetch('/api/telegram/status')
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

  const saveRiskDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('jurnalku_default_risk', defaultRisk);
    localStorage.setItem('jurnalku_default_sl', defaultSl);
    setRiskSuccess(true);
    setTimeout(() => setRiskSuccess(false), 3000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-white p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="pb-4 border-b border-[#2D2D2D]">
          <div className="flex items-center gap-2 text-xs font-mono text-[#A3A3A3]">
            <span className="uppercase tracking-wider">SETTINGS</span>
            <span className="text-[#404040]">/</span>
            <span className="text-white font-bold">LIVE ACCOUNT CONFIGURATION</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white mt-1">
            Trading System Preferences
          </h1>
          <p className="text-xs text-[#A3A3A3] mt-0.5">
            Konfigurasi saldo awal, profil risiko XAUUSD, integrasi Telegram bot, dan preferensi tampilan.
          </p>
        </div>

        {error && (
          <div className="bg-[#FF3333]/15 text-[#FF3333] p-4 rounded-lg border border-[#FF3333]/40 flex items-center gap-2 text-xs font-mono">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Section 1: Starting Balance & Currency */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex items-center gap-2 pb-3 border-b border-[#262626]">
            <Shield size={16} className="text-[#00E676]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
              Account Starting Balance & Currency
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Initial Balance */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-semibold text-[#A3A3A3] block">
                Starting Capital / Balance
              </label>
              <input
                type="number"
                step="any"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="10000"
                className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-3 py-2 text-xs font-mono text-white focus:border-[#00E676] focus:outline-none"
              />
              <p className="text-[11px] text-[#737373] font-mono leading-tight">
                Saldo awal akun sebagai baseline kalkulasi profit % dan equity curve.
              </p>
              <button
                onClick={saveBalance}
                disabled={balanceSaving}
                className="px-3.5 py-1.5 bg-[#262626] hover:bg-[#333333] text-white text-[11px] font-mono font-bold uppercase rounded transition-colors cursor-pointer disabled:opacity-50 mt-1 flex items-center gap-1.5"
              >
                {balanceSaving ? 'Saving...' : 'Save Balance'}
                {balanceSuccess && <Check size={12} className="text-[#00E676]" />}
              </button>
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-semibold text-[#A3A3A3] block">
                Account Base Currency & Unit
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-3 py-2 text-xs font-mono text-white focus:border-[#00E676] focus:outline-none cursor-pointer"
              >
                <option value="USD">USD ($) — Standard Account ($10/pip per 1 lot)</option>
                <option value="USC">USC (¢) — Cent Account (10¢/pip per 1 lot)</option>
                <option value="NANO">NANO (¢) — Nano Account (1¢/pip per 1 lot)</option>
                <option value="IDR">IDR (Rp) — Indonesian Rupiah</option>
              </select>
              <p className="text-[11px] text-[#737373] font-mono leading-tight">
                Mempengaruhi konversi pip value pada Lot Size Calculator dan P/L.
              </p>
              <button
                onClick={saveCurrency}
                disabled={currencySaving}
                className="px-3.5 py-1.5 bg-[#262626] hover:bg-[#333333] text-white text-[11px] font-mono font-bold uppercase rounded transition-colors cursor-pointer disabled:opacity-50 mt-1 flex items-center gap-1.5"
              >
                {currencySaving ? 'Saving...' : 'Save Currency'}
                {currencySuccess && <Check size={12} className="text-[#00E676]" />}
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Default Risk Parameters (XAUUSD) */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 pb-3 border-b border-[#262626]">
            <Sliders size={16} className="text-[#00E676]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
              Default Risk Parameters (XAUUSD)
            </h2>
          </div>

          <form onSubmit={saveRiskDefaults} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-semibold text-[#A3A3A3] block">
                Default Risk per Trade (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={defaultRisk}
                onChange={(e) => setDefaultRisk(e.target.value)}
                className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-3 py-2 text-xs font-mono text-white focus:border-[#00E676] focus:outline-none"
              />
              <span className="text-[10px] text-[#737373] font-mono">Rekomendasi profesional: 1.0% per setup.</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono font-semibold text-[#A3A3A3] block">
                Default Stop Loss (pips)
              </label>
              <input
                type="number"
                step="1"
                min="5"
                max="200"
                value={defaultSl}
                onChange={(e) => setDefaultSl(e.target.value)}
                className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-3 py-2 text-xs font-mono text-white focus:border-[#00E676] focus:outline-none"
              />
              <span className="text-[10px] text-[#737373] font-mono">30 pips setara 300 points pada XAUUSD (Gold).</span>
            </div>

            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-[#00E676] hover:bg-[#00E676]/90 text-black text-xs font-mono font-bold uppercase rounded transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>Save Risk Defaults</span>
                {riskSuccess && <Check size={13} />}
              </button>
              {riskSuccess && (
                <span className="text-xs font-mono text-[#00E676]">
                  Parameter tersimpan! Digunakan pada bar Quick Trade Setup dashboard.
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Section 3: Telegram Bot Integration */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
            <div className="flex items-center gap-2">
              <Send size={16} className="text-sky-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Telegram Bot Integration
              </h2>
            </div>

            {botStatus?.authenticated ? (
              <span className="text-[11px] font-mono font-bold text-[#00E676] bg-[#00E676]/10 px-2 py-0.5 rounded border border-[#00E676]/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse"></span>
                Connected (@{botStatus.username})
              </span>
            ) : (
              <span className="text-[11px] font-mono text-[#A3A3A3] bg-[#262626] px-2 py-0.5 rounded">
                Standby
              </span>
            )}
          </div>

          <form onSubmit={handleSaveTelegramTag} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-semibold text-[#A3A3A3] block">
                  Username Telegram Anda (@username)
                </label>
                <input
                  type="text"
                  value={telegramTag}
                  onChange={(e) => setTelegramTag(e.target.value)}
                  placeholder="@yourusername"
                  className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-3 py-2 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono font-semibold text-[#A3A3A3] block">
                  Chat ID Telegram (Opsional)
                </label>
                <input
                  type="text"
                  value={telegramIdInput}
                  onChange={(e) => setTelegramIdInput(e.target.value)}
                  placeholder="12345678"
                  className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-3 py-2 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={telegramSaving}
              className="px-4 py-2 bg-[#262626] hover:bg-[#333333] text-white text-xs font-mono font-bold uppercase rounded transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {telegramSaving ? 'Menyimpan...' : 'Simpan Koneksi Telegram'}
              {telegramSuccess && <Check size={13} className="text-[#00E676]" />}
            </button>
          </form>

          {/* Quick command reference */}
          <div className="bg-[#121212] border border-[#262626] rounded-lg p-3.5 text-xs font-mono space-y-2">
            <span className="font-bold text-white block">Perintah Cepat Telegram Bot:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#A3A3A3]">
              <div><code>/quick XAUUSD BUY 0.10 +150 WIN</code></div>
              <div><code>/saldo (Cek balance & equity)</code></div>
              <div><code>/buy XAUUSD 0.05 +80</code></div>
              <div><code>/today (Rekap statistik hari ini)</code></div>
            </div>
          </div>
        </div>

        {/* Section 4: Theme Toggle & Public Link */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Theme & Public Share
              </h2>
              <p className="text-xs text-[#A3A3A3]">Preferensi visual interface dan profil publik</p>
            </div>

            <button
              onClick={toggleDarkMode}
              className="px-3 py-1.5 rounded-md bg-[#121212] border border-[#2D2D2D] text-xs font-mono text-white hover:border-[#00E676] transition-colors flex items-center gap-2 cursor-pointer"
            >
              {darkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-sky-400" />}
              <span>{darkMode ? 'Dark Mode (Default)' : 'Light Mode'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/p/${user?.username}`}
              className="flex-1 text-xs px-3 py-2 border border-[#2D2D2D] rounded-md bg-[#121212] font-mono text-[#A3A3A3] outline-none"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/p/${user?.username}`);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              className="px-4 py-2 bg-[#262626] hover:bg-[#333333] text-white text-xs font-mono font-bold uppercase rounded-md transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Copy size={13} />
              <span>{linkCopied ? 'Copied!' : 'Copy Public Link'}</span>
            </button>
          </div>
        </div>

        {/* Section 5: Data Management / Reset */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#FF3333]/30 p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#FF3333] font-mono flex items-center gap-2">
                <Trash2 size={16} />
                Reset Data Akun
              </h2>
              <p className="text-xs text-[#A3A3A3] mt-0.5">
                Hapus seluruh riwayat trade log, deposit, dan withdrawal secara permanen untuk memulai lembaran bersih.
              </p>
              {resetSuccess && (
                <span className="text-xs text-[#00E676] font-mono font-bold mt-2 flex items-center gap-1">
                  <Check size={14} /> Seluruh data akun berhasil direset bersih!
                </span>
              )}
            </div>

            {confirmReset ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleResetData}
                  disabled={resetting}
                  className="px-4 py-2 bg-[#FF3333] hover:bg-red-700 text-white font-mono font-bold text-xs uppercase rounded transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {resetting ? 'Mereset...' : 'Ya, Hapus Semua'}
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-2 bg-[#262626] hover:bg-[#333333] text-[#A3A3A3] font-mono font-bold text-xs uppercase rounded transition-colors cursor-pointer"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="px-4 py-2 border border-[#FF3333]/50 text-[#FF3333] hover:bg-[#FF3333]/15 font-mono font-bold text-xs uppercase rounded transition-colors shrink-0 cursor-pointer"
              >
                Reset Data
              </button>
            )}
          </div>
        </div>

        {/* Logout */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onLogout}
            className="px-5 py-2 bg-[#1A1A1A] border border-[#2D2D2D] hover:border-[#FF3333] text-[#A3A3A3] hover:text-[#FF3333] text-xs font-mono font-bold uppercase rounded-md transition-colors cursor-pointer"
          >
            Logout Session
          </button>
        </div>

      </div>
    </div>
  );
}
