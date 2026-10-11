import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { setAuthToken } from '../utils';
import { 
  Lock, 
  User as UserIcon, 
  Key, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  TrendingUp, 
  ShieldCheck, 
  Activity, 
  Globe, 
  Zap,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableInvite, setAvailableInvite] = useState<string>('');

  // Fetch active invite code hint for seamless registration
  useEffect(() => {
    fetch('/api/auth/invite-hint')
      .then(res => res.json())
      .then(data => {
        if (data?.available_code) {
          setAvailableInvite(data.available_code);
        }
      })
      .catch(() => {});
  }, []);

  const handleUseInvite = (code: string) => {
    setInviteCode(code);
    setMode('register');
    setError('');
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setMode('login');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const cleanUsername = username.trim();
      const cleanPassword = password;
      const cleanInvite = inviteCode.trim();

      if (!cleanUsername) {
        throw new Error('Username wajib diisi.');
      }
      if (!cleanPassword) {
        throw new Error('Password wajib diisi.');
      }
      if (mode === 'register' && !cleanInvite) {
        throw new Error('Kode undangan (invite code) wajib diisi untuk pendaftaran baru.');
      }

      const body = mode === 'login' 
        ? { username: cleanUsername, password: cleanPassword } 
        : { username: cleanUsername, password: cleanPassword, inviteCode: cleanInvite };
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      let data: any;
      const rawText = await res.text();
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error(`Koneksi server bermasalah (${res.status} ${res.statusText || 'Error'}). Silakan coba sesaat lagi.`);
      }

      if (!res.ok) {
        throw new Error(data?.error || (mode === 'login' ? 'Username atau password tidak sesuai.' : 'Gagal mendaftar akun baru.'));
      }

      // Store JWT token in localStorage as reliable fallback for cookies
      if (data?.token) {
        setAuthToken(data.token);
      }

      onLogin(data.user);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = username.trim().length >= 3 && password.length >= 6 && (mode === 'login' || inviteCode.trim() !== '');

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* Top Precision Bar */}
      <header className="h-14 border-b border-white/[0.06] bg-[#090d15]/80 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-mono font-bold text-emerald-400 text-xs">
            TJ
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight text-white uppercase">Trading Workstation</span>
            <span className="text-white/20">/</span>
            <span className="font-mono text-[11px] text-slate-400">v2.4.0</span>
          </div>
        </div>

        {/* Global Market Sessions */}
        <div className="hidden md:flex items-center gap-4 text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300">Tokyo</span>
            <span className="text-slate-500">00:00-08:00</span>
          </div>
          <span className="text-white/10">·</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            <span className="text-slate-400">London</span>
            <span className="text-slate-500">08:00-16:00</span>
          </div>
          <span className="text-white/10">·</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            <span className="text-slate-400">New York</span>
            <span className="text-slate-500">13:00-21:00</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          
          {/* Left Column: Terminal Features & Live Tickers */}
          <div className="lg:col-span-6 space-y-6 hidden sm:block">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-mono text-emerald-400 tracking-wider uppercase">
                <Activity size={14} />
                <span>Prop Firm & Backtest Analytics</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                Disiplin Eksekusi.<br />Evaluasi Data Real-Time.
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                Jurnal trading presisi tinggi untuk trader disiplin. Sinkronisasi multi-akun, kalkulasi Risk:Reward otomatis, dan integrasi bot Telegram 24/7.
              </p>
            </div>

            {/* Quick Live Market Pulse Ticker */}
            <div className="p-4 rounded-lg bg-[#0e1320] border border-white/[0.06] space-y-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Active Instrument Spreads</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  Live Feeds
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-[#131929] border border-white/[0.04] flex items-center justify-between">
                  <span className="text-slate-300 font-semibold">XAU/USD</span>
                  <span className="text-emerald-400 font-medium">2,654.80</span>
                </div>
                <div className="p-2.5 rounded bg-[#131929] border border-white/[0.04] flex items-center justify-between">
                  <span className="text-slate-300 font-semibold">EUR/USD</span>
                  <span className="text-slate-200 font-medium">1.0842</span>
                </div>
                <div className="p-2.5 rounded bg-[#131929] border border-white/[0.04] flex items-center justify-between">
                  <span className="text-slate-300 font-semibold">BTC/USD</span>
                  <span className="text-emerald-400 font-medium">68,410.00</span>
                </div>
                <div className="p-2.5 rounded bg-[#131929] border border-white/[0.04] flex items-center justify-between">
                  <span className="text-slate-300 font-semibold">GBP/JPY</span>
                  <span className="text-rose-400 font-medium">194.25</span>
                </div>
              </div>
            </div>

            {/* Terminal Guarantees */}
            <div className="space-y-2 text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span>Multi-akun mode: Backtest, Demo, dan Akun Evaluasi Prop Firm</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span>Webhook Telegram 24/7 untuk input trade via command /chat</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span>Penyimpanan cloud persisten Turso dengan enkripsi token JWT</span>
              </div>
            </div>
          </div>

          {/* Right Column: Authentication Card */}
          <div className="lg:col-span-6 w-full">
            <div className="bg-[#0e1320] border border-white/[0.08] rounded-xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
              
              {/* Subtle accent glow */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Card Header & Tabs */}
              <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      {mode === 'login' ? 'Masuk ke Terminal' : 'Daftar Akun Trader'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {mode === 'login' 
                        ? 'Gunakan username dan password terdaftar Anda' 
                        : 'Masukkan detail akun dan kode undangan aktivasi'}
                    </p>
                  </div>
                </div>

                {/* Segmented Mode Selector */}
                <div className="grid grid-cols-2 p-1 bg-[#131929] rounded-lg border border-white/[0.05] text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError(''); }}
                    className={`py-2 rounded-md transition-all text-center ${
                      mode === 'login'
                        ? 'bg-emerald-500/20 text-emerald-300 font-semibold shadow-xs border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Masuk (Sign In)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('register'); setError(''); }}
                    className={`py-2 rounded-md transition-all text-center ${
                      mode === 'register'
                        ? 'bg-emerald-500/20 text-emerald-300 font-semibold shadow-xs border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Daftar (Register)
                  </button>
                </div>
              </div>

              {/* Error Box */}
              {error && (
                <div className="p-3 mb-5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-snug">{error}</div>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Username */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span>Username</span>
                    <span className="text-[11px] text-slate-500 font-mono">min. 3 karakter</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <UserIcon size={14} />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Masukkan username"
                      autoComplete="username"
                      required
                      className="w-full bg-[#131929] border border-white/[0.08] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-lg py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 outline-none transition-colors font-mono"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span>Password</span>
                    <span className="text-[11px] text-slate-500 font-mono">min. 6 karakter</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <Lock size={14} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      className="w-full bg-[#131929] border border-white/[0.08] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-lg py-2.5 pl-9 pr-10 text-xs text-white placeholder:text-slate-500 outline-none transition-colors font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Invite Code (Register Only) */}
                {mode === 'register' && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">Kode Undangan (Invite Code)</label>
                      {availableInvite && (
                        <button
                          type="button"
                          onClick={() => setInviteCode(availableInvite)}
                          className="text-[11px] text-emerald-400 hover:underline font-mono"
                        >
                          Gunakan: {availableInvite}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Key size={14} />
                      </div>
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={e => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="Contoh: WUCXB1WV"
                        required
                        className="w-full bg-[#131929] border border-white/[0.08] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-lg py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 outline-none transition-colors font-mono tracking-wider uppercase"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Sistem menggunakan invite code eksklusif untuk menjaga privasi jurnal trading.
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || !isFormValid}
                  className="w-full mt-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{mode === 'login' ? 'Masuk ke Workstation' : 'Buat Akun & Mulai'}</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>

              {/* Quick Fill / Demo Hints for user convenience */}
              <div className="mt-6 pt-5 border-t border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Quick Access / Demo:</span>
                  <span className="text-slate-500">Klik untuk isi otomatis</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => handleQuickFill('aurel', 'aurel22')}
                    className="p-2 rounded bg-[#131929] hover:bg-[#1a233a] border border-white/[0.05] text-left transition-colors text-slate-300 hover:text-white"
                  >
                    <div className="text-[10px] text-emerald-400 font-semibold">ADMIN ACCOUNT</div>
                    <div className="text-[11px]">aurel · aurel22</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickFill('singga', 'password123')}
                    className="p-2 rounded bg-[#131929] hover:bg-[#1a233a] border border-white/[0.05] text-left transition-colors text-slate-300 hover:text-white"
                  >
                    <div className="text-[10px] text-cyan-400 font-semibold">TRADER ACCOUNT</div>
                    <div className="text-[11px]">singga · login</div>
                  </button>
                </div>
                {availableInvite && mode === 'login' && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => handleUseInvite(availableInvite)}
                      className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors"
                    >
                      Belum punya akun? Daftar dengan kode <span className="font-mono text-emerald-400 font-semibold">{availableInvite}</span>
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="h-12 border-t border-white/[0.06] bg-[#090d15]/80 px-4 sm:px-8 flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <div>Trading Terminal · Encrypted Institutional Storage</div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Server Engine Online</span>
        </div>
      </footer>

    </div>
  );
}
