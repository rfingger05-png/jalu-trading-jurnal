import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, TrendingUp, Zap, Layers } from 'lucide-react';
import { formatCurrency } from '../utils';
import { User } from '../types';

export default function Calculators({ 
  currentEquity, 
  user 
}: { 
  currentEquity: number; 
  user?: User | null; 
}) {
  // Account Type selection ('standard' | 'cent' | 'neon')
  const initialType = user?.currency === 'NANO' ? 'neon' : (user?.currency === 'USC' ? 'cent' : 'standard');
  const [accountType, setAccountType] = useState<'standard' | 'cent' | 'neon'>(initialType);

  // Lot Calculator State
  const cleanInitialEquity = Number((typeof currentEquity === 'number' && isFinite(currentEquity) ? currentEquity : 1000).toFixed(2));
  const [lotBal, setLotBal] = useState<number>(cleanInitialEquity);
  const [riskPercent, setRiskPercent] = useState<number>(user?.default_risk ? Number(user.default_risk) : 1.5);
  const [slPips, setSlPips] = useState<number>(30);
  
  // Pip value: Standard ($10), Cent (10¢), Neon (1¢)
  const pipValue = accountType === 'neon' ? 1 : 10;

  // MM Compounding State
  const [mmBal, setMmBal] = useState<number>(cleanInitialEquity);
  const [targetPercent, setTargetPercent] = useState<number>(2.0);
  const daysCount = 10; // Day 1 s.d. Day 10

  useEffect(() => {
    if (typeof currentEquity === 'number' && isFinite(currentEquity)) {
      const cleanVal = Number(currentEquity.toFixed(2));
      setLotBal(cleanVal);
      setMmBal(cleanVal);
    }
  }, [currentEquity]);

  // Derived Lot Sizes
  const riskAmount = (lotBal * riskPercent) / 100;
  const rawLot = riskAmount / (Math.max(1, slPips) * pipValue);
  const lotSize = Math.max(0.01, rawLot).toFixed(2);

  // Compounding Table (Day 1 s.d. Day 10)
  const compoundingData = useMemo(() => {
    const list = [];
    let runningBal = Number(mmBal.toFixed(2));

    for (let d = 1; d <= daysCount; d++) {
      const dailyPL = Number(((runningBal * targetPercent) / 100).toFixed(2));
      runningBal = Number((runningBal + dailyPL).toFixed(2));
      list.push({
        day: d,
        targetPL: dailyPL,
        endingBalance: runningBal
      });
    }
    return list;
  }, [mmBal, targetPercent]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-white p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#262626]">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-[#262626]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-black uppercase tracking-wider text-white">
                MODUL D: LOT AUTO-CALCULATOR &amp; MM COMPOUNDING
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141414] text-[#FF3333] border border-[#FF3333]/30 font-bold">
                SPLIT-SCREEN DESKTOP
              </span>
            </div>
            <p className="text-xs text-[#A3A3A3] mt-0.5 font-mono">
              Perhitungan ukuran lot presisi XAUUSD &amp; proyeksi compounding target harian
            </p>
          </div>
        </div>

        {/* Two Columns Side-by-Side (Split-Screen Desktop Layout) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* ========================================================== */}
          {/* KOLOM KIRI: LOT AUTO-CALCULATOR & QUICK LOT MATRIX        */}
          {/* ========================================================== */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 sm:p-6 shadow-2xs flex flex-col gap-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#181818] border border-[#262626] text-[#FF3333] flex items-center justify-center font-bold">
                  <Calculator size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-mono font-extrabold uppercase text-white tracking-wider">
                    Lot Auto-Calculator
                  </h3>
                  <span className="text-[10px] font-mono text-[#A3A3A3]">
                    XAUUSD / Gold Position Sizing
                  </span>
                </div>
              </div>

              {/* Account Type Selector Buttons: Standard, Cent, Neon */}
              <div className="flex items-center p-1 rounded-lg bg-[#0D0D0D] border border-[#262626] font-mono text-xs">
                {(['standard', 'cent', 'neon'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAccountType(t)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      accountType === t
                        ? 'bg-[#FF3333] text-white shadow-xs'
                        : 'text-[#A3A3A3] hover:text-white'
                    }`}
                  >
                    {t === 'neon' ? 'Neon' : t === 'cent' ? 'Cent' : 'Standard'}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 font-mono text-xs">
              
              {/* Account Balance */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-[#A3A3A3] tracking-wider">
                  Account Balance
                </label>
                <div className="px-3 py-2 rounded-lg bg-[#0D0D0D] border border-[#262626] focus-within:border-[#FF3333] flex items-center justify-between">
                  <input
                    type="number"
                    step="10"
                    value={lotBal}
                    onChange={(e) => setLotBal(parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-white font-bold outline-none text-right tabular-nums"
                  />
                  <span className="text-[#555555] text-xs ml-1.5">{user?.currency || 'USD'}</span>
                </div>
              </div>

              {/* Custom Risk (%) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-[#A3A3A3] tracking-wider">
                  Custom Risk (%)
                </label>
                <div className="px-3 py-2 rounded-lg bg-[#0D0D0D] border border-[#262626] focus-within:border-[#FF3333] flex items-center justify-between">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-white font-bold outline-none text-right tabular-nums"
                  />
                  <span className="text-[#555555] text-xs ml-1">%</span>
                </div>
              </div>

              {/* Custom SL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-[#A3A3A3] tracking-wider">
                  Custom SL (Pips)
                </label>
                <div className="px-3 py-2 rounded-lg bg-[#0D0D0D] border border-[#262626] focus-within:border-[#FF3333] flex items-center justify-between">
                  <input
                    type="number"
                    step="1"
                    min="5"
                    max="200"
                    value={slPips}
                    onChange={(e) => setSlPips(parseInt(e.target.value) || 0)}
                    className="w-full bg-transparent text-white font-bold outline-none text-right tabular-nums"
                  />
                  <span className="text-[#555555] text-xs ml-1">pips</span>
                </div>
              </div>

            </div>

            {/* Custom Lot Size & Risking Amount Display Banner in Crimson Red */}
            <div className="p-4 rounded-xl bg-[#1A0C0C] border border-[#FF3333]/50 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono shadow-xs">
              <div className="flex flex-col text-center sm:text-left">
                <span className="text-[10px] uppercase font-black tracking-widest text-[#A3A3A3]">
                  RECOMMENDED CUSTOM LOT
                </span>
                <span className="text-3xl font-black text-white tabular-nums tracking-tight">
                  {lotSize} <span className="text-sm text-[#FF3333] font-normal">LOT ({accountType.toUpperCase()})</span>
                </span>
              </div>

              <div className="flex flex-col text-center sm:text-right">
                <span className="text-[10px] uppercase font-bold text-[#A3A3A3] tracking-wider">
                  RISKING AMOUNT (RISIKO)
                </span>
                <span className="text-xl font-black text-[#FF3333] tabular-nums">
                  {formatCurrency(riskAmount, user?.currency)}
                </span>
                <span className="text-[10px] text-[#A3A3A3]">
                  ({riskPercent}% dari balance {formatCurrency(lotBal, user?.currency)})
                </span>
              </div>
            </div>

            {/* Quick Lot Matrix (Thin Grid Borders, Clean from Green) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#A3A3A3]">
                  Quick Lot Matrix (Multi-Risk &amp; SL)
                </h4>
                <span className="text-[10px] font-mono text-[#737373]">
                  Garis grid tipis &amp; bersih
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#262626] bg-[#0D0D0D]">
                <table className="w-full text-left font-mono text-[11px] tabular-nums">
                  <thead className="bg-[#141414] text-[#A3A3A3] text-[10px] uppercase border-b border-[#262626]">
                    <tr>
                      <th className="px-3 py-2.5 border-r border-[#262626]">Risk \ SL</th>
                      {[15, 20, 30, 40, 50].map(pips => (
                        <th key={pips} className="px-3 py-2.5 text-center border-r border-[#262626] last:border-r-0">
                          {pips} Pips
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#262626]">
                    {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0].map(r => {
                      const isHighlighted = r === riskPercent;
                      return (
                        <tr 
                          key={r}
                          className={isHighlighted ? "bg-[#251010] text-[#FF3333]" : "hover:bg-[#141414] text-white"}
                        >
                          <td className="px-3 py-2 font-bold border-r border-[#262626]">
                            {r.toFixed(1)}%
                          </td>
                          {[15, 20, 30, 40, 50].map(pips => {
                            const calcRisk = (lotBal * r) / 100;
                            const calcLot = Math.max(0.01, calcRisk / (pips * pipValue));
                            return (
                              <td 
                                key={pips} 
                                className="px-3 py-2 text-center border-r border-[#262626] last:border-r-0 font-medium"
                              >
                                {calcLot.toFixed(2)}
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

          {/* ========================================================== */}
          {/* KOLOM KANAN: MM COMPOUNDING (DAY 1 S.D. DAY 10)            */}
          {/* ========================================================== */}
          <div className="bg-[#141414] rounded-2xl border border-[#262626] p-5 sm:p-6 shadow-2xs flex flex-col gap-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#181818] border border-[#262626] text-[#FF3333] flex items-center justify-center font-bold">
                  <TrendingUp size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-mono font-extrabold uppercase text-white tracking-wider">
                    MM Compounding
                  </h3>
                  <span className="text-[10px] font-mono text-[#A3A3A3]">
                    10-Day Growth Acceleration Plan
                  </span>
                </div>
              </div>

              {/* Target % Control */}
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-[#A3A3A3] text-[10px] uppercase">Daily Target:</span>
                <div className="px-2 py-1 rounded-md bg-[#0D0D0D] border border-[#262626] flex items-center">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="15"
                    value={targetPercent}
                    onChange={(e) => setTargetPercent(parseFloat(e.target.value) || 0)}
                    className="w-10 bg-transparent text-white font-bold outline-none text-right tabular-nums"
                  />
                  <span className="text-[#555555] ml-1">%</span>
                </div>
              </div>
            </div>

            {/* Compounding Projection Table: Day 1 s.d. Day 10 */}
            <div className="overflow-x-auto rounded-xl border border-[#262626] bg-[#0D0D0D]">
              <table className="w-full text-left font-mono text-xs tabular-nums">
                <thead className="bg-[#141414] text-[#A3A3A3] text-[10px] uppercase border-b border-[#262626]">
                  <tr>
                    <th className="px-4 py-3">Day</th>
                    <th className="px-4 py-3 text-right">Target P/L (Profit Putih)</th>
                    <th className="px-4 py-3 text-right">Projected Balance</th>
                    <th className="px-4 py-3 text-right">Accumulated Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262626]">
                  {compoundingData.map((row) => {
                    const accumGrowth = ((row.endingBalance - mmBal) / mmBal) * 100;
                    return (
                      <tr key={row.day} className="hover:bg-[#141414] transition-colors">
                        
                        {/* Day Column */}
                        <td className="px-4 py-2.5 font-bold text-white">
                          <span className="px-2 py-0.5 rounded bg-[#181818] border border-[#2A2A2A]">
                            Day {row.day}
                          </span>
                        </td>

                        {/* Target P/L: Entire Profit in Pure Clean White (#FFFFFF) */}
                        <td className="px-4 py-2.5 text-right font-extrabold text-white">
                          +{formatCurrency(row.targetPL, user?.currency)}
                        </td>

                        {/* Balance cleanly rounded to 2 decimals */}
                        <td className="px-4 py-2.5 text-right text-white font-medium">
                          {formatCurrency(row.endingBalance, user?.currency)}
                        </td>

                        {/* Accumulated Return */}
                        <td className="px-4 py-2.5 text-right text-white font-bold">
                          +{accumGrowth.toFixed(1)}%
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MM Summary Footer */}
            <div className="p-3.5 rounded-xl bg-[#0F0F0F] border border-[#222222] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#A3A3A3] block">
                  10-Day Projected Equity:
                </span>
                <span className="text-base font-black text-white tabular-nums">
                  {formatCurrency(compoundingData[compoundingData.length - 1]?.endingBalance, user?.currency)}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-[#A3A3A3] block">
                  Total Projected Net Growth:
                </span>
                <span className="text-sm font-extrabold text-white">
                  +{(((compoundingData[compoundingData.length - 1]?.endingBalance - mmBal) / mmBal) * 100).toFixed(2)}%
                </span>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
