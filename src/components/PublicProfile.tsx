import React, { useEffect, useState } from 'react';
import { Trade } from '../types';
import Dashboard from './Dashboard';
import History from './History';
import { Share2 } from 'lucide-react';

export default function PublicProfile({ username }: { username: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/user/${username}`)
      .then(res => {
        if (!res.ok) throw new Error("User not found");
        return res.json();
      })
      .then(data => {
        setTrades(data.trades);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [username]);

  if (loading) {
    return (
      <div className="flex-1 min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center font-mono text-[10px] uppercase font-bold tracking-widest text-slate-400">
        Loading public profile...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center font-mono text-[10px] uppercase font-bold tracking-widest text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-neutral-950">
      <div className="h-16 border-b border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between px-4 sm:px-8 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 flex items-center justify-center font-bold tracking-tighter shrink-0 rounded-sm">
            BJ
          </div>
          <h1 className="text-lg font-bold tracking-tighter uppercase whitespace-nowrap sm:ml-2">
            {username}'s Journal <span className="font-normal text-slate-400 text-sm hidden sm:inline">/ Public</span>
          </h1>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-neutral-950 p-1 rounded-sm gap-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-xs transition-colors ${activeTab === 'dashboard' ? 'bg-white dark:bg-neutral-900 shadow-sm text-black dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-500 hover:text-black dark:hover:text-neutral-100'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-xs transition-colors ${activeTab === 'history' ? 'bg-white dark:bg-neutral-900 shadow-sm text-black dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-500 hover:text-black dark:hover:text-neutral-100'}`}
          >
            History
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && <Dashboard trades={trades} />}
        {activeTab === 'history' && <History trades={trades} onTradeUpdated={() => {}} />}
      </div>
    </div>
  );
}
