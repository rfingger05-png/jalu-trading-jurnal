import React, { useState, useMemo } from 'react';
import { User } from '../types';
import { formatCurrency } from '../utils';
import { Zap, Settings2 } from 'lucide-react';

interface QuickLotDisplayProps {
  currentEquity: number;
  user?: User | null;
  onOpenCalculators?: () => void;
}

export default function QuickLotDisplay({ currentEquity, user, onOpenCalculators }: QuickLotDisplayProps) {
  // Determine account contract specifications
  const accountType = useMemo(() => {
    if (user?.currency === 'NANO') return 'nano';
    if (user?.currency === 'USC') return 'cent';
    return 'standard';
  }, [user?.currency]);

  // Standard/Cent: pipValue = 10 ($10 per pip per 1 lot standard 100oz contract)
  // Nano: pipValue = 1
  const pipValue = accountType === 'nano' ? 1 : 10;

  // Quick interactive inputs (saved in local state with user default fallback)
  const [riskPercent, setRiskPercent] = useState<number>(1);
  const [slPips, setSlPips] = useState<number>(30);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const { lotSize, riskAmount, isAvailable } = useMemo(() => {
    if (typeof currentEquity !== 'number' || isNaN(currentEquity) || currentEquity <= 0) {
      return { lotSize: 'N/A', riskAmount: 0, isAvailable: false };
    }

    const calculatedRiskAmount = (currentEquity * (riskPercent || 1)) / 100;
    const safeSl = Math.max(1, slPips || 30);
    const rawLot = calculatedRiskAmount / (safeSl * pipValue);

    // Minimum lot size is 0.01
    const clampedLot = Math.max(0.01, rawLot);
    const formattedLot = clampedLot.toFixed(2);

    return {
      lotSize: formattedLot,
      riskAmount: calculatedRiskAmount,
      isAvailable: true
    };
  }, [currentEquity, riskPercent, slPips, pipValue]);

  return (
    <div className="bg-[#1A1A1A] rounded-lg border border-[#2D2D2D] p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs transition-colors shadow-xs">
      {/* Left: Quick Setup Info & Inputs */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="w-8 h-8 rounded-md bg-[#252525] border border-[#333333] text-[#00E676] flex items-center justify-center shrink-0">
          <Zap size={16} />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-white">
              QUICK TRADE SETUP
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#262626] text-amber-300 font-semibold border border-[#3D3D3D]">
              XAUUSD
            </span>
            <span className="text-[10px] font-mono text-[#A3A3A3] uppercase">
              ({accountType})
            </span>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="text-[10px] font-mono text-[#A3A3A3] hover:text-white flex items-center gap-1 ml-auto md:ml-2 px-1.5 py-0.5 rounded hover:bg-[#262626] cursor-pointer"
              title="Sesuaikan parameter risk & SL"
            >
              <Settings2 size={11} />
              <span>{isEditing ? 'Tutup' : 'Ubah Input'}</span>
            </button>
          </div>

          {/* Collapsible Quick Input Controls or Compact Summary */}
          {isEditing ? (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#2D2D2D] flex-wrap">
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <label className="text-[#A3A3A3]">Risk %:</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0)}
                  className="w-14 px-1.5 py-0.5 rounded bg-[#121212] border border-[#333333] text-white text-right font-bold focus:border-[#00E676] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <label className="text-[#A3A3A3]">SL (pips):</label>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="200"
                  value={slPips}
                  onChange={(e) => setSlPips(parseInt(e.target.value) || 0)}
                  className="w-16 px-1.5 py-0.5 rounded bg-[#121212] border border-[#333333] text-white text-right font-bold focus:border-[#00E676] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1 font-mono text-[11px] text-[#A3A3A3]">
                <span>Risk Cap:</span>
                <span className="text-white font-bold">{formatCurrency(riskAmount, user?.currency)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-[#A3A3A3] flex-wrap">
              <span>Risk: <strong className="text-white font-semibold">{riskPercent}%</strong></span>
              <span className="text-[#404040]">·</span>
              <span>Stop Loss: <strong className="text-white font-semibold">{slPips} pips</strong> <span className="text-[#737373]">({slPips * 10} pts)</span></span>
              {isAvailable && (
                <>
                  <span className="text-[#404040]">·</span>
                  <span>Risk Cap: <strong className="text-white font-semibold">{formatCurrency(riskAmount, user?.currency)}</strong></span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Eye-catching REC. LOT Badge */}
      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-[#2D2D2D] pt-2.5 md:pt-0">
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-md bg-[#121212] border border-[#00E676]/40 text-[#00E676] font-mono shadow-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#A3A3A3]">REC.</span>
          <span className="text-base font-extrabold tracking-tight text-[#00E676] tabular-nums">
            LOT: {lotSize}
          </span>
        </div>

        {onOpenCalculators && (
          <button
            onClick={onOpenCalculators}
            className="text-[11px] font-mono text-[#A3A3A3] hover:text-[#00E676] transition-colors py-1 cursor-pointer"
            title="Buka kalkulator lot lengkap"
          >
            Calculator →
          </button>
        )}
      </div>
    </div>
  );
}
