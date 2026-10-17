import React, { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { cn } from '../lib/utils';
import { Clock, PlusCircle } from 'lucide-react';
import { resizeImage, authFetch, detectTradingSession } from '../utils';
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

  const { register, handleSubmit, watch, reset, setValue, formState: { errors, isValid } } = useForm<FormValues>({
    defaultValues: {
      pair: 'XAUUSD',
      direction: 'Buy',
      account_balance: currentEquity,
      risk_percentage: user?.default_risk ? Number(user.default_risk) : 1.5,
      position_size: 0.01,
      realized_pl: null,
      result: 'Pending',
      image: null
    },
    mode: 'onChange'
  });

  useEffect(() => {
    setValue('account_balance', Number(currentEquity.toFixed(2)));
  }, [currentEquity, setValue]);

  const accountBalance = watch('account_balance') || 0;
  const riskPercentage = watch('risk_percentage') || 1.5;
  const entryPrice = watch('entry_price') || 0;
  const sl = watch('sl') || 0;
  const tp = watch('tp') || 0;
  const pair = watch('pair') || 'XAUUSD';
  const result = watch('result') || 'Pending';
  const realizedPl = watch('realized_pl');

  const nominalRisk = (accountBalance * riskPercentage) / 100;
  
  // Position size auto calculation
  const pipValue = user?.currency === 'NANO' ? 1 : 10;
  let positionSize = 0.01;
  if (entryPrice > 0 && sl > 0 && Math.abs(entryPrice - sl) > 0) {
    const pipsDistance = Math.abs(entryPrice - sl) * 10;
    positionSize = Math.max(0.01, Number((nominalRisk / (pipsDistance * (pipValue / 10))).toFixed(2)));
  }

  const onSubmit = async (data: FormValues) => {
    let realized_pl = data.realized_pl !== null && String(data.realized_pl) !== '' && !isNaN(Number(data.realized_pl)) ? Number(data.realized_pl) : null;
    if (data.result === 'Pending') {
      realized_pl = null;
    } else if (data.result === 'Breakeven') {
      realized_pl = 0;
    }

    const payload = {
      pair: (data.pair || 'XAUUSD').toUpperCase(),
      direction: data.direction,
      setup_name: data.setup_name || 'Standard Price Action',
      entry_price: Number(data.entry_price) || 0,
      sl: Number(data.sl) || 0,
      tp: Number(data.tp) || 0,
      account_balance: Number(data.account_balance),
      risk_percentage: Number(data.risk_percentage),
      position_size: Number(data.position_size) || positionSize,
      nominal_risk: nominalRisk,
      pips: data.pips !== null && data.pips !== '' && !isNaN(Number(data.pips)) ? Number(data.pips) : null,
      notes: data.notes || '',
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
            CATAT TRANSAKSI BARU (XAUUSD)
          </h2>
        </div>
        <span className="text-[10px] text-[#A3A3A3]">
          Eksekusi Manual Langsung
        </span>
      </div>

      {/* Entry Time & Market Session Auto Detection */}
      <div className="p-3 bg-[#0D0D0D] border border-[#262626] rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-white">
            <Clock size={12} className="text-[#FF3333]" />
            <span>Jam Entry &amp; Deteksi Sesi Pasar</span>
          </Label>
          <button
            type="button"
            onClick={() => setTradeTime(getCurrentTime())}
            className="text-[10px] text-[#FF3333] font-bold hover:underline cursor-pointer"
          >
            Jam Sekarang (WIB)
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
          <input
            type="time"
            value={tradeTime}
            onChange={e => setTradeTime(e.target.value)}
            className="border border-[#262626] p-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-[#FF3333] rounded-lg bg-[#141414] w-full"
          />

          <div className="px-3 py-2 rounded-lg bg-[#141414] border border-[#262626] flex items-center justify-between">
            <span className="font-bold text-white">
              {detectedSession.icon} {detectedSession.displayName}
            </span>
            <span className="text-[10px] text-[#A3A3A3]">{detectedSession.timeRange}</span>
          </div>
        </div>
      </div>

      {/* Main Parameters Grid */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="flex flex-col gap-1">
          <Label>Pair</Label>
          <Input {...register('pair', { required: true })} placeholder="XAUUSD" />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Arah Posisi (Direction)</Label>
          <select
            {...register('direction', { required: true })}
            className="border border-[#262626] p-2 text-xs font-mono text-white focus:outline-none focus:border-[#FF3333] w-full rounded-lg bg-[#0D0D0D] cursor-pointer font-bold"
          >
            <option value="Buy">BUY (Long)</option>
            <option value="Sell">SELL (Short)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 col-span-2">
          <Label>Setup Name</Label>
          <Input {...register('setup_name', { required: true })} placeholder="Retest H1 FVG + Order Block" />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Entry Price</Label>
          <Input type="number" step="any" {...register('entry_price', { required: true })} placeholder="2650.50" />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Stop Loss</Label>
          <Input type="number" step="any" {...register('sl', { required: true })} placeholder="2645.00" />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Take Profit</Label>
          <Input type="number" step="any" {...register('tp', { required: true })} placeholder="2665.00" />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Lot Size</Label>
          <Input type="number" step="any" {...register('position_size')} placeholder={positionSize.toFixed(2)} />
        </div>

        <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
          <Label>Hasil Trade (Outcome)</Label>
          <select
            {...register('result')}
            className="border border-[#262626] p-2 text-xs font-mono text-white focus:outline-none focus:border-[#FF3333] w-full rounded-lg bg-[#0D0D0D] cursor-pointer font-bold"
          >
            <option value="Pending">Pending (Open / Running)</option>
            <option value="Win">Win (Profit)</option>
            <option value="Loss">Loss (Rugi)</option>
            <option value="Breakeven">Breakeven</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
          <Label>Realized P/L ($)</Label>
          <Input type="number" step="any" {...register('realized_pl')} placeholder="Contoh: 150 atau -45" />
        </div>
      </div>

      {/* Psychology Notes */}
      <div className="space-y-1">
        <Label>Catatan Psikologi &amp; Eksekusi</Label>
        <textarea
          {...register('notes')}
          rows={3}
          className="w-full border border-[#262626] p-2.5 text-xs font-mono focus:outline-none focus:border-[#FF3333] rounded-lg text-white placeholder-[#555555] bg-[#0D0D0D] resize-none"
          placeholder="Catatan konfirmasi indikator, kepatuhan trading plan, dan kondisi mental trader..."
        />
      </div>

      {/* Image Upload */}
      <div className="space-y-1">
        <Label>Screenshot Chart (Before / After)</Label>
        <input 
          type="file" 
          accept="image/*"
          className="text-xs text-[#A3A3A3] file:mr-3 file:py-1.5 file:px-3 file:border file:border-[#262626] file:text-xs file:font-mono file:rounded-lg file:bg-[#181818] file:text-white hover:file:border-[#FF3333] cursor-pointer"
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
        {watch('image') && (
          <span className="text-xs text-white font-bold mt-1 inline-block">
            ✓ Foto Chart Terlampir
          </span>
        )}
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
