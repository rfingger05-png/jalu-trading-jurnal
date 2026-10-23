export type Trade = {
  id: number;
  user_id: number;
  pair: string;
  direction: 'Buy' | 'Sell';
  setup_name: string;
  entry_price: number;
  sl: number;
  tp: number;
  account_balance: number;
  risk_percentage: number;
  position_size: number;
  nominal_risk: number;
  notes: string;
  realized_pl: number | null;
  pips?: number | null;
  result: 'Pending' | 'Win' | 'Loss' | 'Breakeven';
  image: string | null;
  image_url?: string | null;
  image_before?: string | null;
  image_after?: string | null;
  has_image?: number | boolean;
  run_mode: 'backtest' | 'demo';
  session?: string | null;
  trade_time?: string | null;
  close_time?: string | null;
  created_at: string;
};

export type User = {
  id: number;
  username: string;
  role: 'admin' | 'user';
  current_mode: 'backtest' | 'demo';
  currency: 'USD' | 'USC' | 'NANO' | 'IDR';
  prop_firm_enabled?: boolean;
  prop_firm_balance?: number;
  initial_balance?: number | null;
  myfxbook_connected?: boolean;
  prop_firm_daily_dd?: number;
  prop_firm_max_dd?: number;
  weekly_dd?: number;
  analytics_timeframe?: 'daily' | 'weekly';
  prop_firm_target?: number;
  prop_firm_payout_total?: number;
  telegram_id?: string;
  telegram_tag?: string;
  default_risk?: number;
  target_balance?: number | null;
  api_key?: string | null;
  created_at: string;
};

export type InviteCode = {
  code: string;
  is_used: boolean;
  used_by: string | null;
  created_at: string;
};

export type Transaction = {
  id: number;
  user_id: number;
  type: 'deposit' | 'withdrawal';
  amount: number;
  created_at: string;
};
