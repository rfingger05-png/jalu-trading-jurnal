import React, { useState, useMemo } from 'react';
import { User } from '../types';
import { formatCurrency } from '../utils';
import { Zap, Settings2, Calculator } from 'lucide-react';

interface QuickLotDisplayProps {
  currentEquity: number;
  user?: User | null;
  onOpenCalculators?: () => void;
  onOpenLogTrade?: () => void;
}

export default function QuickLotDisplay({
  currentEquity,
  user,
  onOpenCalculators,
  onOpenLogTrade
}: QuickLotDisplayProps) {
  // Account type: 'standard' | 'cent' | 'neon'
  const defaultType = user?.currency === 'NANO' ? 'neon' : (user?.currency === 'USC' ? 'cent' : 'standard');
  const [selectedType, setSelectedType] = useState<'standard' | 'cent' | 'neon'>(defaultType);

  // Standard ($10/pip), Cent (10¢/pip), Neon (1¢/pip per 1.00 lot)
  const pipValue = selectedType === 'neon' ? 1 : 10;

  // Interactive risk & SL controls
  const [riskPercent, setRiskPercent] = useState<number>(user?.default_risk ? Number(user.default_risk) : 1.5);
  const [slPips, setSlPips] = useState<number>(30);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Clean formatted balance rounded strictly to 2 decimals
  const cleanBalance = useMemo(() => {
    const bal = typeof currentEquity === 'number' && isFinite(currentEquity) ? currentEquity : 0;
    return Number(bal.toFixed(2));
  }, [currentEquity]);

  // Derived lot size and risking amount
  const { lotSize, riskAmount, isAvailable } = useMemo(() => {
    if (cleanBalance <= 0) {
      return { lotSize: '0.00', riskAmount: 0, isAvailable: false };
    }

    const calculatedRiskAmount = (cleanBalance * (riskPercent || 1.5)) / 100;
    const safeSl = Math.max(1, slPips || 30);
    const rawLot = calculatedRiskAmount / (safeSl * pipValue);

    const clampedLot = Math.max(0.01, rawLot);
    return {
      lotSize: clampedLot.toFixed(2),
      riskAmount: calculatedRiskAmount,
      isAvailable: true
    };
  }, [cleanBalance, riskPercent, slPips, pipValue]);

  return (
    <div className="bg-[#141414] rounded-xl border border-[#262626] p-4 sm:p-5 flex flex-col gap-4 text-xs transition-colors shadow-2xs">
      
      {/* Top Row: Title, Pair, Account Type Buttons, Settings Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#262626]">
        
        {/* Title & Instrument Tag */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#181818] border border-[#262626] text-[#FF3333] flex items-center justify-center shrink-0 shadow-inner">
            <Zap size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider font-extrabold text-white">
                QUICK TRADE LOT CALCULATOR
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#201010] text-[#FF3333] font-black border border-[#FF3333]/30">
                XAUUSD
              </span>
            </div>
            <div className="text-[11px] font-mono text-[#A3A3A3] mt-0.5">
              Account Balance: <strong className="text-white font-bold tabular-nums">{formatCurrency(cleanBalance, user?.currency)}</strong>
            </div>
          </div>
        </div>

        {/* Account Type Selector: Standard, Cent, Neon (1/10 Cent) */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#0D0D0D] border border-[#262626] self-stretch sm:self-auto justify-between sm:justify-start">
          <button
            type="button"
            onClick={() => setSelectedType('standard')}
            className={`px-3 py-1.5 rounded-md font-mono text-[11px] font-bold transition-all cursor-pointer ${
              selectedType === 'standard'
                ? 'bg-[#FF3333] text-white shadow-xs'
                : 'text-[#A3A3A3] hover:text-white hover:bg-[#181818]'
            }`}
          >
            Standard ($)
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('cent')}
            className={`px-3 py-1.5 rounded-md font-mono text-[11px] font-bold transition-all cursor-pointer ${
              selectedType === 'cent'
                ? 'bg-[#FF3333] text-white shadow-xs'
                : 'text-[#A3A3A3] hover:text-white hover:bg-[#181818]'
            }`}
          >
            Cent (¢)
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('neon')}
            className={`px-3 py-1.5 rounded-md font-mono text-[11px] font-bold transition-all cursor-pointer ${
              selectedType === 'neon'
                ? 'bg-[#FF3333] text-white shadow-xs'
                : 'text-[#A3A3A3] hover:text-white hover:bg-[#181818]'
            }`}
          >
            Neon (1/10 Cent)
          </button>
        </div>

      </div>

      {/* Bottom Row: Quick Inputs & Bold Displays (Custom Lot & Risking Amount) */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        
        {/* Left Inputs: Risk % and SL */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 font-mono">
            <span className="text-[#A3A3A3] text-xs">Risk:</span>
            <div className="flex items-center rounded-lg bg-[#0D0D0D] border border-[#262626] px-2 py-1 focus-within:border-[#FF3333]">
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={riskPercent}
                onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0)}
                className="w-12 bg-transparent text-white font-mono font-bold text-xs text-right outline-none"
              />
              <span className="text-[#737373] text-xs ml-1">%</span>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono">
            <span className="text-[#A3A3A3] text-xs">Stop Loss:</span>
            <div className="flex items-center rounded-lg bg-[#0D0D0D] border border-[#262626] px-2 py-1 focus-within:border-[#FF3333]">
              <input
                type="number"
                step="1"
                min="5"
                max="250"
                value={slPips}
                onChange={(e) => setSlPips(parseInt(e.target.value) || 0)}
                className="w-14 bg-transparent text-white font-mono font-bold text-xs text-right outline-none"
              />
              <span className="text-[#737373] text-xs ml-1">pips</span>
            </div>
          </div>

          <div className="font-mono text-xs text-[#A3A3A3] hidden sm:block">
            <span>Pip Value: </span>
            <strong className="text-white">
              {selectedType === 'neon' ? '1¢ ($0.01)' : selectedType === 'cent' ? '10¢ ($0.10)' : '$10.00'} / Lot
            </strong>
          </div>
        </div>

        {/* Right Badges: Custom Lot Size & Risking Amount in Bold Crimson Red */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          
          {/* Risking Amount */}
          <div className="flex flex-col text-left lg:text-right font-mono">
            <span className="text-[10px] uppercase font-bold text-[#A3A3A3] tracking-wider">
              RISKING AMOUNT
            </span>
            <span className="text-sm font-extrabold text-[#FF3333] tabular-nums">
              {formatCurrency(riskAmount, user?.currency)}
            </span>
          </div>

          {/* Recommended Lot Size Badge */}
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-[#1F0A0A] border border-[#FF3333] shadow-xs">
            <div className="flex flex-col">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#A3A3A3]">
                CUSTOM LOT SIZE
              </span>
              <span className="text-xl font-black font-mono tracking-tight text-white tabular-nums">
                {lotSize} <span className="text-xs text-[#FF3333] font-normal">LOT</span>
              </span>
            </div>
          </div>

          {onOpenCalculators && (
            <button
              onClick={onOpenCalculators}
              className="p-2.5 rounded-lg bg-[#181818] border border-[#262626] text-[#A3A3A3] hover:text-white hover:border-[#FF3333] transition-colors cursor-pointer"
              title="Buka kalkulator lot lengkap"
            >
              <Calculator size={15} />
            </button>
          )}

        </div>

      </div>

    </div>
  );
}
