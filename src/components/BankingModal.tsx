import React, { useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle, CheckCircle2, Wallet, Banknote } from 'lucide-react';
import { cn } from '../lib/utils';
import { User } from '../types';

export default function BankingModal({ onClose, onTransactionComplete }: { onClose: () => void, onTransactionComplete: () => void }) {
  const [tab, setTab] = useState<'deposit' | 'withdrawal'>('deposit');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;

    setLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: tab, amount: Number(amount) })
      });
      
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          onTransactionComplete();
        }, 1500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-neutral-900 w-full max-w-sm border border-slate-200 dark:border-neutral-800 shadow-2xl flex flex-col rounded-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-neutral-800 shrink-0 bg-slate-50 dark:bg-neutral-950/50">
          <h2 className="font-bold uppercase tracking-widest text-slate-800 dark:text-neutral-200 text-sm flex items-center gap-2">
            <Wallet size={16} />
            Simulated Banking
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-neutral-800 rounded-full transition-colors text-slate-500">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="p-8 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="font-bold text-lg">Transaction Success!</h3>
            <p className="text-sm text-slate-500 dark:text-neutral-400 text-center">
              Your simulated {tab} of ${Number(amount).toLocaleString()} has been processed.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex border-b border-slate-100 dark:border-neutral-800">
              <button 
                onClick={() => setTab('deposit')}
                className={cn(
                  "flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 flex items-center justify-center gap-2",
                  tab === 'deposit' ? "border-black dark:border-white text-black dark:text-white bg-white dark:bg-neutral-900" : "border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-neutral-950/50"
                )}
              >
                <ArrowDownCircle size={14} className={tab === 'deposit' ? "text-emerald-600" : ""} />
                Deposit
              </button>
              <button 
                onClick={() => setTab('withdrawal')}
                className={cn(
                  "flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 flex items-center justify-center gap-2",
                  tab === 'withdrawal' ? "border-black dark:border-white text-black dark:text-white bg-white dark:bg-neutral-900" : "border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-neutral-950/50"
                )}
              >
                <ArrowUpCircle size={14} className={tab === 'withdrawal' ? "text-red-600" : ""} />
                Withdraw
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input 
                    type="number" 
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 rounded-sm pl-8 pr-4 py-3 text-lg font-mono focus:outline-none focus:border-black dark:focus:border-neutral-500 transition-colors"
                    placeholder="0.00"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-400 dark:text-neutral-500">
                  {tab === 'deposit' ? 'Add funds to your simulated balance.' : 'Remove funds from your simulated balance.'}
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !amount}
                className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-bold uppercase tracking-widest text-xs rounded-sm hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? 'Processing...' : (tab === 'deposit' ? 'Confirm Deposit' : 'Confirm Withdrawal')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
