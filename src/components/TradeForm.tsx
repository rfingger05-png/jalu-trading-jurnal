import React, { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { cn } from '../lib/utils';
import { Clock, PlusCircle, Link as LinkIcon, Image as ImageIcon, Check, RefreshCw } from 'lucide-react';
import { resizeImage, authFetch, detectTradingSession, formatImageUrl } from '../utils';
import { User } from '../types';

type FormValues = {
  pair: string;
  direction: 'Buy' | 'Sell';
  setup_name: string;
  entry_price?: number | string;
  sl?: number | string;
  tp?: number | string;
  account_balance: number;
  risk_percentage: number;
  position_size: number;
  pips: number | string | null;
  realized_pl: number | string | null;
  notes: string;
  result: 'Pending' | 'Win' | 'Loss' | 'Breakeven';
  image_before?: string | null;
  image_after?: string | null;
  trade_time?: string;
  session?: string;
};

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "border border-[#262626] p-2 text-xs font-mono text-white focus:outline-none focus:border-[#FF3333] w-full rounded-lg placeholder:text-[#555555] bg-[#0D0D0D] transition-colors",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Label = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <label className={cn("text-[10px] uppercase font-bold text-[#A3A3A3] block font-mono tracking-wider", className)}>
    {children}
  </label>
);

