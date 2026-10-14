import React, { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { cn } from '../lib/utils';
import { Check, Info, Skull, Clock, Compass } from 'lucide-react';
import { formatCurrency, resizeImage, authFetch, detectTradingSession, TradingSessionInfo } from '../utils';
import { User } from '../types';

type FormValues = {
  pair: string;
  direction: 'Buy' | 'Sell';
  setup_name: string;
  entry_price: number;
  sl: number;
  tp: number;
  account_balance: number;
  risk_percentage: number;
  position_size: number;
  pips: number | string | null;
  realized_pl: number | null;
  notes: string;
  result: 'Pending' | 'Win' | 'Loss' | 'Breakeven';
  image: string | null;
  trade_time?: string;
  session?: string;
};


export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "border border-slate-300 dark:border-neutral-700 p-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-cyan-600 dark:border-neutral-500 w-full rounded-sm placeholder:text-slate-400 bg-white dark:bg-neutral-900 shadow-sm",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Label = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <label className={cn("text-[9px] uppercase font-bold text-slate-900 dark:text-neutral-100 block", className)}>
    {children}
  </label>
);

export default function TradeForm({ onTradeAdded, currentEquity = 10000, user }: { onTradeAdded: () => void, currentEquity?: number, user?: User | null }) {
  // Current time (HH:mm)
  const getCurrentTime = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  const [tradeTime, setTradeTime] = useState<string>(getCurrentTime());
  const detectedSession = useMemo(() => detectTradingSession(tradeTime), [tradeTime]);
  const [customSession, setCustomSession] = useState<string>('');

  const activeSession = customSession || detectedSession.name;

  const { register, handleSubmit, watch, control, reset, setValue, formState: { errors, isValid } } = useForm<FormValues>({
    defaultValues: {
      direction: 'Buy',
      account_balance: currentEquity,
      risk_percentage: 1,
      position_size: 0,
      realized_pl: null,
      result: 'Pending',
      image: null
    },
    mode: 'onChange'
  });

  // Keep account_balance in sync with currentEquity if it changes externally
  useEffect(() => {
    setValue('account_balance', currentEquity);
  }, [currentEquity, setValue]);

  const accountBalance = watch('account_balance') || 0;
  const riskPercentage = watch('risk_percentage') || 0;
  const entryPrice = watch('entry_price') || 0;
  const sl = watch('sl') || 0;
  const tp = watch('tp') || 0;
  const pair = watch('pair') || '';
  const result = watch('result') || 'Pending';
  const realizedPl = watch('realized_pl');

  const nominalRisk = (accountBalance * riskPercentage) / 100;
  
  // Position Size calculation (simplified logic: Risk / |Entry - SL|)
  let positionSize = 0;
  if (entryPrice > 0 && sl > 0 && Math.abs(entryPrice - sl) > 0) {
    positionSize = nominalRisk / Math.abs(entryPrice - sl);
  }

  // Live estimated pips calculation for placeholder
  const estimatedPips = React.useMemo(() => {
    const pUpper = pair.toUpperCase();
    let mult = 10;
    if (pUpper.includes('JPY')) mult = 100;
    else if (pUpper.includes('EUR') || pUpper.includes('GBP') || pUpper.includes('AUD') || pUpper.includes('USD') || pUpper.includes('NZD') || pUpper.includes('CAD') || pUpper.includes('CHF')) {
      if (!pUpper.includes('XAU')) mult = 10000;
    } else if (pUpper.includes('BTC') || pUpper.includes('ETH')) mult = 1;

    if (result === 'Win' && tp > 0 && entryPrice > 0) {
      return Math.round(Math.abs(tp - entryPrice) * mult);
    }
    if (result === 'Loss' && sl > 0 && entryPrice > 0) {
      return -Math.round(Math.abs(entryPrice - sl) * mult);
    }
    if (realizedPl !== null && realizedPl !== undefined && !isNaN(Number(realizedPl))) {
      const plNum = Number(realizedPl);
      const sz = positionSize || 0.1;
      const isNano = user?.currency === 'NANO';
      let pipVal = isNano ? 1 : 10;
      if (pUpper.includes('BTC') || pUpper.includes('ETH')) pipVal = isNano ? 0.1 : 1;
      else if (pUpper.includes('JPY')) pipVal = isNano ? 0.85 : 8.5;
      return Math.round(plNum / (sz * pipVal));
    }
    return 0;
  }, [pair, entryPrice, sl, tp, result, realizedPl, positionSize, user?.currency]);

  const onSubmit = async (data: FormValues) => {
    let realized_pl = data.realized_pl !== null && String(data.realized_pl) !== '' && !isNaN(Number(data.realized_pl)) ? Number(data.realized_pl) : null;
    if (data.result === 'Pending') {
      realized_pl = null;
    } else if (data.result === 'Breakeven') {
      realized_pl = 0;
    }

    const payload = {
      pair: data.pair,
      direction: data.direction,
      setup_name: data.setup_name,
      entry_price: Number(data.entry_price),
      sl: Number(data.sl),
      tp: Number(data.tp),
      account_balance: Number(data.account_balance),
      risk_percentage: Number(data.risk_percentage),
      position_size: positionSize,
      nominal_risk: nominalRisk,
      pips: data.pips !== null && data.pips !== '' && !isNaN(Number(data.pips)) ? Number(data.pips) : (estimatedPips !== 0 ? estimatedPips : null),
      notes: data.notes,
      result: data.result,
      realized_pl,
      image: data.image,
      session: activeSession,
      trade_time: tradeTime
    };

    try {
      const res = await authFetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        reset();
        setTradeTime(getCurrentTime());
        setCustomSession('');
        onTradeAdded();
      } else {
        console.error("Failed to save. Server responded with:", await res.text());
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 flex flex-col h-full">
      <div className="space-y-4 shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">1. Trade Parameters</h2>
        
        <div className="grid grid-cols-2 gap-3">
          {/* Jam Entry & Deteksi Sesi Otomatis */}
          <div className="flex flex-col gap-1 col-span-2 p-3 bg-slate-50 dark:bg-neutral-950/70 border border-slate-200 dark:border-neutral-800 rounded-sm">
            <div className="flex items-center justify-between mb-1">
              <Label className="flex items-center gap-1.5 text-slate-700 dark:text-neutral-300">
                <Clock size={12} className="text-cyan-500" />
                <span>Jam Entry & Deteksi Sesi Otomatis</span>
              </Label>
              <button
                type="button"
                onClick={() => setTradeTime(getCurrentTime())}
                className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold hover:underline cursor-pointer"
              >
                Set Jam Sekarang
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
              <div>
                <input
                  type="time"
                  value={tradeTime}
                  onChange={e => setTradeTime(e.target.value)}
                  className="border border-slate-300 dark:border-neutral-700 p-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-cyan-600 rounded-sm bg-white dark:bg-neutral-900 w-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className={cn("w-full px-3 py-1.5 border rounded-sm flex items-center justify-between text-xs font-semibold", detectedSession.color)}>
                  <span className="flex items-center gap-1.5">
                    <span>{detectedSession.icon}</span>
                    <span>{detectedSession.displayName}</span>
                  </span>
                  <span className="text-[10px] opacity-80 font-mono">{detectedSession.timeRange}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Pair</Label>
            <Input {...register('pair', { required: true })} placeholder="XAUUSD" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Direction</Label>
            <select
              {...register('direction', { required: true })}
              className="border border-slate-300 dark:border-neutral-700 p-2 text-sm focus:outline-none focus:border-black dark:border-neutral-500 w-full rounded-sm bg-white dark:bg-neutral-900 shadow-sm cursor-pointer"
            >
              <option value="Buy">Buy (Long)</option>
              <option value="Sell">Sell (Short)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label>Setup Name</Label>
            <Input {...register('setup_name', { required: true })} placeholder="FVG + OB" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Entry Price</Label>
            <Input type="number" step="any" {...register('entry_price', { required: true })} placeholder="2034.50" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Risk %</Label>
            <Input type="number" step="0.1" {...register('risk_percentage', { required: true, min: 0.1, max: 100 })} placeholder="1.0" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Stop Loss</Label>
            <Input type="number" step="any" {...register('sl', { required: true })} placeholder="0.00" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Take Profit</Label>
            <Input type="number" step="any" {...register('tp', { required: true })} placeholder="0.00" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Account Balance</Label>
            <Input type="number" step="any" {...register('account_balance', { required: true, min: 1 })} placeholder="10000" />
          </div>
          <div className="flex flex-col gap-1 mt-1 col-span-2">
            <Label>Trade Result</Label>
            <select
              {...register('result')}
              className="border border-slate-300 dark:border-neutral-700 p-2 text-sm focus:outline-none focus:border-black dark:border-neutral-500 w-full rounded-sm placeholder:text-slate-400 bg-white dark:bg-neutral-900 shadow-sm cursor-pointer"
            >
              <option value="Pending">Pending (Log & Wait)</option>
              <option value="Win">Win</option>
              <option value="Loss">Loss</option>
              <option value="Breakeven">Breakeven</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4 bg-slate-50 dark:bg-slate-900/60 p-4 border border-slate-200 dark:border-slate-800 rounded shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Position Details & Execution</h2>
          {estimatedPips !== 0 && (
            <span className="text-[10px] font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
              Estimated: {estimatedPips > 0 ? `+${estimatedPips}` : estimatedPips} Pips
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <Label>Lot Size</Label>
            <Input type="number" step="any" {...register('position_size')} placeholder="0.01" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Profit / Loss ($)</Label>
            <Input type="number" step="any" {...register('realized_pl')} placeholder="0.00" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="flex items-center justify-between">
              <span>Pips (Manual Input)</span>
              <span className="text-[9px] text-slate-400 font-normal">Optional</span>
            </Label>
            <Input 
              type="number" 
              step="any" 
              {...register('pips')} 
              placeholder={estimatedPips !== 0 ? `Auto: ${estimatedPips}` : "e.g. 50 or -20"} 
              className="font-mono tabular-nums"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 shrink-0">
         <div className="pt-2">
            <Label className="mb-1">Notes / Reasons</Label>
            <textarea
              {...register('notes')}
              className="w-full border border-slate-300 dark:border-neutral-700 p-2.5 text-sm focus:outline-none focus:border-slate-900 dark:focus:border-slate-300 rounded placeholder:text-slate-400 min-h-[70px] resize-none bg-white dark:bg-slate-900"
              placeholder="Thesis, confluence, psychological state, and execution notes..."
            />
         </div>

         <div className="pt-2">
            <div className="flex flex-col gap-1">
               <Label>Trade Image (Chart / Execution)</Label>
               <input 
                 type="file" 
                 accept="image/*"
                 className="text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:border file:border-slate-300 dark:file:border-slate-700 file:text-xs file:font-medium file:rounded file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-300 hover:file:bg-slate-200 dark:hover:file:bg-slate-700 cursor-pointer"
                 onChange={async (e) => {
                   const file = e.target.files?.[0];
                   if (file) {
                     const compressed = await resizeImage(file);
                     setValue('image', compressed, { shouldValidate: true });
                   } else {
                     setValue('image', null);
                   }
                 }}
               />
               {watch('image') && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1 inline-block">✓ Image Attached</span>}
            </div>
         </div>
      </div>

      <button
        type="submit"
        disabled={!isValid}
        className="w-full py-3 mt-auto bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold uppercase tracking-wider rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-xs"
      >
        Record Trade Entry
      </button>
    </form>
  )
}
