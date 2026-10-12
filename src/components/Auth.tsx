import React, { useState } from 'react';
import { User } from '../types';
import { setAuthToken } from '../utils';
import { Lock, User as UserIcon, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';

interface AuthProps {
  onLogin: (user: User) => void;
}

export default function Auth({ onLogin }: AuthProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUsername = username.trim();
    const cleanPassword = password;

    if (!cleanUsername) {
      setError('Silakan masukkan username.');
      return;
    }

    if (!cleanPassword) {
      setError('Silakan masukkan password.');
      return;
    }

    if (mode === 'register' && cleanPassword.length < 4) {
      setError('Password minimal 4 karakter.');
      return;
    }

    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = { username: cleanUsername, password: cleanPassword };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      let data: any = null;
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch (parseErr) {
        // Non-JSON response
      }

      if (!res.ok) {
        if (data?.error) {
          throw new Error(data.error);
        }
        if (res.status === 401) {
          throw new Error('Username atau password salah.');
        }
        throw new Error('Gagal menghubungkan ke server. Silakan coba lagi.');
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

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-cyan-500/30">
      <div className="w-full max-w-sm">
        
        {/* Simple Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold text-base mb-3 shadow-sm">
            TJ
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Trading Journal
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'login' ? 'Masuk ke akun jurnal Anda' : 'Buat akun jurnal baru'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-[#0e1424] border border-white/[0.08] rounded-2xl p-6 shadow-2xl shadow-black/50">
          
          {/* Simple Tab Switcher */}
          <div className="grid grid-cols-2 p-1 bg-[#070b13] rounded-xl border border-white/[0.06] mb-5">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-cyan-600 text-white shadow-sm'
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
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Daftar
            </button>
          </div>

          {/* Error Message Alert */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5">
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
                  className="w-full bg-[#070b13] border border-white/[0.08] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-600 outline-none transition-all"
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
                  className="w-full bg-[#070b13] border border-white/[0.08] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl py-2.5 pl-9 pr-10 text-xs text-white placeholder:text-slate-600 outline-none transition-all"
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-600/20 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Masuk' : 'Buat Akun'}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

          </form>

        </div>

      </div>
    </div>
  );
}