export default function TradeForm({ 
  onTradeAdded, 
  currentEquity = 10000, 
  user 
}: { 
  onTradeAdded: () => void; 
  currentEquity?: number; 
  user?: User | null; 
}) {
  const getNowWibTime = () => {
    const nowWib = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const h = String(nowWib.getHours()).padStart(2, '0');
    const m = String(nowWib.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  const [tradeTime, setTradeTime] = useState<string>(getNowWibTime());
  const detectedSession = useMemo(() => detectTradingSession(tradeTime), [tradeTime]);
  const [customSession, setCustomSession] = useState<string>('');

  const activeSession = customSession || detectedSession.name;

  // Dual Image State: Before & After (either base64 data or TradingView URL)
  const [imageBefore, setImageBefore] = useState<string>('');
  const [imageAfter, setImageAfter] = useState<string>('');
  const [tvInputBefore, setTvInputBefore] = useState<string>('');
  const [tvInputAfter, setTvInputAfter] = useState<string>('');

  const { register, handleSubmit, watch, reset, setValue, formState: { isValid } } = useForm<FormValues>({
    defaultValues: {
      pair: 'XAUUSD',
      direction: 'Buy',
      setup_name: 'Price Action XAUUSD',
      account_balance: currentEquity,
      risk_percentage: user?.default_risk ? Number(user.default_risk) : 1.5,
      position_size: 0.01,
      realized_pl: null,
      result: 'Win',
      notes: ''
    },
    mode: 'onChange'
  });

  useEffect(() => {
    setValue('account_balance', Number(currentEquity.toFixed(2)));
  }, [currentEquity, setValue]);

  const accountBalance = watch('account_balance') || 0;
  const riskPercentage = watch('risk_percentage') || 1.5;
  const entryPrice = parseFloat(String(watch('entry_price') || '')) || 0;
  const sl = parseFloat(String(watch('sl') || '')) || 0;
  const nominalRisk = (accountBalance * riskPercentage) / 100;
  
  // Position size auto calculation
  const pipValue = user?.currency === 'NANO' ? 1 : 10;
  let calculatedLot = 0.01;
  if (entryPrice > 0 && sl > 0 && Math.abs(entryPrice - sl) > 0) {
    const pipsDistance = Math.abs(entryPrice - sl) * 10;
    calculatedLot = Math.max(0.01, Number((nominalRisk / (pipsDistance * (pipValue / 10))).toFixed(2)));
  }

  const onSubmit = async (data: FormValues) => {
    let realized_pl = data.realized_pl !== null && data.realized_pl !== undefined && String(data.realized_pl) !== '' && !isNaN(Number(data.realized_pl)) ? Number(data.realized_pl) : null;
    if (data.result === 'Pending') {
      realized_pl = null;
    } else if (data.result === 'Breakeven') {
      realized_pl = 0;
    }

    const finalBefore = (tvInputBefore.trim() || imageBefore || null);
    const finalAfter = (tvInputAfter.trim() || imageAfter || null);

    const payload = {
      pair: (data.pair || 'XAUUSD').toUpperCase(),
      direction: data.direction,
      setup_name: data.setup_name || 'Price Action XAUUSD',
      entry_price: Number(data.entry_price) || 0,
      sl: Number(data.sl) || 0,
      tp: Number(data.tp) || 0,
      account_balance: Number(data.account_balance),
      risk_percentage: Number(data.risk_percentage),
      position_size: Number(data.position_size) || calculatedLot,
      nominal_risk: nominalRisk,
      pips: data.pips !== null && data.pips !== undefined && data.pips !== '' && !isNaN(Number(data.pips)) ? Number(data.pips) : null,
      notes: data.notes || '',
      result: data.result,
      realized_pl,
      image: finalBefore || finalAfter || null,
      image_before: finalBefore,
      image_after: finalAfter,
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
        setImageBefore('');
        setImageAfter('');
        setTvInputBefore('');
        setTvInputAfter('');
        setTradeTime(getNowWibTime());
        setCustomSession('');
        onTradeAdded();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 flex flex-col font-mono text-xs">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FF3333]"></span>
          <h2 className="text-xs font-bold uppercase tracking-wider text-white">
            CATAT JURNAL TRADE (XAUUSD)
          </h2>
        </div>
        <span className="text-[10px] text-[#A3A3A3] px-2 py-0.5 rounded bg-[#1A1A1A] border border-[#2D2D2D] font-bold">
          XAUUSD AUTO-LOCKED
        </span>
      </div>

      {/* Grid Fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
        
        {/* Pair: Auto XAUUSD */}
        <div className="flex flex-col gap-1">
          <Label>Instrumen (Pair)</Label>
          <div className="px-3 py-2 rounded-lg bg-[#141414] border border-[#262626] text-white font-bold flex items-center justify-between">
            <span>XAUUSD</span>
            <span className="text-[10px] text-[#FF3333] font-normal uppercase">Gold Spot</span>
          </div>
          <input type="hidden" {...register('pair')} value="XAUUSD" />
        </div>

        {/* Direction: BUY or SELL */}
        <div className="flex flex-col gap-1">
          <Label>Arah Posisi (Direction)</Label>
          <select
            {...register('direction', { required: true })}
            className="border border-[#262626] p-2 text-xs font-mono text-white focus:outline-none focus:border-[#FF3333] w-full rounded-lg bg-[#0D0D0D] cursor-pointer font-bold"
          >
            <option value="Buy">🟢 BUY (Long)</option>
            <option value="Sell">🔴 SELL (Short)</option>
          </select>
        </div>

        {/* Lot Size */}
        <div className="flex flex-col gap-1">
          <Label>Ukuran Lot</Label>
          <Input 
            type="number" 
            step="0.01" 
            {...register('position_size')} 
            placeholder={calculatedLot.toFixed(2)} 
          />
        </div>

        {/* Execution Time (Jam Transaksi WIB) */}
        <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <Label>Jam Eksekusi (WIB)</Label>
            <button
              type="button"
              onClick={() => setTradeTime(getNowWibTime())}
              className="text-[9px] text-[#FF3333] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={10} /> Sekarang
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Input
              type="text"
              value={tradeTime}
              onChange={(e) => setTradeTime(e.target.value)}
              placeholder="HH:mm (cth: 15:30)"
              className="font-bold"
            />
            <span className="text-[10px] px-2 py-2 rounded bg-[#181818] border border-[#262626] text-[#A3A3A3] whitespace-nowrap">
              {activeSession}
            </span>
          </div>
        </div>

        {/* Outcome: Win / Loss / Breakeven / Pending */}
        <div className="flex flex-col gap-1">
          <Label>Hasil Trade (Outcome)</Label>
          <select
            {...register('result')}
            className="border border-[#262626] p-2 text-xs font-mono text-white focus:outline-none focus:border-[#FF3333] w-full rounded-lg bg-[#0D0D0D] cursor-pointer font-bold"
          >
            <option value="Win">🏆 Win (Profit)</option>
            <option value="Loss">❌ Loss (Rugi)</option>
            <option value="Breakeven">⚖️ Breakeven ($0)</option>
            <option value="Pending">⏳ Running (Open)</option>
          </select>
        </div>

        {/* Realized P/L */}
        <div className="flex flex-col gap-1">
          <Label>Realized P/L ($ USD)</Label>
          <Input 
            type="number" 
            step="any" 
            {...register('realized_pl')} 
            placeholder="cth: +150 atau -45" 
          />
        </div>

        {/* Setup Name (Auto default) */}
        <div className="flex flex-col gap-1 col-span-2 sm:col-span-3">
          <Label>Nama Setup / Strategi</Label>
          <Input 
            {...register('setup_name')} 
            placeholder="Price Action XAUUSD (Retest H1 / FVG)" 
          />
        </div>

        {/* Entry Price (Optional) */}
        <div className="flex flex-col gap-1">
          <Label>Entry Price (Opsional)</Label>
          <Input type="number" step="any" {...register('entry_price')} placeholder="cth: 2650.50" />
        </div>

        {/* SL (Optional) */}
        <div className="flex flex-col gap-1">
          <Label>Stop Loss (Opsional)</Label>
          <Input type="number" step="any" {...register('sl')} placeholder="cth: 2645.00" />
        </div>

        {/* TP (Optional) */}
        <div className="flex flex-col gap-1">
          <Label>Take Profit (Opsional)</Label>
          <Input type="number" step="any" {...register('tp')} placeholder="cth: 2665.00" />
        </div>

      </div>

      {/* ======================================================== */}
      {/* DUAL SCREENSHOT INPUT: BEFORE & AFTER (Upload / TV Link) */}
      {/* ======================================================== */}
      <div className="p-4 rounded-xl bg-[#141414] border border-[#262626] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
          <div className="flex items-center gap-2">
            <ImageIcon size={14} className="text-[#FF3333]" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Screenshot Chart (Before &amp; After)
            </span>
          </div>
          <span className="text-[10px] text-[#A3A3A3]">
            Bisa Upload File atau Tempel Link TradingView
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* 1. BEFORE (Entry Setup) */}
          <div className="space-y-2 p-3 rounded-lg bg-[#0D0D0D] border border-[#262626]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-[#FF3333] px-1.5 py-0.5 rounded bg-[#FF3333]/20 border border-[#FF3333]/40">
                1. BEFORE (ENTRY)
              </span>
              {(imageBefore || tvInputBefore) && (
                <span className="text-[10px] text-white font-bold flex items-center gap-1">
                  <Check size={12} className="text-white" /> Terpasang
                </span>
              )}
            </div>

            {/* TradingView Link Input */}
            <div className="flex items-center gap-1.5">
              <LinkIcon size={12} className="text-[#A3A3A3]" />
              <input
                type="text"
                placeholder="Tempel link TradingView (cth: https://www.tradingview.com/x/...)"
                value={tvInputBefore}
                onChange={(e) => {
                  setTvInputBefore(e.target.value);
                  if (e.target.value) setImageBefore('');
                }}
                className="w-full bg-transparent text-xs text-white placeholder-[#555555] outline-none border-b border-[#262626] focus:border-[#FF3333] py-1"
              />
            </div>

            <div className="text-[10px] text-[#737373] text-center">--- atau upload gambar ---</div>

            {/* File Upload */}
            <input 
              type="file" 
              accept="image/*"
              className="text-[11px] text-[#A3A3A3] file:mr-2 file:py-1 file:px-2.5 file:border file:border-[#262626] file:text-[10px] file:font-mono file:rounded file:bg-[#181818] file:text-white hover:file:border-[#FF3333] cursor-pointer w-full"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const compressed = await resizeImage(file);
                  setImageBefore(compressed);
                  setTvInputBefore('');
                }
              }}
            />

            {/* Preview Before */}
            {(imageBefore || tvInputBefore) && (
              <div className="relative aspect-16/9 bg-black rounded overflow-hidden border border-[#333333] mt-2">
                <img 
                  src={formatImageUrl(tvInputBefore || imageBefore)} 
                  alt="Preview Before" 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          {/* 2. AFTER (Outcome / Exit) */}
          <div className="space-y-2 p-3 rounded-lg bg-[#0D0D0D] border border-[#262626]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-white px-1.5 py-0.5 rounded bg-[#181818] border border-[#333333]">
                2. AFTER (OUTCOME)
              </span>
              {(imageAfter || tvInputAfter) && (
                <span className="text-[10px] text-white font-bold flex items-center gap-1">
                  <Check size={12} className="text-white" /> Terpasang
                </span>
              )}
            </div>

            {/* TradingView Link Input */}
            <div className="flex items-center gap-1.5">
              <LinkIcon size={12} className="text-[#A3A3A3]" />
              <input
                type="text"
                placeholder="Tempel link TradingView (cth: https://www.tradingview.com/x/...)"
                value={tvInputAfter}
                onChange={(e) => {
                  setTvInputAfter(e.target.value);
                  if (e.target.value) setImageAfter('');
                }}
                className="w-full bg-transparent text-xs text-white placeholder-[#555555] outline-none border-b border-[#262626] focus:border-[#FF3333] py-1"
              />
            </div>

            <div className="text-[10px] text-[#737373] text-center">--- atau upload gambar ---</div>

            {/* File Upload */}
            <input 
              type="file" 
              accept="image/*"
              className="text-[11px] text-[#A3A3A3] file:mr-2 file:py-1 file:px-2.5 file:border file:border-[#262626] file:text-[10px] file:font-mono file:rounded file:bg-[#181818] file:text-white hover:file:border-[#FF3333] cursor-pointer w-full"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const compressed = await resizeImage(file);
                  setImageAfter(compressed);
                  setTvInputAfter('');
                }
              }}
            />

            {/* Preview After */}
            {(imageAfter || tvInputAfter) && (
              <div className="relative aspect-16/9 bg-black rounded overflow-hidden border border-[#333333] mt-2">
                <img 
                  src={formatImageUrl(tvInputAfter || imageAfter)} 
                  alt="Preview After" 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Psychology / Reason Notes (Optional at the end) */}
      <div className="space-y-1">
        <Label>Alasan Eksekusi &amp; Catatan Psikologi (Opsional)</Label>
        <textarea
          {...register('notes')}
          rows={2}
          className="w-full border border-[#262626] p-2.5 text-xs font-mono focus:outline-none focus:border-[#FF3333] rounded-lg text-white placeholder-[#555555] bg-[#0D0D0D] resize-none"
          placeholder="Alasan open posisi, konfirmasi timeframe, atau catatan psikologi trader (opsional)..."
        />
      </div>

      {/* Submit Button in Crimson Red */}
      <button
        type="submit"
        disabled={!isValid}
        className="w-full py-3 bg-[#FF3333] hover:bg-[#E62E2E] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer flex items-center justify-center gap-2"
      >
        <PlusCircle size={15} />
        <span>Simpan Transaksi ke Jurnal</span>
      </button>

    </form>
  );
}
