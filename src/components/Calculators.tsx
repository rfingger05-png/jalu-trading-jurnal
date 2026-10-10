import React, { useState, useEffect } from 'react';
import { Calculator, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../utils';

import { User } from '../types';
export default function Calculators({ currentEquity, user }: { currentEquity: number, user?: User | null }) {
  // Lot Calculator State
  const [lotBal, setLotBal] = useState<number>(currentEquity);
  const [riskPercent, setRiskPercent] = useState<number>(1);
  const [slPips, setSlPips] = useState<number>(20);
  const [pipValue, setPipValue] = useState<number>(10);

  // MM Compounding State
  const [mmBal, setMmBal] = useState<number>(currentEquity);
  const [targetPercent, setTargetPercent] = useState<number>(1);
  const [days, setDays] = useState<number>(10);

  useEffect(() => {
    setLotBal(currentEquity);
    setMmBal(currentEquity);
  }, [currentEquity]);

  // Derived Lot Sizes
  const riskAmount = (lotBal * riskPercent) / 100;
  const lotSize = riskAmount / (slPips * pipValue);

  // Derived Compounding
  const compData = [];
  let runningBal = mmBal;
  for (let d = 1; d <= days; d++) {
    const pnl = (runningBal * targetPercent) / 100;
    runningBal += pnl;
    compData.push({ day: d, pnl, balance: runningBal });
  }

  const formatValue = (val: number) => {
    return formatCurrency(val, user?.currency || 'USD');
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row gap-6 p-6 md:p-8 overflow-y-auto">
      
      {/* Lot Calculator */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-neutral-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 flex items-center justify-center rounded-sm shrink-0">
                <Calculator size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tighter uppercase whitespace-nowrap">Lot Auto-Calculator</h2>
                <p className="text-xs text-slate-500 dark:text-neutral-500 hidden sm:block">Calculate lot size based on risk and stop loss.</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Account Balance</label>
              <input 
                type="number" 
                value={lotBal} 
                onChange={e => setLotBal(Number(e.target.value))}
                className="w-full text-xs p-2.5 border border-slate-200 dark:border-neutral-800 outline-none focus:border-black dark:border-neutral-500 transition-colors rounded-sm bg-slate-50 dark:bg-neutral-950"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Custom Risk (%)</label>
              <input 
                type="number" 
                step="0.1"
                value={riskPercent} 
                onChange={e => setRiskPercent(Number(e.target.value))}
                className="w-full text-xs p-2.5 border border-slate-200 dark:border-neutral-800 outline-none focus:border-black dark:border-neutral-500 transition-colors rounded-sm bg-slate-50 dark:bg-neutral-950"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Custom SL (Pips/Points)</label>
              <input 
                type="number" 
                value={slPips} 
                onChange={e => setSlPips(Number(e.target.value))}
                className="w-full text-xs p-2.5 border border-slate-200 dark:border-neutral-800 outline-none focus:border-black dark:border-neutral-500 transition-colors rounded-sm bg-slate-50 dark:bg-neutral-950"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Volume per Pip</label>
              <input 
                type="number" 
                value={pipValue} 
                onChange={e => setPipValue(Number(e.target.value))}
                className="w-full text-xs p-2.5 border border-slate-200 dark:border-neutral-800 outline-none focus:border-black dark:border-neutral-500 transition-colors rounded-sm bg-slate-50 dark:bg-neutral-950"
              />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 p-6 flex flex-col items-center justify-center rounded-sm mt-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-neutral-500 mb-2">Custom Lot Size</span>
            <span className="text-4xl font-bold tracking-tighter text-black dark:text-neutral-100">
              {isFinite(lotSize) && slPips > 0 && pipValue > 0 ? lotSize.toFixed(2) : '0.00'}
            </span>
            <span className="text-xs text-slate-400 mt-2 font-bold tracking-widest uppercase">
              Risking <span className="text-red-500">{formatValue(riskAmount)}</span>
            </span>
          </div>

          <div className="mt-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-3 block">Quick Lot Matrix</h3>
            <div className="overflow-auto border border-slate-200 dark:border-neutral-800 rounded-sm max-h-80">
              <table className="w-full text-left text-[10px] sm:text-xs">
                <thead className="bg-slate-100 dark:bg-neutral-950/50 uppercase font-bold text-slate-500 dark:text-neutral-500 tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 border-b border-r border-slate-200 dark:border-neutral-800 bg-slate-100 dark:bg-neutral-950">Risk \ SL</th>
                    {[10, 20, 30, 40, 50].map(sl => (
                      <th key={sl} className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800 text-center">{sl} Pips</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-neutral-900">
                  {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6, 7, 8, 9, 10].map(r => {
                    const isHighlight = r === 2.5;
                    return (
                      <tr key={r} className={isHighlight ? "border-b border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/20" : "border-b border-slate-100 dark:border-neutral-800 last:border-0 hover:bg-slate-50 dark:hover:bg-neutral-950/50 transition-colors"}>
                        <td className={`px-3 py-2 font-bold border-r border-slate-100 dark:border-neutral-800 ${isHighlight ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-neutral-400'}`}>{r.toFixed(1)}%</td>
                        {[10, 20, 30, 40, 50].map(sl => {
                          const calculatedRisk = (lotBal * r) / 100;
                          const calculatedLot = calculatedRisk / (sl * pipValue);
                          return (
                            <td key={sl} className={`px-3 py-2 text-center font-medium ${isHighlight ? 'text-blue-700 dark:text-blue-300' : 'text-black dark:text-neutral-100'}`}>
                              {isFinite(calculatedLot) && pipValue > 0 ? calculatedLot.toFixed(2) : '0.00'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Compounding */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm p-6 flex flex-col gap-6 h-full">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-neutral-800 pb-4">
            <div className="w-10 h-10 bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 flex items-center justify-center rounded-sm">
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tighter uppercase">MM Compounding</h2>
              <p className="text-xs text-slate-500 dark:text-neutral-500">Project your balance over time with daily targets.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start Balance</label>
              <input 
                type="number" 
                value={mmBal} 
                onChange={e => setMmBal(Number(e.target.value))}
                className="w-full text-xs p-2.5 border border-slate-200 dark:border-neutral-800 outline-none focus:border-black dark:border-neutral-500 transition-colors rounded-sm bg-slate-50 dark:bg-neutral-950"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Daily Target (%)</label>
              <input 
                type="number" 
                step="0.1"
                value={targetPercent} 
                onChange={e => setTargetPercent(Number(e.target.value))}
                className="w-full text-xs p-2.5 border border-slate-200 dark:border-neutral-800 outline-none focus:border-black dark:border-neutral-500 transition-colors rounded-sm bg-slate-50 dark:bg-neutral-950"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Days</label>
              <input 
                type="number" 
                value={days} 
                onChange={e => setDays(Number(e.target.value))}
                className="w-full text-xs p-2.5 border border-slate-200 dark:border-neutral-800 outline-none focus:border-black dark:border-neutral-500 transition-colors rounded-sm bg-slate-50 dark:bg-neutral-950"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950/50 min-h-[300px]">
             <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-neutral-950/50 text-[10px] uppercase font-bold text-slate-500 dark:text-neutral-500 tracking-wider sticky top-0">
                   <tr>
                      <th className="px-4 py-3">Day</th>
                      <th className="px-4 py-3 text-right">Target P/L</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                   </tr>
                </thead>
                <tbody className="bg-white dark:bg-neutral-900">
                   {compData.map((d, i) => (
                     <tr key={i} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50 dark:bg-neutral-950/50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-400">#{d.day}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">+{formatValue(d.pnl)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">{formatValue(d.balance)}</td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>
        </div>
      </div>

    </div>
  );
}
