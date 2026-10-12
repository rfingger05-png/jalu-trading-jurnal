import React, { useState } from 'react';
import { User } from '../types';
import { setAuthToken } from '../utils';
import { Lock, User as UserIcon, Key, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';

export default function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const cleanUsername = username.trim();
      const cleanPassword = password;
      const cleanInvite = inviteCode.trim().toUpperCase();

      if (!cleanUsername) {
        throw new Error('Silakan masukkan username.');
      }
      if (!cleanPassword) {
        throw new Error('Silakan masukkan password.');
      }
      if (mode === 'register' && !cleanInvite) {
        throw new Error('Kode undangan (invite code) wajib diisi.');
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

      let data: any = null;
      let rawText = '';
      try {
        rawText = await res.text();
        if (rawText) {
          data = JSON.parse(rawText);
        }
      } catch (parseErr) {
        // Not a JSON response
      }

      if (!res.ok) {
        if (data?.error) {
          throw new Error(data.error);
        }
        if (data?.message) {
          throw new Error(data.message);
        }
        if (res.status === 401) {
          throw new Error('Username atau password tidak sesuai.');
        }
        if (res.status === 404) {
          throw new Error('Layanan endpoint autentikasi tidak ditemukan (404).');
        }
        if (rawText && rawText.length < 120 && !rawText.includes('<html')) {
          throw new Error(rawText);
        }
        throw new Error(`Koneksi server bermasalah (${res.status} ${res.statusText || 'Error'}). Silakan coba sesaat lagi.`);
      }

      if (!data || !data.user) {
        throw new Error('Format respon server tidak valid.');
      }

      if (data.token) {
        setAuthToken(data.token);
      }

      onLogin(data.user);
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = username.trim().length >= 3 && password.length >= 6 && (mode === 'login' || inviteCode.trim() !== '');

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100 flex flex-col items-center justify-center p-4 font-sans select-none">
      
      {/* Container */}
      <div className="w-full max-w-sm">

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold text-sm mb-3 shadow-inner">
            TJ
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Trading Journal
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'login' ? 'Masuk untuk mencatat & memantau transaksi' : 'Daftar akun baru dengan kode undangan'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#101522] border border-white/[0.08] rounded-2xl p-6 shadow-2xl shadow-black/40">
          
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 p-1 bg-[#0a0d14] rounded-xl border border-white/[0.04] mb-5">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-[#182033] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-[#182033] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Daftar
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 block">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <UserIcon size={14} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Masukkan username"
                  autoComplete="username"
                  required
                  className="w-full bg-[#0a0d14] border border-white/[0.08] focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-600 outline-none transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 block">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock size={14} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  className="w-full bg-[#0a0d14] border border-white/[0.08] focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 rounded-xl py-2.5 pl-9 pr-10 text-xs text-white placeholder:text-slate-600 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-white transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Invite Code (Register mode only) */}
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">
                  Kode Undangan
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Key size={14} />
                  </div>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Masukkan kode undangan"
                    required
                    className="w-full bg-[#0a0d14] border border-white/[0.08] focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-600 outline-none transition-all uppercase tracking-wider font-mono"
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="w-full mt-2 py-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Masuk' : 'Daftar Akun'}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

          </form>

        </div>

        {/* Clean Footer Note */}
        <p className="text-center text-[11px] text-slate-500 mt-6">
          Trading Backtest & Live Journal
        </p>

      </div>

    </div>
  );
}
