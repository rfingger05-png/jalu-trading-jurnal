import React, { useState } from 'react';
import { User } from '../types';
import { Lock, User as UserIcon, Key, ArrowRight, TrendingUp } from 'lucide-react';

export default function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' 
        ? { username: username.trim(), password } 
        : { username: username.trim(), password, inviteCode: inviteCode.trim() };
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Server returned status ${res.status} (${res.statusText || 'Non-JSON response'}). Mohon refresh atau coba sesaat lagi.`);
      }

      if (!res.ok) throw new Error(data?.error || 'Authentication failed');

      onLogin(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = username.trim().length >= 3 && password.length >= 6 && (mode === 'login' || inviteCode.trim() !== '');

  return (
    <div className="bg-slate-50 dark:bg-[#090d16] min-h-screen flex items-center justify-center p-4 font-sans text-slate-900 dark:text-slate-100">
      
      <div className="w-full max-w-md bg-white dark:bg-[#0d1322] border border-slate-200 dark:border-slate-800 p-8 sm:p-10 rounded shadow-sm relative">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-10 h-10 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-bold text-sm mb-3 shadow-xs">
            TT
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Trading Journal
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {mode === 'login' ? 'Sign in to access your trading workstation & log' : 'Create a new trader account with invite code'}
          </p>
        </div>

        {/* Tab Switcher: Login / Register */}
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded mb-6 text-xs font-medium">
          <button 
            type="button"
            className={`flex-1 py-1.5 rounded transition-colors ${
              mode === 'login' 
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Sign In
          </button>
          <button 
            type="button"
            className={`flex-1 py-1.5 rounded transition-colors ${
              mode === 'register' 
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Register
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs p-3 mb-5 rounded flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <UserIcon size={15} />
              </div>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 rounded focus:outline-none focus:border-slate-900 dark:focus:border-slate-200 transition-colors shadow-xs"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock size={15} />
              </div>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 rounded focus:outline-none focus:border-slate-900 dark:focus:border-slate-200 transition-colors shadow-xs"
                required
              />
            </div>
            {mode === 'register' && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Minimum 6 characters required
              </p>
            )}
          </div>

          {/* Invite Code (Register mode only) */}
          {mode === 'register' && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
                Invite Code
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Key size={15} />
                </div>
                <input 
                  type="text" 
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  placeholder="Enter invite code"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 font-mono rounded focus:outline-none focus:border-slate-900 dark:focus:border-slate-200 transition-colors shadow-xs"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Required for new registrations
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={loading || !isFormValid}
            className="w-full py-2.5 mt-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold uppercase tracking-wider rounded flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>

        </form>

      </div>
    </div>
  );
}
