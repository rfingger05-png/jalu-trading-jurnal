import React, { useState, useMemo } from 'react';
import { User, Trade } from '../types';
import { Check, Target, AlertTriangle, TrendingDown, RefreshCw, HandCoins } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatCurrency } from '../utils';

interface PropFirmProps {
  user: User | null;
  trades: Trade[];
  onLocalUpdate: (updates: Partial<User>) => void;
  onTradeAdded: () => void;
}

export default function PropFirm({ user, trades, onLocalUpdate, onTradeAdded }: PropFirmProps) {
  const [propFirmEnabled, setPropFirmEnabled] = useState(user?.prop_firm_enabled || false);
  const [propFirmBalance, setPropFirmBalance] = useState(String(user?.prop_firm_balance || 10000));
  const [propFirmDailyDD, setPropFirmDailyDD] = useState(String(user?.prop_firm_daily_dd || 5));
  const [propFirmMaxDD, setPropFirmMaxDD] = useState(String(user?.prop_firm_max_dd || 10));
  const [propFirmTarget, setPropFirmTarget] = useState(String(user?.prop_firm_target || 10));
  const [propFirmSaving, setPropFirmSaving] = useState(false);
  const [propFirmSuccess, setPropFirmSuccess] = useState(false);

  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);

  const savePropFirm = async () => {
    setPropFirmSaving(true);
    setPropFirmSuccess(false);
    try {
      await fetch('/api/auth/prop-firm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prop_firm_enabled: propFirmEnabled,
          prop_firm_balance: Number(propFirmBalance),
          prop_firm_daily_dd: Number(propFirmDailyDD),
          prop_firm_max_dd: Number(propFirmMaxDD),
          prop_firm_target: Number(propFirmTarget),
        })
      });
      setPropFirmSuccess(true);
      onLocalUpdate({
        prop_firm_enabled: propFirmEnabled,
        prop_firm_balance: Number(propFirmBalance),
        prop_firm_daily_dd: Number(propFirmDailyDD),
        prop_firm_max_dd: Number(propFirmMaxDD),
        prop_firm_target: Number(propFirmTarget),
      });
      setTimeout(() => setPropFirmSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setPropFirmSaving(false);
    }
  };

  const handlePayout = async () => {
    if (!payoutAmount || isNaN(Number(payoutAmount))) return;
    setPayoutLoading(true);
    try {
      await fetch('/api/auth/prop-firm-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(payoutAmount)
        })
      });
      onLocalUpdate({
        prop_firm_payout_total: (user?.prop_firm_payout_total || 0) + Number(payoutAmount)
      });
      setPayoutAmount('');
    } catch (e) {
      console.error(e);
    } finally {
      setPayoutLoading(false);
    }
  };

  // Calculations
  const stats = useMemo(() => {
    if (!user || !user.prop_firm_enabled) return null;
    const initialBalance = user.prop_firm_balance || 10000;
    const target = user.prop_firm_target || 10;
    const dailyDD = user.prop_firm_daily_dd || 5;
    const maxDD = user.prop_firm_max_dd || 10;
    const payoutTotal = user.prop_firm_payout_total || 0;

    const realizedPL = trades.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
    const currentEquity = initialBalance + realizedPL - payoutTotal;

    // Daily DD calculation: find the start of day equity
    const today = new Date().toISOString().split('T')[0];
    const tradesBeforeToday = trades.filter(t => !t.created_at.startsWith(today));
    const startOfDayPL = tradesBeforeToday.reduce((acc, t) => acc + (t.realized_pl || 0), 0);
    const startOfDayEquity = initialBalance + startOfDayPL - payoutTotal; // Approximated

    const maxDDEquityLimit = initialBalance * (1 - maxDD / 100);
    const dailyDDEquityLimit = startOfDayEquity * (1 - dailyDD / 100);
    const targetEquityLimit = initialBalance * (1 + target / 100);

    const isMaxDDBreached = currentEquity < maxDDEquityLimit;
    const isDailyDDBreached = currentEquity < dailyDDEquityLimit;
    const isPassed = currentEquity >= targetEquityLimit;

    let status = 'Active';
    if (isMaxDDBreached || isDailyDDBreached) status = 'Breached';
    else if (isPassed) status = 'Passed';

    return {
      currentEquity,
      targetEquityLimit,
      maxDDEquityLimit,
      dailyDDEquityLimit,
      status,
      isMaxDDBreached,
      isDailyDDBreached
    };
  }, [trades, user]);

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="h-16 shrink-0 border-b border-slate-200 dark:border-neutral-800 flex items-center px-6 lg:px-8 bg-white dark:bg-neutral-900 sticky top-0 z-10">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-neutral-200">Prop Firm Challenge</h2>
      </header>

      <div className="p-6 lg:p-8 max-w-4xl mx-auto flex flex-col gap-8">
        
        {/* Settings Section */}
        <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-sm shadow-sm flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400">Configuration</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <span className="font-bold text-xs uppercase tracking-widest text-slate-500">Enable</span>
              <input 
                type="checkbox" 
                checked={propFirmEnabled}
                onChange={(e) => setPropFirmEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-black focus:ring-black"
              />
            </label>
          </div>

          <div className={cn("grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 transition-opacity", propFirmEnabled ? "opacity-100" : "opacity-50 pointer-events-none")}>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-slate-500">Starting Balance</span>
              <input 
                type="number" 
                value={propFirmBalance}
                onChange={(e) => setPropFirmBalance(e.target.value)}
                className="border border-slate-300 dark:border-neutral-700 p-2 text-sm focus:outline-none focus:border-black dark:border-neutral-500 rounded-sm bg-slate-50 dark:bg-neutral-950" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-slate-500">Profit Target (%)</span>
              <input 
                type="number" 
                value={propFirmTarget}
                onChange={(e) => setPropFirmTarget(e.target.value)}
                className="border border-slate-300 dark:border-neutral-700 p-2 text-sm focus:outline-none focus:border-black dark:border-neutral-500 rounded-sm bg-slate-50 dark:bg-neutral-950" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-slate-500">Daily Drawdown (%)</span>
              <input 
                type="number" 
                value={propFirmDailyDD}
                onChange={(e) => setPropFirmDailyDD(e.target.value)}
                className="border border-slate-300 dark:border-neutral-700 p-2 text-sm focus:outline-none focus:border-black dark:border-neutral-500 rounded-sm bg-slate-50 dark:bg-neutral-950" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-slate-500">Max Drawdown (%)</span>
              <input 
                type="number" 
                value={propFirmMaxDD}
                onChange={(e) => setPropFirmMaxDD(e.target.value)}
                className="border border-slate-300 dark:border-neutral-700 p-2 text-sm focus:outline-none focus:border-black dark:border-neutral-500 rounded-sm bg-slate-50 dark:bg-neutral-950" 
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={savePropFirm}
              disabled={propFirmSaving}
              className="px-6 py-2 bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {propFirmSaving ? 'Saving...' : 'Save Settings'}
            </button>
            {propFirmSuccess && <span className="text-xs text-slate-600 dark:text-neutral-400 font-bold flex items-center gap-1"><Check size={14}/> Saved</span>}
          </div>
        </div>

        {/* Dashboard Section */}
        {stats && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-sm shadow-sm flex flex-col justify-center text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-black dark:bg-neutral-700"></div>
                <span className="text-[10px] uppercase font-bold text-slate-400 mb-2">Current Equity</span>
                <span className="text-3xl font-black tracking-tighter text-slate-800 dark:text-neutral-100">{formatCurrency(stats.currentEquity, user?.currency)}</span>
              </div>

              <div className={cn("border p-6 rounded-sm shadow-sm flex flex-col justify-center text-center relative overflow-hidden", "bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800")}>
                <div className="absolute top-0 left-0 w-full h-1 bg-black dark:bg-neutral-700"></div>
                <span className="text-[10px] uppercase font-bold text-slate-400 mb-2">Status</span>
                <span className={cn("text-2xl font-black tracking-tighter uppercase", stats.status === 'Passed' ? 'text-black dark:text-neutral-100' : stats.status === 'Breached' ? 'text-black dark:text-neutral-100' : 'text-black dark:text-neutral-100')}>
                  {stats.status}
                </span>
              </div>

              <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-sm shadow-sm flex flex-col justify-center text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-slate-300 dark:bg-neutral-700"></div>
                <span className="text-[10px] uppercase font-bold text-slate-400 mb-2">Total Payouts</span>
                <span className="text-2xl font-black tracking-tighter text-slate-800 dark:text-neutral-100">{formatCurrency(user.prop_firm_payout_total || 0, user?.currency)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-sm shadow-sm flex flex-col gap-4">
                 <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 flex items-center gap-2"><Target size={16} /> Objective</h3>
                 <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-neutral-800">
                   <span className="text-sm font-medium text-slate-500">Profit Target ({user.prop_firm_target}%)</span>
                   <span className="font-bold">{formatCurrency(stats.targetEquityLimit, user.currency)}</span>
                 </div>
                 <div className="w-full bg-slate-100 dark:bg-neutral-800 h-2 rounded-full overflow-hidden">
                   <div 
                     className="bg-black dark:bg-neutral-400 h-full transition-all" 
                     style={{ width: `${Math.min(100, Math.max(0, ((stats.currentEquity - (user.prop_firm_balance || 10000)) / (stats.targetEquityLimit - (user.prop_firm_balance || 10000))) * 100))}%` }}
                   ></div>
                 </div>
              </div>

              <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-sm shadow-sm flex flex-col gap-4">
                 <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 flex items-center gap-2"><TrendingDown size={16} /> Drawdown Limits</h3>
                 
                 <div className="flex flex-col gap-1">
                   <div className="flex justify-between items-center">
                     <span className="text-xs font-medium text-slate-500">Daily Loss Limit</span>
                     <span className={cn("text-xs font-bold", stats.isDailyDDBreached ? "text-slate-900 dark:text-neutral-100" : "")}>{formatCurrency(stats.dailyDDEquityLimit, user.currency)}</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                     <div className={cn("h-full transition-all", stats.isDailyDDBreached ? "bg-black dark:bg-neutral-400" : "bg-slate-400 dark:bg-neutral-600")} style={{ width: `${Math.max(0, 100 - ((stats.dailyDDEquityLimit - stats.currentEquity) / stats.dailyDDEquityLimit * 100))}%` }}></div>
                   </div>
                 </div>

                 <div className="flex flex-col gap-1 mt-2">
                   <div className="flex justify-between items-center">
                     <span className="text-xs font-medium text-slate-500">Max Loss Limit</span>
                     <span className={cn("text-xs font-bold", stats.isMaxDDBreached ? "text-slate-900 dark:text-neutral-100" : "")}>{formatCurrency(stats.maxDDEquityLimit, user.currency)}</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                     <div className={cn("h-full transition-all", stats.isMaxDDBreached ? "bg-black dark:bg-neutral-400" : "bg-slate-400 dark:bg-neutral-600")} style={{ width: `${Math.max(0, 100 - ((stats.maxDDEquityLimit - stats.currentEquity) / stats.maxDDEquityLimit * 100))}%` }}></div>
                   </div>
                 </div>
              </div>
            </div>

            {/* Payout Simulation */}
            <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-sm flex flex-col gap-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-neutral-200 flex items-center gap-2"><HandCoins size={16} /> Simulate Payout</h3>
              <p className="text-xs text-slate-600 dark:text-neutral-400">
                Requesting a payout will deduct the specified amount from your current equity and add it to your Total Payouts.
              </p>
              <div className="flex gap-2 max-w-sm">
                <input 
                  type="number"
                  placeholder="Amount"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-neutral-500 rounded-sm"
                />
                <button
                  onClick={handlePayout}
                  disabled={payoutLoading || !payoutAmount}
                  className="px-6 py-2 bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] font-bold uppercase tracking-widest rounded-sm disabled:opacity-50 transition-colors"
                >
                  {payoutLoading ? 'Processing...' : 'Payout'}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
