import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import bcrypt from 'bcryptjs';

export function escapeHtml(text: any): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const sendOrEdit = async (ctx: any, msg: string, useBackButton: boolean = false, customButtons?: any[]) => {
  try {
    const extra: any = { parse_mode: 'HTML' };
    const rows: any[] = [];
    if (customButtons && customButtons.length > 0) {
      rows.push(...customButtons);
    }
    if (useBackButton) {
      rows.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'cmd_menu' }]);
    }
    if (rows.length > 0) {
      extra.reply_markup = { inline_keyboard: rows };
    }

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, extra).catch(() => ctx.reply(msg, extra));
    } else {
      await ctx.reply(msg, extra);
    }
  } catch (err) {
    console.error("sendOrEdit error:", err);
  }
};

// Calculate pips for trade accurately (Gold: 1 point / $1.00 = 10 pips, 1 pip = 0.10 price move = $10 / standard lot)
export function calculatePips(pair: string, entry: number, exitPrice: number, pl: number, lot: number, isWin: boolean, isNano: boolean = false): number {
  const p = (pair || 'XAUUSD').toUpperCase();
  const safeLot = lot > 0 ? lot : 0.1;

  // 1. Direct price difference (if entry & exit/tp are given)
  if (entry > 0 && exitPrice > 0 && Math.abs(exitPrice - entry) > 0) {
    let multiplier = 10; // XAUUSD: 1 point ($1.00 move) = 10 pips, 0.10 move = 1 pip
    if (p.includes('JPY')) multiplier = 100;
    else if (p.includes('EUR') || p.includes('GBP') || p.includes('AUD') || p.includes('NZD') || p.includes('CAD') || p.includes('CHF') || (p.includes('USD') && !p.includes('XAU') && !p.includes('BTC') && !p.includes('ETH'))) {
      multiplier = 10000;
    } else if (p.includes('BTC') || p.includes('ETH')) multiplier = 1;

    const diff = Math.round(Math.abs(exitPrice - entry) * multiplier);
    if (diff > 0 && diff < 50000) return isWin ? diff : -diff;
  }

  // 2. Fallback using Realized P&L & lot size:
  // Standard Pip value for 1.00 Lot:
  // - Gold (XAUUSD): 1 pip = 0.10 move = $10 per 1.00 standard lot (100 oz contract)
  // - Major Forex (EURUSD, GBPUSD, etc.): 1 pip = 0.0001 = $10 per 1.00 standard lot
  // - JPY pairs: 1 pip = 0.01 = ~$8.5 - $10 per 1.00 lot
  // - Nano account: Pip value is 1/10th of standard / cent (1¢ / $0.01 per lot)
  // Formula: Pips = P/L / (Lot Size * Pip Value per 1.00 Lot)
  // Example: On Nano, 4 cent profit with 0.04 lot => 4 / (0.04 * 1) = 100 pips!
  // Example: On Standard/Cent, 40 profit with 0.04 lot => 40 / (0.04 * 10) = 100 pips!
  if (pl !== 0 && safeLot > 0) {
    let pipValuePerLot = isNano ? 1 : 10; // Nano: 1¢ per lot | Standard/Cent: $10 / 10¢ per lot
    if (p.includes('BTC') || p.includes('ETH')) {
      pipValuePerLot = isNano ? 0.1 : 1;
    } else if (p.includes('JPY')) {
      pipValuePerLot = isNano ? 0.85 : 8.5;
    }

    const pipWorth = safeLot * pipValuePerLot;
    if (pipWorth > 0) {
      const calculatedPips = Math.round(Math.abs(pl) / pipWorth);
      if (calculatedPips > 0 && calculatedPips < 50000) {
        return pl >= 0 ? calculatedPips : -calculatedPips;
      }
    }
  }

  return Math.round(pl);
}

// Forex & Economic News types and caching
export interface ForexNewsItem {
  title: string;
  country: string;
  date: string;
  impact: string; // 'High' | 'Medium' | 'Low' | 'Holiday'
  forecast?: string;
  previous?: string;
}

let cachedNews: { data: ForexNewsItem[]; fetchedAt: number } | null = null;

export async function fetchForexNews(force = false): Promise<ForexNewsItem[]> {
  const now = Date.now();
  if (!force && cachedNews && (now - cachedNews.fetchedAt < 10 * 60 * 1000)) {
    return cachedNews.data;
  }
  try {
    const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'Mozilla/5.0 (TelegramTradingJournalBot)' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as ForexNewsItem[];
    if (Array.isArray(data) && data.length > 0) {
      cachedNews = { data, fetchedAt: now };
      return data;
    }
  } catch (err) {
    console.warn('Could not fetch live ForexFactory news, using cache or fallback:', err);
  }
  return cachedNews?.data || [];
}

const getCurrencyFlag = (country: string) => {
  switch ((country || '').toUpperCase()) {
    case 'USD': return '🇺🇸';
    case 'EUR': return '🇪🇺';
    case 'GBP': return '🇬🇧';
    case 'JPY': return '🇯🇵';
    case 'AUD': return '🇦🇺';
    case 'CAD': return '🇨🇦';
    case 'CHF': return '🇨🇭';
    case 'NZD': return '🇳🇿';
    case 'CNY': return '🇨🇳';
    default: return '🌐';
  }
};

const getNewsImpactBadge = (impact: string) => {
  switch ((impact || '').toLowerCase()) {
    case 'high': return '🔴 <b>[HIGH]</b>';
    case 'medium': return '🟠 <b>[MED]</b>';
    case 'low': return '🟡 <b>[LOW]</b>';
    default: return '⚪ <b>[HOLIDAY]</b>';
  }
};

// Parse caption or string format trade
export function parseTradeData(content: string) {
  try {
    let parsedPips: number | null = null;
    const pMatch = content.match(/pips?[:\s=]+([+-]?\d+(?:\.\d+)?)/i);
    if (pMatch) {
      parsedPips = parseFloat(pMatch[1]);
    }

    const isJson = content.trim().startsWith('{');
    if (isJson) {
      const json = JSON.parse(content);
      if (json.pips !== undefined && !isNaN(parseFloat(json.pips))) {
        parsedPips = parseFloat(json.pips);
      }
      return {
        dateStr: json.date ? `${json.date}T${json.time || '00:00'}:00` : '',
        pair: json.pair || 'XAUUSD',
        direction: json.direction || 'Buy',
        setup_name: json.setup_name || json.setup || 'Telegram Quick Log',
        entry: parseFloat(json.entry_price || json.entry) || 0,
        sl: parseFloat(json.sl) || 0,
        tp: parseFloat(json.tp) || 0,
        size: parseFloat(json.position_size || json.size) || 0.01,
        result: json.result || 'WIN',
        pl: parseFloat(json.pl || json.realized_pl) || 0,
        pips: parsedPips,
        emotionScore: 2,
        notes: json.notes || json.reason || ''
      };
    } else {
      const parts = content.split(',').map(s => s.trim());
      if (parts.length >= 11) {
        const date = parts[0] || '';
        const time = parts[1] || '';
        let combinedDate = '';
        if (date && time) {
          const cleanDate = date.replace(/\//g, '-').replace(/\./g, '-');
          combinedDate = `${cleanDate}T${time}:00`;
        }

        const rawNotes = parts.length > 12 ? parts.slice(12).join(', ').trim() : '';

        return {
          dateStr: combinedDate,
          pair: parts[2]?.toUpperCase() || 'XAUUSD',
          direction: parts[3]?.toUpperCase().includes('SELL') ? 'Sell' : 'Buy',
          setup_name: parts[4] || 'CSV Import',
          entry: parseFloat(parts[5]) || 0,
          sl: parseFloat(parts[6]) || 0,
          tp: parseFloat(parts[7]) || 0,
          size: parseFloat(parts[8]) || 0.01,
          result: parts[9] || 'WIN',
          pl: parseFloat(parts[10]) || 0,
          pips: parsedPips,
          emotionScore: 2,
          notes: rawNotes || ''
        };
      }
    }
  } catch (e) {
    console.error("Failed to parse trade data:", e);
  }
  return null;
}

export let botStatus = {
  configured: false,
  authenticated: false,
  username: null as string | null,
  error: null as string | null
};

// Interactive Journaling Session per Telegram ID
interface JournalSession {
  step: 'pair' | 'direction' | 'lot' | 'entry' | 'sltp' | 'result' | 'pnl' | 'setup' | 'image';
  pair?: string;
  direction?: 'BUY' | 'SELL';
  lot?: number;
  entry?: number;
  sl?: number;
  tp?: number;
  result?: 'WIN' | 'LOSS' | 'BE' | 'Pending';
  pnl?: number;
  setup?: string;
  image?: string;
  timestamp: number;
}
const journalSessions = new Map<string, JournalSession>();
const pendingPhotos = new Map<string, { image: string; timestamp: number }>();

export async function getTelegramImageBase64(fileLinkUrl: string): Promise<string> {
  try {
    const res = await fetch(fileLinkUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (e) {
    console.error("Failed to convert Telegram image to base64, returning url:", e);
    return fileLinkUrl;
  }
}

// Cleanup stale sessions after 15 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of journalSessions.entries()) {
    if (now - session.timestamp > 15 * 60 * 1000) {
      journalSessions.delete(id);
    }
  }
  for (const [id, photo] of pendingPhotos.entries()) {
    if (now - photo.timestamp > 15 * 60 * 1000) {
      pendingPhotos.delete(id);
    }
  }
}, 60 * 1000);
if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

export function initTelegramBot(db: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '8443526888:AAF8B7uWR5NomsFWGZCac3fE7uuP865A2m4';

  if (!token) {
    botStatus.configured = false;
    botStatus.authenticated = false;
    botStatus.error = 'Token not configured';
    return null;
  }

  botStatus.configured = true;
  const bot = new Telegraf(token);

  // Global update error handler - prevent polling crash
  bot.catch((err: any, ctx: any) => {
    console.error(`Telegram Bot Error for ${ctx?.updateType || 'update'}:`, err?.message || err);
    try {
      if (ctx && ctx.reply) {
        ctx.reply('⚠️ Terjadi sedikit kendala koneksi sistem. Silakan ulangi perintah Anda.');
      }
    } catch (_) {}
  });

  // Verify token with Telegram and initialize bot
  bot.telegram.getMe().then((botInfo) => {
    botStatus.authenticated = true;
    botStatus.username = botInfo.username;
    botStatus.error = null;
    console.log(`🚀 Telegram Bot authenticated successfully as @${botInfo.username}`);

    // Register clean, organized command list to Telegram's built-in command menu
    bot.telegram.setMyCommands([
      { command: 'menu', description: '📱 Buka Control Panel navigasi interaktif' },
      { command: 'help', description: '💡 Panduan lengkap & daftar semua perintah' },
      { command: 'jurnal', description: '📝 Wizard catat trade langkah demi langkah' },
      { command: 'quick', description: '⚡ Catat trade 1 baris: /quick [pair] [buy/sell] [lot] [pnl]' },
      { command: 'buy', description: '🟢 Shortcut catat posisi BUY instan: /buy [pair] [lot] [pnl]' },
      { command: 'sell', description: '🔴 Shortcut catat posisi SELL instan: /sell [pair] [lot] [pnl]' },
      { command: 'running', description: '⏳ Daftar trade terbuka / pending order' },
      { command: 'close', description: '✅ Tutup trade running: /close [id] [win/loss] [pnl]' },
      { command: 'undo', description: '↩️ Batalkan/hapus trade terakhir' },
      { command: 'saldo', description: '💰 Cek saldo modal, equity & status drawdown' },
      { command: 'today', description: '📊 Rekap performa trade hari ini' },
      { command: 'weekly', description: '📈 Rekap performa 7 hari terakhir' },
      { command: 'setmodal', description: '💵 Setel modal awal akun: /setmodal [jumlah]' },
      { command: 'deposit', description: '📥 Catat deposit saldo: /deposit [jumlah]' },
      { command: 'wd', description: '📤 Catat penarikan profit: /wd [jumlah]' },
      { command: 'lot', description: '🧮 Hitung lot otomatis sesuai toleransi risiko' },
      { command: 'setrisk', description: '🛡️ Atur toleransi risiko per trade: /setrisk [%]' },
      { command: 'setaccount', description: '🏷️ Pilih tipe akun: Standard ($), Cent (¢), atau Nano (¢)' },
      { command: 'news', description: '📰 Kalender ekonomi Forex & rilis berita' },
      { command: 'accounts', description: '👥 Kelola akun multi-user & ganti akun' },
      { command: 'reset', description: '⚠️ Reset total data akun (trade log & saldo)' }
    ]).catch((cmdErr: any) => {
      console.warn('⚠️ Could not set Telegram commands:', cmdErr?.message || cmdErr);
    });

    // Start Webhook or Long Polling safely
    const setupBotRunner = async () => {
      const prodUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null));
      
      if (process.env.VERCEL || process.env.NOW_REGION) {
        console.log('⚡ Running in Vercel Serverless: Webhook mode active');
        if (prodUrl) {
          let clean = prodUrl.trim();
          if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = `https://${clean}`;
          }
          if (clean.startsWith('http://') && !clean.includes('localhost')) {
            clean = clean.replace('http://', 'https://');
          }
          const webhookUrl = `${clean.replace(/\/+$/, '')}/api/webhook`;
          try {
            const currentInfo = await bot.telegram.getWebhookInfo();
            if (currentInfo.url !== webhookUrl) {
              await bot.telegram.setWebhook(webhookUrl, {
                allowed_updates: ['message', 'callback_query']
              });
              console.log(`🌐 Telegram Webhook auto-registered: ${webhookUrl}`);
            }
          } catch (whErr: any) {
            console.warn('⚠️ Webhook auto-setup notice:', whErr?.message || whErr);
          }
        }
        return;
      }

      // Outside Vercel: run Long Polling
      bot.telegram.deleteWebhook({ drop_pending_updates: false })
        .catch(() => {})
        .finally(() => {
          bot.launch({
            allowedUpdates: ['message', 'callback_query']
          }).then(() => {
            console.log('🚀 Telegram Bot is actively running (Long Polling)!');
          }).catch((launchErr: any) => {
            console.warn('⚠️ Telegram Bot launch warning:', launchErr?.message || launchErr);
            setTimeout(setupBotRunner, 5000);
          });
        });
    };

    setupBotRunner();
  }).catch((authErr: any) => {
    botStatus.authenticated = false;
    const is401 = authErr?.response?.error_code === 401 || authErr?.message?.includes('401') || authErr?.message?.includes('Unauthorized');
    botStatus.error = is401 ? 'Unauthorized (401): Token is invalid or revoked' : (authErr?.message || 'Authentication failed');
    console.warn('⚠️ Telegram Bot auth failed:', botStatus.error);
  });

  // Ensure helper tables exist
  const ensureTables = async () => {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS telegram_sessions (
          telegram_id TEXT PRIMARY KEY,
          active_user_id INTEGER,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS telegram_accounts (
          telegram_id TEXT,
          user_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (telegram_id, user_id)
        )
      `);
      try {
        await db.execute("ALTER TABLE users ADD COLUMN default_risk REAL DEFAULT 2.5");
      } catch (_) {}
    } catch (e) {
      console.error("ensureTables error:", e);
    }
  };
  ensureTables();

  // Helper: Retrieve Active User for Telegram ID with Multi-Account support & Fallbacks
  const getActiveUser = async (telegramId: string | undefined, telegramUsername?: string | undefined) => {
    if (!telegramId) return null;
    await ensureTables();

    // 1. Check active session
    try {
      const sessionRes = await db.execute({
        sql: `SELECT users.* FROM telegram_sessions 
              JOIN users ON telegram_sessions.active_user_id = users.id 
              WHERE telegram_sessions.telegram_id = ?`,
        args: [telegramId]
      });
      if (sessionRes.rows.length > 0) {
        return sessionRes.rows[0];
      }
    } catch (e) {}

    // 2. Check direct link in users table by telegram_id
    try {
      const userRes = await db.execute({
        sql: "SELECT * FROM users WHERE telegram_id = ?",
        args: [telegramId]
      });
      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        const uId = Number(u.id);
        await db.execute({
          sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
          args: [telegramId, uId]
        }).catch(() => {});
        await db.execute({
          sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
          args: [telegramId, uId]
        }).catch(() => {});
        return u;
      }
    } catch (e) {}

    // 3. Check link by telegram_tag if username provided
    if (telegramUsername) {
      try {
        const cleanTag = telegramUsername.replace(/^@/, '').toLowerCase().trim();
        const tagRes = await db.execute({
          sql: "SELECT * FROM users WHERE LOWER(TRIM(telegram_tag)) = ? OR LOWER(TRIM(telegram_tag)) = ?",
          args: [cleanTag, '@' + cleanTag]
        });
        if (tagRes.rows.length > 0) {
          const u = tagRes.rows[0];
          const uId = Number(u.id);
          await db.execute({
            sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
            args: [telegramId, uId]
          }).catch(() => {});
          await db.execute({
            sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
            args: [telegramId, uId]
          }).catch(() => {});
          await db.execute({
            sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
            args: [telegramId, uId]
          }).catch(() => {});
          return u;
        }
      } catch (e) {}
    }

    // 4. If only 1 user exists or primary user match
    try {
      const allUsers = await db.execute("SELECT * FROM users ORDER BY id ASC");
      if (allUsers.rows.length === 1) {
        const u = allUsers.rows[0];
        const uId = Number(u.id);
        await db.execute({
          sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
          args: [telegramId, uId]
        }).catch(() => {});
        await db.execute({
          sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
          args: [telegramId, uId]
        }).catch(() => {});
        return u;
      }
    } catch (e) {}

    return null;
  };

  // Helper to send Unlinked Account notification with 1-click link buttons
  const sendUnlinkedPrompt = async (ctx: any) => {
    try {
      const usersRes = await db.execute("SELECT id, username FROM users WHERE LOWER(username) != 'aurel' ORDER BY id ASC LIMIT 5");
      const userButtons: any[] = [];
      const rows = usersRes.rows as any[];
      
      const btnRow: any[] = [];
      rows.forEach((u) => {
        btnRow.push(Markup.button.callback(`👤 ${u.username}`, `quick_link_${u.id}`));
      });
      if (btnRow.length > 0) {
        userButtons.push(btnRow);
      }

      const msg = `⚠️ <b>AKUN TELEGRAM BELUM TERHUBUNG</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Akun Telegram Anda belum ditautkan ke akun web trading.\n\n` +
                  `<b>Cara Cepat Menghubungkan:</b>\n` +
                  `1. Klik salah satu akun Anda di tombol bawah untuk langsung menautkan:\n` +
                  `2. Atau ketik perintah: <code>/link username</code> (cth: <code>/link jalu</code>)\n` +
                  `3. Atau login resmi: <code>/login username password</code>`;

      await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: userButtons.length > 0 ? { inline_keyboard: userButtons } : undefined
      });
    } catch (e) {
      await ctx.reply('⚠️ Akun belum terhubung. Gunakan: <code>/link [username]</code> atau <code>/login [username] [password]</code>', { parse_mode: 'HTML' });
    }
  };

  // Helper: Calculate complete user account balance and statistics
  const getUserEquityData = async (userId: number, userData: any) => {
    const isProp = !!userData.prop_firm_enabled;
    const initialBal = isProp ? (userData.prop_firm_balance || 1000) : (userData.initial_balance || 1000);

    const tradesRes = await db.execute({
      sql: "SELECT realized_pl, result, entry_price, sl, tp, pair, position_size, created_at FROM trades WHERE user_id = ? AND result != 'Pending'",
      args: [userId]
    });
    const trades = tradesRes.rows;

    let totalPL = 0;
    let wins = 0;
    let totalPips = 0;
    let winningPips = 0;

    trades.forEach((t: any) => {
      const pl = t.realized_pl || 0;
      totalPL += pl;
      const isWin = (t.result || '').toUpperCase() === 'WIN';
      if (isWin) wins++;

      const pips = (t.pips !== null && t.pips !== undefined && !isNaN(Number(t.pips)))
        ? Number(t.pips)
        : calculatePips(t.pair || 'XAUUSD', t.entry_price || 0, t.tp || 0, pl, t.position_size || 0.1, isWin, userData?.currency === 'NANO');
      totalPips += pips;
      if (pips > 0) winningPips += pips;
    });

    const txRes = await db.execute({
      sql: "SELECT type, amount FROM transactions WHERE user_id = ?",
      args: [userId]
    });
    let totalDeposit = 0;
    let totalWithdraw = 0;
    txRes.rows.forEach((tx: any) => {
      if (tx.type === 'deposit') totalDeposit += (tx.amount || 0);
      if (tx.type === 'withdrawal') totalWithdraw += (tx.amount || 0);
    });

    let currentEquity = initialBal + totalDeposit - totalWithdraw + totalPL;
    if (isProp && userData.prop_firm_payout_total) {
      currentEquity -= (userData.prop_firm_payout_total || 0);
    }

    // Daily Drawdown Check
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let todayLoss = 0;
    let todayTradesCount = 0;
    let todayWins = 0;
    let todayPL = 0;

    trades.forEach((t: any) => {
      let d = t.created_at || '';
      if (!d.includes('Z')) d += 'Z';
      try {
        if (new Date(d).toISOString().split('T')[0] === todayStr) {
          todayTradesCount++;
          const pl = t.realized_pl || 0;
          todayPL += pl;
          if (pl < 0) todayLoss += Math.abs(pl);
          if ((t.result || '').toUpperCase() === 'WIN') todayWins++;
        }
      } catch (e) {}
    });

    const dailyDDPct = userData.prop_firm_daily_dd || 5;
    const dailyMaxLoss = Math.max(25, (initialBal * dailyDDPct) / 100);
    const ddRemaining = Math.max(0, dailyMaxLoss - todayLoss);

    return {
      initialBal,
      totalDeposit,
      totalWithdraw,
      totalPL,
      currentEquity,
      tradesCount: trades.length,
      winRate: trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0.0',
      totalPips,
      winningPips,
      dailyMaxLoss,
      todayLoss,
      ddRemaining,
      todayTradesCount,
      todayWins,
      todayPL,
      todayWinRate: todayTradesCount > 0 ? ((todayWins / todayTradesCount) * 100).toFixed(1) : '0.0'
    };
  };

  // 1-Click Link Button Callback
  bot.action(/quick_link_(\d+)/, async (ctx) => {
    try {
      const targetUserId = parseInt(ctx.match[1], 10);
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;

      const userRes = await db.execute({
        sql: "SELECT * FROM users WHERE id = ?",
        args: [targetUserId]
      });

      if (userRes.rows.length === 0) {
        return ctx.reply('❌ Akun tidak ditemukan.');
      }

      const u = userRes.rows[0] as any;
      await ensureTables();
      await db.execute({
        sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
        args: [telegramId, targetUserId]
      });
      await db.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telegramId, targetUserId]
      });
      await db.execute({
        sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
        args: [telegramId, targetUserId]
      });

      await ctx.editMessageText(
        `✅ <b>AKUN BERHASIL DITAUTKAN!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Akun aktif sekarang: <code>${u.username}</code>\n\n` +
        `Sekarang Anda dapat langsung mencatat trade dengan /jurnal atau /quick!`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Mulai Jurnal Trade', callback_data: 'cmd_start_journal' }],
              [{ text: '💰 Cek Saldo & Equity', callback_data: 'cmd_saldo' }]
            ]
          }
        }
      );
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal menautkan akun.');
    }
  });

  // START & WELCOME COMMAND
  const handleStart = async (ctx: any) => {
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);

    let welcome = `📊 <b>PRO TRADING JOURNAL BOT</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Selamat datang di asisten pencatatan trading otomatis.\n\n`;

    if (user) {
      const stats = await getUserEquityData(user.id, user);
      welcome += `👤 <b>Akun Aktif:</b> <code>${user.username}</code> (${user.current_mode || 'backtest'})\n` +
                 `💰 <b>Equity Terkini:</b> $${stats.currentEquity.toFixed(2)}\n` +
                 `🎯 <b>Total Trades:</b> ${stats.tradesCount} trades | Win Rate: ${stats.winRate}%\n\n`;
    } else {
      welcome += `⚠️ <b>Status Akun:</b> Belum terhubung ke dashboard web.\n` +
                 `Tautkan akun dengan: <code>/link username</code> atau <code>/login user pass</code>\n\n`;
    }

    welcome += `📋 <b>Menu & Perintah Utama:</b>\n` +
               `• <code>/jurnal</code> - 📝 Form interaktif input trade langkah demi langkah\n` +
               `• <code>/quick</code> - ⚡ Catat trade 1 baris cepat\n` +
               `• <code>/buy</code> & <code>/sell</code> - 🟢🔴 Shortcut instan posisi Buy / Sell\n` +
               `• <code>/running</code> - ⏳ Lihat & tutup trade terbuka\n` +
               `• <code>/saldo</code> - 💰 Cek saldo, equity & drawdown\n` +
               `• <code>/today</code> - 📊 Rekap performa hari ini\n` +
               `• <code>/menu</code> - 📱 Buka Control Panel tombol navigasi\n` +
               `• <code>/help</code> - 💡 Panduan format lengkap`;

    const buttons = [
      [Markup.button.callback('📝 Jurnal Trade Baru', 'cmd_start_journal'), Markup.button.callback('💰 Cek Saldo', 'cmd_saldo')],
      [Markup.button.callback('📊 Performa Hari Ini', 'cmd_today'), Markup.button.callback('🧮 Hitung Lot', 'cmd_lot')],
      [Markup.button.callback('📱 Buka Menu Lengkap', 'cmd_menu')]
    ];

    await ctx.reply(welcome, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons }
    });
  };
  bot.start(handleStart);

  // INTERACTIVE JOURNAL WIZARD
  const startJournalWizard = async (ctx: any) => {
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);
    if (!user) {
      return sendUnlinkedPrompt(ctx);
    }

    journalSessions.set(telegramId, {
      step: 'pair',
      timestamp: Date.now()
    });

    const msg = `📝 <b>JURNAL TRADE BARU (Langkah 1/6)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 Akun: <code>${user.username}</code>\n\n` +
                `Pilih instrumen / pair yang Anda tradingkan, atau ketik langsung di chat (cth: <i>EURUSD</i>):`;

    const pairKeyboard = [
      [Markup.button.callback('🟡 XAUUSD (Gold)', 'jp_XAUUSD'), Markup.button.callback('🪙 BTCUSD', 'jp_BTCUSD')],
      [Markup.button.callback('🇪🇺 EURUSD', 'jp_EURUSD'), Markup.button.callback('🇬🇧 GBPUSD', 'jp_GBPUSD')],
      [Markup.button.callback('🇯🇵 USDJPY', 'jp_USDJPY'), Markup.button.callback('🇦🇺 AUDUSD', 'jp_AUDUSD')],
      [Markup.button.callback('❌ Batalkan Jurnal', 'cmd_cancel_journal')]
    ];

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: pairKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: pairKeyboard } }));
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: pairKeyboard } });
    }
  };
  bot.command(['jurnal', 'journal', 'trade', 'catat', 'input'], startJournalWizard);
  bot.action('cmd_start_journal', startJournalWizard);

  // Wizard Action: Pair chosen
  bot.action(/jp_(.+)/, async (ctx) => {
    const pair = ctx.match[1];
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) {
      return ctx.reply('Sesi jurnal telah berakhir. Ketik /jurnal untuk mulai baru.');
    }

    session.pair = pair;
    session.step = 'direction';
    session.timestamp = Date.now();

    const msg = `📝 <b>JURNAL TRADE (Langkah 2/6)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📈 Pair: <b>${pair}</b>\n\n` +
                `Pilih arah posisi trade:`;

    const dirKeyboard = [
      [Markup.button.callback('🟢 BUY (Long)', 'jd_BUY'), Markup.button.callback('🔴 SELL (Short)', 'jd_SELL')],
      [Markup.button.callback('❌ Batalkan', 'cmd_cancel_journal')]
    ];

    await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: dirKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: dirKeyboard } }));
  });

  // Wizard Action: Direction chosen
  bot.action(/jd_(BUY|SELL)/, async (ctx) => {
    const direction = ctx.match[1] as 'BUY' | 'SELL';
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply('Sesi jurnal telah berakhir. Ketik /jurnal untuk mulai baru.');

    session.direction = direction;
    session.step = 'lot';
    session.timestamp = Date.now();

    const dirBadge = direction === 'BUY' ? '🟢 BUY' : '🔴 SELL';
    const msg = `📝 <b>JURNAL TRADE (Langkah 3/6)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📈 Pair: <b>${session.pair}</b> (${dirBadge})\n\n` +
                `Pilih atau ketik ukuran Lot posisi (cth: <i>0.05</i>):`;

    const lotKeyboard = [
      [Markup.button.callback('0.01 Lot', 'jl_0.01'), Markup.button.callback('0.05 Lot', 'jl_0.05'), Markup.button.callback('0.10 Lot', 'jl_0.10')],
      [Markup.button.callback('0.20 Lot', 'jl_0.20'), Markup.button.callback('0.50 Lot', 'jl_0.50'), Markup.button.callback('1.00 Lot', 'jl_1.00')],
      [Markup.button.callback('❌ Batalkan', 'cmd_cancel_journal')]
    ];

    await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: lotKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: lotKeyboard } }));
  });

  // Wizard Action: Lot chosen
  bot.action(/jl_([0-9.]+)/, async (ctx) => {
    const lot = parseFloat(ctx.match[1]);
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply('Sesi jurnal telah berakhir. Ketik /jurnal untuk mulai baru.');

    session.lot = lot;
    session.step = 'entry';
    session.timestamp = Date.now();

    const dirBadge = session.direction === 'BUY' ? '🟢 BUY' : '🔴 SELL';
    const msg = `📝 <b>JURNAL TRADE (Langkah 4/6)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📈 Pair: <b>${session.pair}</b> (${dirBadge}) | Lot: <b>${lot}</b>\n\n` +
                `Ketik harga <b>Entry</b> Anda di chat (cth: <code>2650.50</code>)\n` +
                `<i>Atau klik tombol lewati jika tidak ingin mencatat harga entry.</i>`;

    const skipKeyboard = [
      [Markup.button.callback('⏩ Lewati Entry Price', 'js_skip_entry')],
      [Markup.button.callback('❌ Batalkan', 'cmd_cancel_journal')]
    ];

    await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: skipKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: skipKeyboard } }));
  });

  // Wizard Action: Skip Entry
  bot.action('js_skip_entry', async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply('Sesi jurnal telah berakhir. Ketik /jurnal.');

    session.entry = 0;
    session.step = 'result';
    session.timestamp = Date.now();

    const msg = `📝 <b>JURNAL TRADE (Langkah 5/6)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📈 Pair: <b>${session.pair}</b> (${session.direction}) | Lot: <b>${session.lot}</b>\n\n` +
                `Pilih status hasil dari trade ini:`;

    const resKeyboard = [
      [Markup.button.callback('🏆 WIN (Profit)', 'jr_WIN'), Markup.button.callback('❌ LOSS (Rugi)', 'jr_LOSS')],
      [Markup.button.callback('⚖️ BE (Break Even)', 'jr_BE'), Markup.button.callback('⏳ Masih Berjalan (Running)', 'jr_PENDING')],
      [Markup.button.callback('❌ Batalkan', 'cmd_cancel_journal')]
    ];

    await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: resKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: resKeyboard } }));
  });

  // Wizard Action: Result status chosen
  bot.action(/jr_(WIN|LOSS|BE|PENDING)/, async (ctx) => {
    const res = ctx.match[1];
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply('Sesi jurnal telah berakhir. Ketik /jurnal.');

    session.result = res === 'PENDING' ? 'Pending' : (res as any);
    session.timestamp = Date.now();

    if (res === 'BE') {
      session.pnl = 0;
      session.step = 'setup';
      return promptSetupStep(ctx, session);
    }

    if (res === 'PENDING') {
      session.pnl = 0;
      session.step = 'setup';
      return promptSetupStep(ctx, session);
    }

    session.step = 'pnl';
    const isWin = res === 'WIN';
    const msg = `📝 <b>JURNAL TRADE (Langkah 6/6 - Profit/Loss)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Status: ${isWin ? '🏆 <b>WIN (Profit)</b>' : '❌ <b>LOSS (Rugi)</b>'}\n\n` +
                `Ketik nominal Realized P/L dalam USD ($):\n` +
                `• Contoh jika untung: <code>+125.50</code> atau <code>125</code>\n` +
                `• Contoh jika rugi: <code>-45.00</code> atau <code>45</code>`;

    await ctx.editMessageText(msg, { parse_mode: 'HTML' }).catch(() => ctx.reply(msg, { parse_mode: 'HTML' }));
  });

  // Helper prompt for Setup step
  const promptSetupStep = async (ctx: any, session: JournalSession) => {
    const msg = `🎯 <b>PILIH STRATEGI / SETUP TRADE</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Pilih setup atau ketik catatan strategi Anda di chat:`;

    const setupKeyboard = [
      [Markup.button.callback('Breakout H4/H1', 'jsu_Breakout'), Markup.button.callback('FVG / ICT Concept', 'jsu_FVG')],
      [Markup.button.callback('Support & Resistance', 'jsu_SnR'), Markup.button.callback('Trend Following', 'jsu_Trend')],
      [Markup.button.callback('⏩ Tanpa Setup (Lanjut)', 'jsu_General')]
    ];

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: setupKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: setupKeyboard } }));
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: setupKeyboard } });
    }
  };

  // Helper prompt for Image step
  const promptImageStep = async (ctx: any, session: JournalSession) => {
    session.step = 'image';
    session.timestamp = Date.now();

    const msg = `📸 <b>LAMPIRKAN SCREENSHOT CHART (Opsional)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Kirim foto atau screenshot chart entry Anda sekarang di chat.\n\n` +
                `<i>Atau klik tombol di bawah jika tidak ingin melampirkan gambar.</i>`;

    const imgKeyboard = [
      [Markup.button.callback('⏩ Simpan Tanpa Gambar', 'js_skip_image')],
      [Markup.button.callback('❌ Batalkan Jurnal', 'cmd_cancel_journal')]
    ];

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: imgKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: imgKeyboard } }));
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: imgKeyboard } });
    }
  };

  // Wizard Action: Setup chosen -> Next to image or save
  bot.action(/jsu_(.+)/, async (ctx) => {
    const setup = ctx.match[1];
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply('Sesi jurnal telah berakhir. Ketik /jurnal.');

    session.setup = setup === 'General' ? 'Standard Setup' : setup;
    if (session.image) {
      await completeInteractiveJournal(ctx, telegramId, session);
    } else {
      await promptImageStep(ctx, session);
    }
  });

  // Wizard Action: Skip image -> Save trade
  bot.action('js_skip_image', async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply('Sesi jurnal telah berakhir. Ketik /jurnal.');
    await completeInteractiveJournal(ctx, telegramId, session);
  });

  // Cancel Wizard
  bot.action('cmd_cancel_journal', async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (telegramId) journalSessions.delete(telegramId);
    await ctx.editMessageText('❌ Pencatatan jurnal dibatalkan.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📱 Buka Menu', callback_data: 'cmd_menu' }]]
      }
    }).catch(() => ctx.reply('Pencatatan jurnal dibatalkan.'));
  });

  // Complete and save interactive trade
  const completeInteractiveJournal = async (ctx: any, telegramId: string, s: JournalSession) => {
    try {
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return ctx.reply('❌ Akun tidak ditemukan.');

      journalSessions.delete(telegramId);

      const pair = (s.pair || 'XAUUSD').toUpperCase();
      const direction = s.direction || 'BUY';
      const lot = s.lot || 0.01;
      const entry = s.entry || 0;
      const sl = s.sl || 0;
      const tp = s.tp || 0;
      const result = s.result || 'WIN';
      const pnl = s.pnl || 0;
      const setup = s.setup || 'Telegram Journal';
      const mode = user.current_mode || 'backtest';
      const isWin = result.toUpperCase() === 'WIN';

      const pips = calculatePips(pair, entry, tp, pnl, lot, isWin, user?.currency === 'NANO');

      const insertRes = await db.execute({
        sql: `INSERT INTO trades (
          user_id, pair, direction, setup_name, entry_price, sl, tp,
          account_balance, position_size, result, realized_pl, pips,
          anxiety_level, notes, image, image_url, has_image, run_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          user.id, pair, direction, setup, entry, sl, tp,
          0, lot, result, pnl, pips,
          2, `Logged via Telegram Interactive Wizard`,
          s.image || null, s.image || null, s.image ? 1 : 0, mode
        ]
      });

      const tradeId = insertRes.lastInsertRowid;
      const equityData = await getUserEquityData(user.id, user);

      const signPL = pnl >= 0 ? '+' : '';
      const signPips = pips >= 0 ? '+' : '';

      const card = `✅ <b>TRADE BERHASIL DICATAT!</b>\n` +
                   `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                   `🆔 <b>Trade ID:</b> #${tradeId}\n` +
                   `👤 <b>Akun:</b> <code>${user.username}</code> (${mode})\n` +
                   `📈 <b>Pair:</b> <b>${pair}</b> (${direction === 'BUY' ? '🟢 BUY' : '🔴 SELL'})\n` +
                   `📦 <b>Lot Size:</b> <b>${lot}</b>\n` +
                   (entry > 0 ? `🎯 <b>Entry:</b> ${entry}\n` : '') +
                   (sl > 0 ? `🛑 <b>SL:</b> ${sl} | 🎯 <b>TP:</b> ${tp}\n` : '') +
                   `🏆 <b>Status:</b> <b>${result}</b>\n` +
                   `💵 <b>Realized P/L:</b> <b>${signPL}$${pnl.toFixed(2)}</b>\n` +
                   `📏 <b>Pips:</b> <b>${signPips}${pips} Pips</b>\n` +
                   `🎯 <b>Setup:</b> ${setup}\n` +
                   (s.image ? `📸 <b>Screenshot:</b> Terlampir (Tersimpan di Web)\n` : '') +
                   `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                   `⚡ <b>Equity Terkini:</b> <b>$${equityData.currentEquity.toFixed(2)}</b>\n` +
                   `<i>Data otomatis tersinkronisasi ke Dashboard Web!</i>`;

      const doneKeyboard = [
        [Markup.button.callback('📝 Jurnal Trade Lagi', 'cmd_start_journal'), Markup.button.callback('💰 Cek Saldo', 'cmd_saldo')],
        [Markup.button.callback('📊 Hari Ini', 'cmd_today'), Markup.button.callback('📱 Menu Utama', 'cmd_menu')]
      ];

      if (ctx.callbackQuery) {
        await ctx.editMessageText(card, { parse_mode: 'HTML', reply_markup: { inline_keyboard: doneKeyboard } }).catch(() => ctx.reply(card, { parse_mode: 'HTML', reply_markup: { inline_keyboard: doneKeyboard } }));
      } else {
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: { inline_keyboard: doneKeyboard } });
      }
    } catch (e) {
      console.error("completeInteractiveJournal error:", e);
      await ctx.reply('❌ Terjadi kesalahan saat menyimpan trade.');
    }
  };

  // ONE-LINE QUICK JOURNALING COMMANDS: /quick, /q, /buy, /sell
  const handleQuickTrade = async (ctx: any, forcedDirection?: 'BUY' | 'SELL') => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      const rawText = (ctx.message?.text || '').trim();
      const tokens = rawText.split(/\s+/).slice(1); // omit command

      if (tokens.length === 0) {
        let helpMsg = `⚡ <b>FORMAT PENCATATAN TRADE CEPAT:</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `Gunakan format 1 baris mudah:\n\n` +
                      `1. <b>Shortcut /buy:</b>\n` +
                      `   <code>/buy XAUUSD 0.10 +150 WIN FVG Breakout</code>\n` +
                      `   <code>/buy EURUSD 0.05 +80</code> (Otomatis Win)\n\n` +
                      `2. <b>Shortcut /sell:</b>\n` +
                      `   <code>/sell BTCUSD 0.02 -50 LOSS Setup BoS</code>\n` +
                      `   <code>/sell GBPUSD 0.10 -35</code> (Otomatis Loss)\n\n` +
                      `3. <b>Perintah /quick:</b>\n` +
                      `   <code>/quick XAUUSD BUY 0.10 2650 +200 WIN</code>\n` +
                      `   <code>/quick EURUSD SELL 0.50 -100 LOSS</code>`;
        return ctx.reply(helpMsg, { parse_mode: 'HTML' });
      }

      // Smart parsing of tokens
      let pair = 'XAUUSD';
      let direction: 'BUY' | 'SELL' = forcedDirection || 'BUY';
      let lot = 0.01;
      let entry = 0;
      let sl = 0;
      let tp = 0;
      let pnl = 0;
      let result = 'WIN';
      let parsedImage: string | null = null;
      const notesArr: string[] = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i].toUpperCase();
        
        // Image URL or TradingView link
        if (tokens[i].startsWith('http://') || tokens[i].startsWith('https://')) {
          parsedImage = tokens[i];
          continue;
        }
        if (tokens[i].toLowerCase().startsWith('img=') || tokens[i].toLowerCase().startsWith('image=')) {
          parsedImage = tokens[i].split('=')[1];
          continue;
        }

        // Direction
        if (t === 'BUY' || t === 'LONG') {
          direction = 'BUY';
          continue;
        }
        if (t === 'SELL' || t === 'SHORT') {
          direction = 'SELL';
          continue;
        }

        // Result status
        if (t === 'WIN' || t === 'PROFIT') {
          result = 'WIN';
          continue;
        }
        if (t === 'LOSS' || t === 'RUGI' || t === 'MC') {
          result = 'LOSS';
          continue;
        }
        if (t === 'BE' || t === 'BREAKEVEN') {
          result = 'BE';
          pnl = 0;
          continue;
        }
        if (t === 'RUNNING' || t === 'OPEN' || t === 'PENDING') {
          result = 'Pending';
          pnl = 0;
          continue;
        }

        // SL & TP keywords: sl=2640 tp=2670
        if (tokens[i].toLowerCase().startsWith('sl=')) {
          sl = parseFloat(tokens[i].slice(3)) || 0;
          continue;
        }
        if (tokens[i].toLowerCase().startsWith('tp=')) {
          tp = parseFloat(tokens[i].slice(3)) || 0;
          continue;
        }
        if (tokens[i].toLowerCase().startsWith('entry=')) {
          entry = parseFloat(tokens[i].slice(6)) || 0;
          continue;
        }

        // PNL with sign (+150 or -50)
        if (/^[+-]\d+(\.\d+)?$/.test(tokens[i])) {
          pnl = parseFloat(tokens[i]);
          if (pnl < 0) result = 'LOSS';
          else if (pnl > 0 && result !== 'Pending') result = 'WIN';
          continue;
        }

        // Check if token looks like a forex / crypto pair
        if (/^[A-Z]{6}$/.test(t) || t === 'GOLD' || t === 'BTC' || t === 'ETH' || t === 'US30' || t === 'NAS100') {
          pair = t === 'GOLD' ? 'XAUUSD' : (t === 'BTC' ? 'BTCUSD' : t);
          continue;
        }

        // Check if decimal lot size (e.g. 0.01, 0.10, 0.5, 1.0)
        const num = parseFloat(tokens[i]);
        if (!isNaN(num)) {
          if (num > 0 && num <= 100 && tokens[i].includes('.') && lot === 0.01) {
            lot = num;
            continue;
          }
          if (entry === 0 && num > 100) {
            entry = num;
            continue;
          }
          if (pnl === 0) {
            pnl = num;
            if (pnl < 0) result = 'LOSS';
            continue;
          }
        }

        // Rest are notes
        notesArr.push(tokens[i]);
      }

      // Auto detect result if pnl is positive or negative
      if (pnl > 0 && result !== 'Pending') result = 'WIN';
      if (pnl < 0) result = 'LOSS';

      const setupName = notesArr.length > 0 ? notesArr.join(' ') : 'Quick Telegram Trade';
      const mode = user.current_mode || 'backtest';
      const isWin = result === 'WIN';
      const pips = calculatePips(pair, entry, tp, pnl, lot, isWin, user?.currency === 'NANO');

      const ins = await db.execute({
        sql: `INSERT INTO trades (
          user_id, pair, direction, setup_name, entry_price, sl, tp,
          account_balance, position_size, result, realized_pl, pips,
          anxiety_level, notes, image, image_url, has_image, run_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          user.id, pair, direction, setupName, entry, sl, tp,
          0, lot, result, pnl, pips,
          2, setupName, parsedImage || null, parsedImage || null, parsedImage ? 1 : 0, mode
        ]
      });

      const tradeId = ins.lastInsertRowid;
      const s = await getUserEquityData(user.id, user);

      const signPL = pnl >= 0 ? '+' : '';
      const signPips = pips >= 0 ? '+' : '';

      const msg = `⚡ <b>[QUICK TRADE RECORDED]</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🆔 <b>ID:</b> #${tradeId} | 👤 <b>Akun:</b> <code>${user.username}</code> (${mode})\n` +
                  `📈 <b>Pair:</b> <b>${pair}</b> (${direction === 'BUY' ? '🟢 BUY' : '🔴 SELL'})\n` +
                  `📦 <b>Lot:</b> ${lot}\n` +
                  (entry > 0 ? `🎯 <b>Entry:</b> ${entry}\n` : '') +
                  (sl > 0 ? `🛑 <b>SL:</b> ${sl} | 🎯 <b>TP:</b> ${tp}\n` : '') +
                  `🏆 <b>Status:</b> <b>${result}</b>\n` +
                  `💵 <b>P/L Realized:</b> <b>${signPL}$${pnl.toFixed(2)}</b>\n` +
                  `📏 <b>Pips:</b> <b>${signPips}${pips} Pips</b>\n` +
                  `🎯 <b>Setup:</b> ${setupName}\n` +
                  (parsedImage ? `📸 <b>Screenshot:</b> Terlampir (Bisa dilihat di web)\n` : '') +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `⚡ <b>Equity Baru:</b> <b>$${s.currentEquity.toFixed(2)}</b>`;

      const quickKeys = [
        [Markup.button.callback('📝 Jurnal Lagi', 'cmd_start_journal'), Markup.button.callback('💰 Cek Saldo', 'cmd_saldo')],
        [Markup.button.callback('↩️ Hapus Trade Ini', 'cmd_undo')]
      ];

      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: quickKeys } });
    } catch (e) {
      console.error("Quick trade error:", e);
      await ctx.reply('❌ Terjadi kesalahan saat mencatat quick trade.');
    }
  };

  bot.command(['quick', 'q'], (ctx) => handleQuickTrade(ctx));
  bot.command('buy', (ctx) => handleQuickTrade(ctx, 'BUY'));
  bot.command('sell', (ctx) => handleQuickTrade(ctx, 'SELL'));

  // RUNNING / PENDING ORDERS COMMANDS: /running, /open, /close
  const handleRunningTrades = async (ctx: any) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      const openRes = await db.execute({
        sql: "SELECT * FROM trades WHERE user_id = ? AND result = 'Pending' ORDER BY id DESC LIMIT 10",
        args: [user.id]
      });

      const openTrades = openRes.rows as any[];
      if (openTrades.length === 0) {
        const noTradeMsg = `⏳ <b>TIDAK ADA TRADE BERJALAN</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Semua trade Anda telah ditutup / realized.\n\n` +
          `Untuk mencatat posisi baru yang sedang berjalan, gunakan:\n` +
          `<code>/quick [pair] [buy/sell] [lot] [entry] RUNNING</code>\n` +
          `Contoh: <code>/quick XAUUSD BUY 0.10 2650 RUNNING</code>`;
        
        if (ctx.callbackQuery) {
          return ctx.editMessageText(noTradeMsg, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'cmd_menu' }]] }
          }).catch(() => ctx.reply(noTradeMsg, { parse_mode: 'HTML' }));
        }
        return ctx.reply(noTradeMsg, { parse_mode: 'HTML' });
      }

      let msg = `⏳ <b>DAFTAR TRADE RUNNING / PENDING (${openTrades.length})</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 Akun: <code>${user.username}</code>\n\n`;

      const buttons: any[] = [];
      openTrades.forEach((t) => {
        msg += `• <b>#${t.id} ${t.pair}</b> (${t.direction}) | Lot: ${t.position_size || 0.01}\n` +
               `  Entry: ${t.entry_price || '-'} | SL: ${t.sl || '-'} | TP: ${t.tp || '-'}\n` +
               `  Setup: <i>${t.setup_name || '-'}</i>\n\n`;

        buttons.push([
          Markup.button.callback(`✅ Tutup #${t.id} WIN`, `close_trade_${t.id}_WIN`),
          Markup.button.callback(`❌ Tutup #${t.id} LOSS`, `close_trade_${t.id}_LOSS`)
        ]);
      });

      msg += `💡 <i>Klik tombol di atas atau ketik:</i>\n` +
             `<code>/close [id] [win/loss] [p/l]</code> (Contoh: <code>/close ${openTrades[0].id} win 120</code>)`;

      buttons.push([{ text: '🔙 Menu Utama', callback_data: 'cmd_menu' }]);

      if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }).catch(() => ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }));
      } else {
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
      }
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Terjadi kesalahan saat memuat trade running.');
    }
  };
  bot.command(['running', 'pending', 'open'], handleRunningTrades);

  // Action callback: close trade with prompt
  bot.action(/close_trade_(\d+)_(WIN|LOSS)/, async (ctx) => {
    const tradeId = parseInt(ctx.match[1], 10);
    const result = ctx.match[2];
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);
    if (!user) return ctx.reply('❌ Akun belum terhubung.');

    const promptText = `Ketik nominal P/L penutupan untuk trade <b>#${tradeId}</b> (${result}):\n` +
                       `Ketik perintah: <code>/close ${tradeId} ${result.toLowerCase()} [nominal_dollar]</code>\n` +
                       `Contoh: <code>/close ${tradeId} ${result.toLowerCase()} ${result === 'WIN' ? '150' : '-50'}</code>`;

    await ctx.reply(promptText, { parse_mode: 'HTML' });
  });

  // Command: /close [id] [win/loss] [pnl]
  bot.command('close', async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 4) {
        return ctx.reply(
          `❌ <b>Format Salah</b>\n` +
          `Gunakan: <code>/close [id] [win/loss/be] [pnl]</code>\n` +
          `Contoh untung: <code>/close 15 win 125.50</code>\n` +
          `Contoh rugi: <code>/close 15 loss -40</code>`,
          { parse_mode: 'HTML' }
        );
      }

      const tradeId = parseInt(parts[1], 10);
      const resStatus = parts[2].toUpperCase();
      let pnl = parseFloat(parts[3]) || 0;
      if (resStatus === 'LOSS' && pnl > 0) pnl = -pnl;

      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      const tradeRes = await db.execute({
        sql: "SELECT * FROM trades WHERE id = ? AND user_id = ?",
        args: [tradeId, user.id]
      });

      if (tradeRes.rows.length === 0) {
        return ctx.reply(`❌ Trade #${tradeId} tidak ditemukan.`);
      }

      const trade = tradeRes.rows[0] as any;
      const isWin = resStatus === 'WIN';
      const pips = calculatePips(trade.pair, trade.entry_price || 0, trade.tp || 0, pnl, trade.position_size || 0.01, isWin, user?.currency === 'NANO');

      await db.execute({
        sql: "UPDATE trades SET result = ?, realized_pl = ?, pips = ? WHERE id = ?",
        args: [resStatus, pnl, pips, tradeId]
      });

      const s = await getUserEquityData(user.id, user);

      const sign = pnl >= 0 ? '+' : '';
      const msg = `✅ <b>[TRADE #${tradeId} DITUTUP]</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `📈 Pair: <b>${trade.pair}</b> (${trade.direction})\n` +
                  `🏆 Status: <b>${resStatus}</b>\n` +
                  `💵 Realized P/L: <b>${sign}$${pnl.toFixed(2)}</b>\n` +
                  `📏 Pips: <b>${pips} Pips</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `⚡ Equity Terkini: <b>$${s.currentEquity.toFixed(2)}</b>`;

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal menutup trade.');
    }
  });

  // COMMAND: /saldo /balance /stats
  const handleSaldo = async (ctx: any) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      const s = await getUserEquityData(user.id, user);
      const signPL = s.totalPL >= 0 ? '+' : '';
      const isCent = user.currency === 'USC' || user.currency === 'NANO';
      const sym = isCent ? '¢' : (user.currency === 'IDR' ? 'Rp ' : '$');
      const isNano = user.currency === 'NANO';
      const typeLabel = isNano ? 'Nano (1¢/lot)' : isCent ? 'Cent (10¢/lot)' : 'Standard ($10/lot)';

      let msg = `💰 <b>RINGKASAN SALDO & EQUITY TRADING</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 <b>Akun:</b> <code>${user.username}</code>\n` +
                `🏷️ <b>Tipe:</b> <code>${typeLabel}</code> | <b>Mode:</b> <code>${user.current_mode || 'backtest'}</code>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `💵 <b>Modal Awal:</b> ${sym}${s.initialBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n` +
                `📥 <b>Total Deposit:</b> +${sym}${s.totalDeposit.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n` +
                `📤 <b>Total Penarikan (WD):</b> -${sym}${s.totalWithdraw.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n` +
                `📊 <b>Net Realized P/L:</b> <b>${signPL}${sym}${s.totalPL.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>\n` +
                `────────────────────────────\n` +
                `⚡ <b>CURRENT EQUITY:</b> <b>${sym}${s.currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `🎯 <b>Performa Trading:</b>\n` +
                `• Win Rate: <b>${s.winRate}%</b> (${s.tradesCount} total trades)\n` +
                `• Akumulasi Pips: <b>${s.totalPips >= 0 ? '+' : ''}${s.totalPips} Pips</b>\n` +
                `• Sisa Buffer Drawdown Hari Ini: <b>${sym}${s.ddRemaining.toFixed(2)}</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `<i>💡 Gunakan <code>/setmodal [jumlah]</code> untuk mengubah modal awal akun.</i>`;

      const buttons = [
        [Markup.button.callback('📝 Jurnal Trade Baru', 'cmd_start_journal'), Markup.button.callback('📊 Hari Ini', 'cmd_today')],
        [Markup.button.callback('💰 Ubah Modal (/setmodal)', 'cmd_setmodal'), Markup.button.callback('🧮 Hitung Lot (/lot)', 'cmd_lot')],
        [Markup.button.callback('🔙 Menu Utama', 'cmd_menu')]
      ];

      await sendOrEdit(ctx, msg, false, buttons);
    } catch (e) {
      console.error(e);
      await ctx.reply('Terjadi kesalahan saat memuat saldo.');
    }
  };
  bot.command(['saldo', 'balance'], handleSaldo);
  bot.action('cmd_saldo', handleSaldo);

  // COMMAND: /today /weekly /monthly /stats
  const getStatsByTimeframe = async (ctx: any, timeframe: string) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      const s = await getUserEquityData(user.id, user);

      const tradesRes = await db.execute({
        sql: "SELECT * FROM trades WHERE user_id = ? AND result != 'Pending' ORDER BY created_at ASC",
        args: [user.id]
      });
      const allTrades = tradesRes.rows as any[];

      const now = new Date();
      let label = "HARI INI";
      let filteredTrades = allTrades;

      if (timeframe === 'today') {
        label = "HARI INI";
        const todayStr = now.toISOString().split('T')[0];
        filteredTrades = allTrades.filter((t: any) => {
          let d = t.created_at || '';
          if (!d.includes('Z')) d += 'Z';
          try {
            return new Date(d).toISOString().split('T')[0] === todayStr;
          } catch(e) { return false; }
        });
      } else if (timeframe === 'weekly') {
        label = "7 HARI TERAKHIR";
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filteredTrades = allTrades.filter((t: any) => {
          let d = t.created_at || '';
          if (!d.includes('Z')) d += 'Z';
          try {
            return new Date(d) >= sevenDaysAgo;
          } catch(e) { return false; }
        });
      } else if (timeframe === 'monthly') {
        label = "BULAN INI";
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        filteredTrades = allTrades.filter((t: any) => {
          let d = t.created_at || '';
          if (!d.includes('Z')) d += 'Z';
          try {
            const tDate = new Date(d);
            return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
          } catch(e) { return false; }
        });
      }

      let totalPL = 0;
      let wins = 0;
      let losses = 0;
      let grossProfit = 0;
      let grossLoss = 0;

      filteredTrades.forEach((t: any) => {
        const pl = t.realized_pl || 0;
        totalPL += pl;
        if ((t.result || '').toUpperCase() === 'WIN') {
          wins++;
          grossProfit += Math.max(0, pl);
        } else if ((t.result || '').toUpperCase() === 'LOSS') {
          losses++;
          grossLoss += Math.abs(Math.min(0, pl));
        }
      });

      const winRate = filteredTrades.length > 0 ? ((wins / filteredTrades.length) * 100).toFixed(1) : '0.0';
      const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 'MAX' : '0.00');
      const signPL = totalPL >= 0 ? '+' : '';

      const msg = `📊 <b>RINGKASAN PERFORMA: ${label}</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `👤 <b>Akun:</b> <code>${user.username}</code>\n` +
                  `📦 <b>Total Trades:</b> <b>${filteredTrades.length}</b> (Menang: ${wins} | Kalah: ${losses})\n` +
                  `🎯 <b>Win Rate:</b> <b>${winRate}%</b>\n` +
                  `⚖️ <b>Profit Factor:</b> <b>${profitFactor}</b>\n` +
                  `💵 <b>Net Realized P/L:</b> <b>${signPL}$${totalPL.toFixed(2)}</b>\n` +
                  `────────────────────────────\n` +
                  `⚡ <b>Equity Terkini:</b> <b>$${s.currentEquity.toFixed(2)}</b>`;

      const buttons = [
        [Markup.button.callback('📊 Hari Ini', 'cmd_today'), Markup.button.callback('📈 7 Hari', 'cmd_weekly')],
        [Markup.button.callback('📝 Jurnal Trade Baru', 'cmd_start_journal'), Markup.button.callback('🔙 Menu', 'cmd_menu')]
      ];

      await sendOrEdit(ctx, msg, false, buttons);
    } catch (e) {
      console.error(e);
      await ctx.reply('Terjadi kesalahan saat memuat statistik.');
    }
  };

  bot.command('today', (ctx) => getStatsByTimeframe(ctx, 'today'));
  bot.command('weekly', (ctx) => getStatsByTimeframe(ctx, 'weekly'));
  bot.command('monthly', (ctx) => getStatsByTimeframe(ctx, 'monthly'));
  bot.command('stats', (ctx) => getStatsByTimeframe(ctx, 'all'));
  bot.action('cmd_today', (ctx) => getStatsByTimeframe(ctx, 'today'));
  bot.action('cmd_weekly', (ctx) => getStatsByTimeframe(ctx, 'weekly'));

  // COMMAND: /lot - Automatic position size calculator with custom risk integration
  const handleLotCalc = async (ctx: any) => {
    try {
      const parts = (ctx.message?.text || '').trim().split(/\s+/);
      const customPips = parts.length > 1 ? parseFloat(parts[1]) : null;

      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      const eq = user ? (await getUserEquityData(user.id, user)).currentEquity : 1000;
      const userRisk = (user && user.default_risk !== undefined && user.default_risk !== null && !isNaN(Number(user.default_risk)))
        ? Number(user.default_risk)
        : 2.5;

      const isNano = user?.currency === 'NANO';
      const isCent = user?.currency === 'USC';
      const pipMultiplier = isNano ? 1 : 10;
      const unitSym = isNano ? '¢' : (isCent ? '¢' : '$');
      const accountTypeName = isNano ? 'Nano (1 pip = 1¢/lot)' : (isCent ? 'Cent (1 pip = 10¢/lot)' : 'Standard (1 pip = $10/lot)');

      const userRiskNominal = (eq * (userRisk / 100));

      let msg = `🧮 <b>KALKULATOR LOT & RISK MANAGEMENT</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 Akun: <b>${user?.username || 'Trader'}</b>\n` +
                `🏷️ Tipe Akun: <b>${accountTypeName}</b>\n` +
                `💰 Equity: <b>${unitSym}${eq.toFixed(2)}</b>\n` +
                `🛡️ Setting Risiko: <b>${userRisk}%</b> (Ganti: <code>/setrisk</code>)\n` +
                `💡 Pip Value: <b>${isNano ? '1¢ ($0.01)' : isCent ? '10¢ ($0.10)' : '$10.00'} / 1.00 Lot</b>\n\n`;

      if (customPips && customPips > 0) {
        const userLot = userRiskNominal / (customPips * pipMultiplier);
        const risk1Lot = (eq * 0.01) / (customPips * pipMultiplier);
        const risk2Lot = (eq * 0.02) / (customPips * pipMultiplier);

        msg += `🎯 <b>Stop Loss: ${customPips} Pips</b>\n` +
               `⭐ <b>Rekomendasi Anda (${userRisk}% = ${unitSym}${userRiskNominal.toFixed(2)}):</b> ➡️ <b>${userLot.toFixed(2)} Lot</b>\n\n` +
               `<i>Perbandingan toleransi risiko lain:</i>\n` +
               `• Risk 1.0% (${unitSym}${(eq * 0.01).toFixed(2)}) ➡️ <b>${risk1Lot.toFixed(2)} Lot</b>\n` +
               `• Risk 2.0% (${unitSym}${(eq * 0.02).toFixed(2)}) ➡️ <b>${risk2Lot.toFixed(2)} Lot</b>\n\n` +
               `<i>Formula: Lot = Nominal Risk / (SL Pips × ${pipMultiplier})</i>\n` +
               `<i>(0.04 Lot × 100 Pips = ${isNano ? '4¢' : isCent ? '40¢' : '$40'})</i>`;
      } else {
        msg += `🛡️ <b>Rekomendasi Lot (Setting Risiko ${userRisk}% = ${unitSym}${userRiskNominal.toFixed(2)}):</b>\n` +
               `• SL 15 pips ➡️ <b>${(userRiskNominal / (15 * pipMultiplier)).toFixed(2)} Lot</b>\n` +
               `• SL 20 pips ➡️ <b>${(userRiskNominal / (20 * pipMultiplier)).toFixed(2)} Lot</b>\n` +
               `• SL 25 pips ➡️ <b>${(userRiskNominal / (25 * pipMultiplier)).toFixed(2)} Lot</b>\n` +
               `• SL 30 pips ➡️ <b>${(userRiskNominal / (30 * pipMultiplier)).toFixed(2)} Lot</b>\n` +
               `• SL 40 pips ➡️ <b>${(userRiskNominal / (40 * pipMultiplier)).toFixed(2)} Lot</b>\n` +
               `• SL 50 pips ➡️ <b>${(userRiskNominal / (50 * pipMultiplier)).toFixed(2)} Lot</b>\n\n` +
               `<i>💡 Ketik <code>/lot [pips]</code> untuk menghitung SL spesifik (cth: <code>/lot 25</code>).\n` +
               `Ketik <code>/setrisk [persen]</code> untuk mengatur persentase risiko.\n` +
               `Ketik <code>/setaccount [nano/cent/standard]</code> untuk ganti tipe akun.</i>`;
      }

      const buttons = [
        [
          { text: isNano ? '✅ Nano (1¢)' : 'Ganti ke Nano (1¢)', callback_data: 'cmd_set_account_nano' },
          { text: isCent ? '✅ Cent (10¢)' : 'Ganti ke Cent (10¢)', callback_data: 'cmd_set_account_cent' },
          { text: (!isNano && !isCent) ? '✅ Standard ($10)' : 'Ganti Standard ($10)', callback_data: 'cmd_set_account_standard' }
        ],
        [
          { text: '🛡️ Atur Risiko (/setrisk)', callback_data: 'cmd_setrisk' },
          { text: '📱 Menu Utama', callback_data: 'cmd_menu' }
        ]
      ];

      await sendOrEdit(ctx, msg, false, buttons);
    } catch (e) {
      console.error(e);
      await ctx.reply('Terjadi kesalahan kalkulator lot.');
    }
  };
  bot.command('lot', handleLotCalc);
  bot.action('cmd_lot', handleLotCalc);

  // COMMAND: /setaccount - Configure account type (Standard, Cent, Nano)
  const handleSetAccount = async (ctx: any, targetType?: string) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) {
        return ctx.reply('⚠️ Akun belum terhubung. Gunakan <code>/link [username]</code> terlebih dahulu.', { parse_mode: 'HTML' });
      }

      let chosen = targetType;
      if (!chosen) {
        const text = (ctx.message?.text || '').trim().toLowerCase();
        const parts = text.split(/\s+/);
        if (parts.length > 1) {
          const arg = parts[1];
          if (arg.includes('nano')) chosen = 'NANO';
          else if (arg.includes('cent') || arg.includes('usc')) chosen = 'USC';
          else if (arg.includes('usd') || arg.includes('standard')) chosen = 'USD';
        }
      }

      if (chosen && ['NANO', 'USC', 'USD'].includes(chosen)) {
        await ensureTables();
        await db.execute({
          sql: "UPDATE users SET currency = ? WHERE id = ?",
          args: [chosen, user.id]
        });
        user.currency = chosen;

        const isNano = chosen === 'NANO';
        const isCent = chosen === 'USC';
        const label = isNano 
          ? 'Nano (1 pip = 1¢ | 0.04 lot 100 pips = 4¢)' 
          : isCent 
          ? 'Cent (1 pip = 10¢ | 0.04 lot 100 pips = 40¢)' 
          : 'Standard (1 pip = $10 | 0.04 lot 100 pips = $40)';

        const successMsg =
          `🏷️ <b>TIPE AKUN BERHASIL DIPERBARUI!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 Akun: <b>${user.username}</b>\n` +
          `⚡ Tipe Baru: <b>${label}</b>\n\n` +
          `💡 <i>Kini kalkulasi lot <code>/lot</code> dan penghitungan pips trade otomatis menggunakan multiplier akun ${chosen}!</i>`;

        const btns = [
          [{ text: '🧮 Hitung Lot Sekarang', callback_data: 'cmd_lot' }],
          [{ text: '📱 Buka Menu Utama', callback_data: 'cmd_menu' }]
        ];
        return sendOrEdit(ctx, successMsg, false, btns);
      }

      // Show interactive selection
      const current = user.currency || 'USD';
      const currentLabel = current === 'NANO' ? 'Nano (1¢/lot)' : current === 'USC' ? 'Cent (10¢/lot)' : 'Standard ($10/lot)';
      const msg =
        `🏷️ <b>PILIH TIPE AKUN TRADING</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 Akun: <b>${user.username}</b>\n` +
        `Status Saat Ini: <b>${currentLabel}</b>\n\n` +
        `Pilih tipe akun Anda di bawah ini agar rumus lot & pips akurat:\n` +
        `• <b>Standard (USD):</b> 1 lot = $10/pip | 0.04 lot 100 pips = $40.00\n` +
        `• <b>Cent (USC):</b> 1 lot = 10¢/pip | 0.04 lot 100 pips = 40¢\n` +
        `• <b>Nano:</b> 1 lot = 1¢/pip | 0.04 lot 100 pips = 4¢\n\n` +
        `<i>Atau ketik <code>/setaccount nano</code>, <code>/setaccount cent</code>, atau <code>/setaccount standard</code></i>`;

      const btns = [
        [
          { text: current === 'NANO' ? '✅ Nano (1¢)' : 'Nano (1¢)', callback_data: 'cmd_set_account_nano' },
          { text: current === 'USC' ? '✅ Cent (10¢)' : 'Cent (10¢)', callback_data: 'cmd_set_account_cent' },
          { text: (current !== 'NANO' && current !== 'USC') ? '✅ Standard ($10)' : 'Standard ($10)', callback_data: 'cmd_set_account_standard' }
        ],
        [{ text: '📱 Kembali ke Menu', callback_data: 'cmd_menu' }]
      ];
      return sendOrEdit(ctx, msg, false, btns);
    } catch (e) {
      console.error(e);
      await ctx.reply('Terjadi kesalahan saat mengatur tipe akun.');
    }
  };

  bot.command('setaccount', (ctx: any) => handleSetAccount(ctx));
  bot.command('accounttype', (ctx: any) => handleSetAccount(ctx));
  bot.action('cmd_setaccount', (ctx: any) => handleSetAccount(ctx));
  bot.action('cmd_set_account_nano', (ctx: any) => handleSetAccount(ctx, 'NANO'));
  bot.action('cmd_set_account_cent', (ctx: any) => handleSetAccount(ctx, 'USC'));
  bot.action('cmd_set_account_standard', (ctx: any) => handleSetAccount(ctx, 'USD'));

  // COMMAND: /setrisk - Configure risk percentage per trade
  const handleSetRisk = async (ctx: any, customValue?: number) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) {
        return ctx.reply('⚠️ Akun belum terhubung. Gunakan <code>/link [username]</code> terlebih dahulu.', { parse_mode: 'HTML' });
      }

      let targetRisk = customValue;
      if (targetRisk === undefined) {
        const text = (ctx.message?.text || '').trim();
        const parts = text.split(/\s+/);
        if (parts.length > 1) {
          const parsed = parseFloat(parts[1].replace('%', ''));
          if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
            targetRisk = parsed;
          }
        }
      }

      if (targetRisk !== undefined && !isNaN(targetRisk) && targetRisk > 0 && targetRisk <= 50) {
        await ensureTables();
        await db.execute({
          sql: "UPDATE users SET default_risk = ? WHERE id = ?",
          args: [targetRisk, user.id]
        });
        user.default_risk = targetRisk;

        const equityData = await getUserEquityData(user.id, user);
        const eq = equityData.currentEquity;
        const nominalRisk = (eq * targetRisk) / 100;

        const successMsg =
          `🛡️ <b>TOLERANSI RISIKO DIPERBARUI!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 Akun: <b>${user.username}</b>\n` +
          `⚡ Risiko Baru: <b>${targetRisk}% per trade</b>\n` +
          `💰 Nominal Risiko (Equity $${eq.toFixed(2)}): <b>$${nominalRisk.toFixed(2)}</b>\n\n` +
          `💡 <i>Kini setiap kalkulasi <code>/lot</code> dan rekomendasi posisi otomatis menggunakan acuan <b>${targetRisk}%</b> modal Anda.</i>`;

        const customButtons = [
          [{ text: '🧮 Hitung Lot Sekarang', callback_data: 'cmd_lot' }],
          [{ text: '📱 Buka Menu Utama', callback_data: 'cmd_menu' }]
        ];
        return sendOrEdit(ctx, successMsg, false, customButtons);
      }

      // Show current risk setting and interactive buttons
      const currentRisk = (user.default_risk !== undefined && user.default_risk !== null && !isNaN(Number(user.default_risk)))
        ? Number(user.default_risk)
        : 2.5;

      const equityData = await getUserEquityData(user.id, user);
      const eq = equityData.currentEquity;
      const nominalCurrent = (eq * currentRisk) / 100;

      const msg =
        `🛡️ <b>PENGATURAN TOLERANSI RISIKO (/setrisk)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 Akun: <b>${user.username}</b>\n` +
        `🎯 Toleransi Saat Ini: <b>${currentRisk}% per trade</b>\n` +
        `💵 Maksimal Loss per Trade: <b>$${nominalCurrent.toFixed(2)}</b> (Equity: $${eq.toFixed(2)})\n\n` +
        `Pilih persentase risiko cepat di bawah, atau ketik langsung:\n` +
        `<code>/setrisk [persen]</code> (contoh: <code>/setrisk 1.5</code>)`;

      const customButtons = [
        [
          { text: '🛡️ 0.5% (Sangat Aman)', callback_data: 'setrisk_0.5' },
          { text: '🛡️ 1.0% (Konservatif)', callback_data: 'setrisk_1.0' }
        ],
        [
          { text: '🛡️ 1.5% (Disiplin)', callback_data: 'setrisk_1.5' },
          { text: '🛡️ 2.0% (Standar Forex)', callback_data: 'setrisk_2.0' }
        ],
        [
          { text: '🛡️ 2.5% (Agresif Terukur)', callback_data: 'setrisk_2.5' },
          { text: '🛡️ 3.0% (Maksimal)', callback_data: 'setrisk_3.0' }
        ]
      ];

      await sendOrEdit(ctx, msg, true, customButtons);
    } catch (e) {
      console.error('handleSetRisk error:', e);
      await ctx.reply('Terjadi kesalahan saat mengatur toleransi risiko.');
    }
  };

  bot.command('setrisk', (ctx) => handleSetRisk(ctx));
  bot.action('cmd_setrisk_menu', (ctx) => handleSetRisk(ctx));
  bot.action(/^setrisk_(\d+(?:\.\d+)?)$/, async (ctx) => {
    const val = parseFloat(ctx.match[1]);
    await handleSetRisk(ctx, val);
  });

  // COMMAND: /news - Forex & Economic News Calendar
  const handleNews = async (ctx: any, filterMode: 'high' | 'today' | 'usd' | 'all' = 'high') => {
    try {
      const text = (ctx.message?.text || '').trim();
      const parts = text.split(/\s+/);
      let mode = filterMode;
      if (parts.length > 1) {
        const arg = parts[1].toLowerCase();
        if (arg === 'today' || arg === 'hariini') mode = 'today';
        else if (arg === 'usd' || arg === 'gold' || arg === 'xau') mode = 'usd';
        else if (arg === 'all' || arg === 'semua') mode = 'all';
        else if (arg === 'high') mode = 'high';
      }

      const allEvents = await fetchForexNews(filterMode === 'all');
      if (!allEvents || allEvents.length === 0) {
        const fallbackMsg =
          `📰 <b>KALENDER FOREX & JADWAL SESI TRADING</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ <i>Data kalender eksternal sedang dalam pembaruan. Jadwal Sesi Utama (WIB):</i>\n\n` +
          `🌏 <b>Sesi Tokyo (Asia):</b> 07:00 - 16:00 WIB\n` +
          `🇬🇧 <b>Sesi London (Eropa):</b> 14:00 - 23:00 WIB\n` +
          `🇺🇸 <b>Sesi New York (US):</b> 19:00 - 04:00 WIB\n\n` +
          `🔥 <i>Waktu Overlap Volatilitas Tertinggi: 19:00 - 23:00 WIB</i>`;
        return sendOrEdit(ctx, fallbackMsg, true);
      }

      const now = new Date();
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);

      let filtered = allEvents.filter(ev => {
        const evDate = new Date(ev.date);
        const evDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(evDate);

        if (mode === 'today') {
          return evDateStr === todayStr && (ev.impact === 'High' || ev.impact === 'Medium');
        } else if (mode === 'usd') {
          return ev.country.toUpperCase() === 'USD' && (ev.impact === 'High' || ev.impact === 'Medium');
        } else if (mode === 'all') {
          return true;
        } else {
          return ev.impact === 'High';
        }
      });

      let fallbackNote = '';
      if (filtered.length === 0) {
        if (mode === 'today') {
          fallbackNote = '<i>(Event High/Med hari ini sudah selesai atau libur. Menampilkan High-Impact terdekat:)</i>\n';
          filtered = allEvents.filter(ev => ev.impact === 'High').slice(0, 7);
        } else {
          filtered = allEvents.slice(0, 8);
        }
      }

      const displayEvents = filtered.slice(0, 8);
      const modeTitle = mode === 'today' ? '📅 HARI INI' : mode === 'usd' ? '🇺🇸 USD & GOLD IMPACT' : mode === 'all' ? '🌐 SEMUA BERITA' : '🔥 HIGH IMPACT ONLY';

      let msg = `📰 <b>KALENDER FOREX & ECONOMIC NEWS</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Filter: <b>${modeTitle}</b> | Waktu: <b>WIB (UTC+7)</b>\n` +
                (fallbackNote ? `${fallbackNote}\n` : '\n');

      displayEvents.forEach(item => {
        const evDate = new Date(item.date);
        const dateStr = evDate.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
        const timeStr = evDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace('.', ':');
        const flag = getCurrencyFlag(item.country);
        const badge = getNewsImpactBadge(item.impact);

        msg += `📅 <b>${dateStr}</b> - <b>${timeStr} WIB</b>\n` +
               `${flag} <b>${item.country}</b> | ${badge}\n` +
               `📌 <b>${item.title}</b>\n`;
        if (item.forecast || item.previous) {
          msg += `   <i>Forecast: ${item.forecast || '-'} | Prev: ${item.previous || '-'}</i>\n`;
        }
        msg += `\n`;
      });

      msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `<i>⚠️ Waspadai lonjakan spread & slippage menjelang berita High Impact dirilis!</i>`;

      const customButtons = [
        [
          { text: '🔥 High Impact', callback_data: 'news_high' },
          { text: '📅 Hari Ini', callback_data: 'news_today' }
        ],
        [
          { text: '🇺🇸 USD Saja (Gold)', callback_data: 'news_usd' },
          { text: '🌐 Semua Berita', callback_data: 'news_all' }
        ],
        [
          { text: '🔄 Refresh News', callback_data: 'news_refresh' }
        ]
      ];

      await sendOrEdit(ctx, msg, true, customButtons);
    } catch (err: any) {
      console.error('handleNews error:', err);
      await ctx.reply('Terjadi kesalahan memuat berita forex.');
    }
  };

  bot.command('news', (ctx) => handleNews(ctx, 'high'));
  bot.action('cmd_news', (ctx) => handleNews(ctx, 'high'));
  bot.action('news_high', (ctx) => handleNews(ctx, 'high'));
  bot.action('news_today', (ctx) => handleNews(ctx, 'today'));
  bot.action('news_usd', (ctx) => handleNews(ctx, 'usd'));
  bot.action('news_all', (ctx) => handleNews(ctx, 'all'));
  bot.action('news_refresh', async (ctx) => {
    cachedNews = null;
    await handleNews(ctx, 'high');
  });

  // COMMAND: /deposit & /wd
  bot.command(['deposit', 'topup'], async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 2) {
        return ctx.reply('❌ Format salah.\nGunakan: <code>/deposit [jumlah]</code>\nContoh: <code>/deposit 500</code>', { parse_mode: 'HTML' });
      }

      const amount = parseFloat(parts[1].replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ Jumlah nominal harus lebih dari 0.');
      }

      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      await db.execute({
        sql: "INSERT INTO transactions (user_id, type, amount) VALUES (?, 'deposit', ?)",
        args: [user.id, amount]
      });

      const s = await getUserEquityData(user.id, user);

      const msg = `📥 <b>[DEPOSIT BERHASIL DICATAT]</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `💵 Jumlah: <b>+$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>\n` +
                  `👤 Akun: <code>${user.username}</code>\n` +
                  `⚡ Equity Baru: <b>$${s.currentEquity.toFixed(2)}</b>\n` +
                  `✅ Data otomatis tersinkron ke dashboard web.`;

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal memproses deposit.');
    }
  });

  bot.command(['wd', 'withdraw'], async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 2) {
        return ctx.reply('❌ Format salah.\nGunakan: <code>/wd [jumlah]</code>\nContoh: <code>/wd 200</code>', { parse_mode: 'HTML' });
      }

      const amount = parseFloat(parts[1].replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ Jumlah nominal harus lebih dari 0.');
      }

      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      await db.execute({
        sql: "INSERT INTO transactions (user_id, type, amount) VALUES (?, 'withdrawal', ?)",
        args: [user.id, amount]
      });

      const s = await getUserEquityData(user.id, user);

      const msg = `📤 <b>[PENARIKAN (WD) BERHASIL DICATAT]</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `💸 Jumlah: <b>-$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>\n` +
                  `👤 Akun: <code>${user.username}</code>\n` +
                  `⚡ Sisa Equity: <b>$${s.currentEquity.toFixed(2)}</b>\n` +
                  `✅ Data otomatis tersinkron ke dashboard web.`;

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal memproses penarikan saldo.');
    }
  });

  // COMMAND: /setmodal (also supports /setbalance, /setsaldo)
  const handleSetModal = async (ctx: any, presetAmount?: number) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      let amount = presetAmount;
      if (amount === undefined) {
        const text = (ctx.message?.text || '').trim();
        const parts = text.split(/\s+/);
        if (parts.length > 1) {
          const parsed = parseFloat(parts[1].replace(/,/g, ''));
          if (!isNaN(parsed) && parsed > 0) {
            amount = parsed;
          }
        }
      }

      const isCent = user.currency === 'USC' || user.currency === 'NANO';
      const sym = isCent ? '¢' : (user.currency === 'IDR' ? 'Rp ' : '$');

      if (amount !== undefined && !isNaN(amount) && amount > 0) {
        if (user.prop_firm_enabled) {
          await db.execute({
            sql: "UPDATE users SET prop_firm_balance = ? WHERE id = ?",
            args: [amount, user.id]
          });
          user.prop_firm_balance = amount;
        } else {
          await db.execute({
            sql: "UPDATE users SET initial_balance = ? WHERE id = ?",
            args: [amount, user.id]
          });
          user.initial_balance = amount;
        }

        const s = await getUserEquityData(user.id, user);

        const msg = `🎯 <b>[MODAL AWAL BERHASIL DIPERBARUI]</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 Akun: <code>${user.username}</code>\n` +
                    `💰 Modal Baru: <b>${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>\n` +
                    `⚡ Current Equity: <b>${sym}${s.currentEquity.toFixed(2)}</b>\n\n` +
                    `💡 <i>Kini kalkulasi drawdown, performa akun, dan kalkulator <code>/lot</code> menggunakan modal awal ini.</i>`;

        const btns = [
          [{ text: '💰 Cek Saldo & Equity', callback_data: 'cmd_saldo' }],
          [{ text: '🧮 Hitung Lot (/lot)', callback_data: 'cmd_lot' }],
          [{ text: '📱 Menu Utama', callback_data: 'cmd_menu' }]
        ];
        return sendOrEdit(ctx, msg, false, btns);
      }

      // If no valid amount provided, show current initial balance and quick preset buttons
      const currentInitial = user.prop_firm_enabled 
        ? (user.prop_firm_balance || 1000) 
        : (user.initial_balance || 10000);
      const s = await getUserEquityData(user.id, user);

      const msg = `💰 <b>ATUR MODAL AWAL AKUN (/setmodal)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `👤 Akun: <code>${user.username}</code>\n` +
                  `💵 Modal Awal Saat Ini: <b>${sym}${Number(currentInitial).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>\n` +
                  `⚡ Current Equity: <b>${sym}${s.currentEquity.toFixed(2)}</b>\n\n` +
                  `Pilih nominal modal awal cepat di bawah atau ketik:\n` +
                  `<code>/setmodal [jumlah]</code>\n\n` +
                  `<i>Contoh:</i>\n` +
                  `• <code>/setmodal 10000</code>\n` +
                  `• <code>/setmodal 5000</code>\n` +
                  `• <code>/setmodal 100</code>`;

      const presets = isCent
        ? [1000, 5000, 10000, 50000, 100000, 500000]
        : [500, 1000, 5000, 10000, 25000, 50000, 100000, 200000];

      const presetRows: any[] = [];
      let currentRow: any[] = [];
      presets.forEach((val) => {
        const label = `${sym}${val >= 1000 ? `${val / 1000}k` : val}`;
        currentRow.push(Markup.button.callback(label, `cmd_setmodal_${val}`));
        if (currentRow.length === 3) {
          presetRows.push(currentRow);
          currentRow = [];
        }
      });
      if (currentRow.length > 0) presetRows.push(currentRow);

      presetRows.push([Markup.button.callback('📱 Kembali ke Menu', 'cmd_menu')]);

      return sendOrEdit(ctx, msg, false, presetRows);
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal mengubah modal awal.');
    }
  };

  bot.command(['setmodal', 'setbalance', 'setsaldo'], (ctx: any) => handleSetModal(ctx));
  bot.action('cmd_setmodal', (ctx: any) => handleSetModal(ctx));
  bot.action(/^cmd_setmodal_(\d+)$/, (ctx: any) => {
    const val = parseFloat(ctx.match[1]);
    return handleSetModal(ctx, val);
  });

  // COMMAND: /undo - Delete last trade
  const handleUndo = async (ctx: any) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      const lastTradeRes = await db.execute({
        sql: "SELECT id, pair, direction, realized_pl, result FROM trades WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        args: [user.id]
      });

      if (lastTradeRes.rows.length === 0) {
        return ctx.reply('❌ Belum ada trade yang dapat dihapus.');
      }

      const trade = lastTradeRes.rows[0] as any;
      await db.execute({
        sql: "DELETE FROM trades WHERE id = ?",
        args: [trade.id]
      });

      const s = await getUserEquityData(user.id, user);

      const msg = `↩️ <b>TRADE TERAKHIR BERHASIL DIHAPUS</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `ID: #${trade.id} | Pair: ${trade.pair} (${trade.direction})\n` +
                  `P/L Dibatalkan: $${trade.realized_pl}\n` +
                  `⚡ Equity Dipulihkan: <b>$${s.currentEquity.toFixed(2)}</b>`;

      await sendOrEdit(ctx, msg, true);
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal menghapus trade.');
    }
  };
  bot.command('undo', handleUndo);
  bot.action('cmd_undo', handleUndo);

  // COMMAND: /reset - Reset all account data (trades, depo/wd, quests)
  const handleResetPrompt = async (ctx: any) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      const text = (ctx.message?.text || '').trim();
      const isForce = text.includes('confirm') || text.includes('force') || text.includes('ya');

      if (isForce) {
        return handleResetExecute(ctx, user);
      }

      const tradeCountRes = await db.execute({
        sql: "SELECT COUNT(*) as cnt FROM trades WHERE user_id = ?",
        args: [user.id]
      });
      const tradeCount = Number((tradeCountRes.rows[0] as any)?.cnt || 0);

      const txCountRes = await db.execute({
        sql: "SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?",
        args: [user.id]
      });
      const txCount = Number((txCountRes.rows[0] as any)?.cnt || 0);

      const isCent = user.currency === 'USC' || user.currency === 'NANO';
      const sym = isCent ? '¢' : (user.currency === 'IDR' ? 'Rp ' : '$');
      const initial = user.prop_firm_enabled ? (user.prop_firm_balance || 1000) : (user.initial_balance || 10000);

      const msg = `⚠️ <b>KONFIRMASI RESET TOTAL DATA AKUN</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `👤 Akun: <code>${user.username}</code> (${user.currency || 'USD'})\n` +
                  `💰 Modal Awal: <b>${sym}${initial.toLocaleString()}</b>\n\n` +
                  `Tindakan ini akan <b>MENGHAPUS SEMUA DATA PERMANEN</b>:\n` +
                  `• 📝 <b>${tradeCount}</b> Catatan Jurnal Trade\n` +
                  `• 💳 <b>${txCount}</b> Riwayat Deposit & Penarikan Saldo\n` +
                  `• 🎮 Seluruh Progres Quest & Karakter\n` +
                  `• 🔄 Mengembalikan Saldo/Equity ke modal awal bersih\n\n` +
                  `<i>⚠️ PERINGATAN: Tindakan ini TIDAK DAPAT DIBATALKAN!</i>\n` +
                  `Apakah Anda yakin ingin mengosongkan seluruh data akun ini?`;

      const btns = [
        [{ text: '⚠️ YA, RESET SEMUA DATA SEKARANG', callback_data: `confirm_reset_${user.id}` }],
        [{ text: '❌ BATALKAN', callback_data: 'cancel_reset' }],
        [{ text: '📱 Kembali ke Menu Utama', callback_data: 'cmd_menu' }]
      ];

      return sendOrEdit(ctx, msg, false, btns);
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal memeriksa data akun untuk reset.');
    }
  };

  const handleResetExecute = async (ctx: any, targetUser?: any) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = targetUser || await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      // Delete trades, transactions, quests, characters for this user
      await db.execute({ sql: "DELETE FROM trades WHERE user_id = ?", args: [user.id] }).catch(() => {});
      await db.execute({ sql: "DELETE FROM transactions WHERE user_id = ?", args: [user.id] }).catch(() => {});
      await db.execute({ sql: "DELETE FROM user_quests WHERE user_id = ?", args: [user.id] }).catch(() => {});
      await db.execute({ sql: "DELETE FROM user_characters WHERE user_id = ?", args: [user.id] }).catch(() => {});

      const isCent = user.currency === 'USC' || user.currency === 'NANO';
      const sym = isCent ? '¢' : (user.currency === 'IDR' ? 'Rp ' : '$');
      const initial = user.prop_firm_enabled ? (user.prop_firm_balance || 1000) : (user.initial_balance || 10000);

      const msg = `✅ <b>DATA AKUN BERHASIL DI-RESET TOTAL!</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `👤 Akun: <code>${user.username}</code>\n` +
                  `• Riwayat Jurnal Trade: <b>0 (Kosong/Bersih)</b>\n` +
                  `• Riwayat Deposit/WD: <b>0 (Kosong/Bersih)</b>\n` +
                  `• Saldo/Equity: <b>${sym}${initial.toLocaleString()}</b> (Kembali ke Modal Awal)\n\n` +
                  `Akun Anda kini siap digunakan untuk mencatat perjalanan trading baru dari lembaran bersih! ✨\n\n` +
                  `💡 <i>Tips: Jika ingin mengatur modal awal baru, ketik:</i>\n` +
                  `<code>/setmodal 10000</code>`;

      const btns = [
        [{ text: '📝 Mulai Catat Jurnal (/jurnal)', callback_data: 'cmd_start_journal' }],
        [{ text: '💰 Cek Saldo (/saldo)', callback_data: 'cmd_saldo' }],
        [{ text: '📱 Menu Utama', callback_data: 'cmd_menu' }]
      ];

      return sendOrEdit(ctx, msg, false, btns);
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal mereset data akun.');
    }
  };

  bot.command(['reset', 'resetdata', 'cleardata'], handleResetPrompt);
  bot.action('cmd_reset', handleResetPrompt);
  bot.action(/^confirm_reset_(\d+)$/, handleResetExecute);
  bot.action('cancel_reset', async (ctx: any) => {
    await ctx.answerCbQuery('Reset dibatalkan').catch(() => {});
    const msg = `❌ <b>RESET DATA DIBATALKAN</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSeluruh data trade, saldo, dan riwayat akun Anda tetap aman tersimpan.`;
    const btns = [[{ text: '📱 Menu Utama', callback_data: 'cmd_menu' }]];
    return sendOrEdit(ctx, msg, false, btns);
  });

  // COMMAND: /accounts & /switch
  const handleAccounts = async (ctx: any) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;

      const activeUser = await getActiveUser(telegramId, ctx.from?.username);

      const accountsRes = await db.execute({
        sql: `SELECT users.id, users.username, users.current_mode, users.initial_balance, users.prop_firm_enabled, users.prop_firm_balance 
              FROM telegram_accounts 
              JOIN users ON telegram_accounts.user_id = users.id 
              WHERE telegram_accounts.telegram_id = ?`,
        args: [telegramId]
      });

      let accounts = accountsRes.rows;
      if (accounts.length === 0 && activeUser) {
        accounts = [activeUser];
      }

      if (accounts.length === 0) {
        return sendUnlinkedPrompt(ctx);
      }

      let msg = `👥 <b>DAFTAR AKUN TRADING TERHUBUNG</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      const switchButtons: any[] = [];

      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i] as any;
        const isActive = activeUser && activeUser.id === acc.id;
        const s = await getUserEquityData(acc.id, acc);
        const marker = isActive ? '🟢 [AKTIF]' : '⚪';

        msg += `${i + 1}. ${marker} <b>${acc.username}</b>\n` +
               `   • Mode: <code>${acc.current_mode || 'backtest'}</code> | Equity: <b>$${s.currentEquity.toFixed(2)}</b>\n` +
               `   • Net P/L: <b>$${s.totalPL >= 0 ? '+' : ''}${s.totalPL.toFixed(2)}</b> | Total: ${s.tradesCount} trades\n\n`;

        if (!isActive) {
          switchButtons.push([Markup.button.callback(`🔄 Ganti ke ${acc.username}`, `switch_to_${acc.id}`)]);
        }
      }

      msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `🔄 Untuk berganti akun aktif: ketik <code>/switch [username]</code> atau klik tombol di bawah.`;

      await sendOrEdit(ctx, msg, true, switchButtons);
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal memuat daftar akun.');
    }
  };
  bot.command('accounts', handleAccounts);
  bot.action('cmd_accounts', handleAccounts);

  // Switch button callback
  bot.action(/switch_to_(\d+)/, async (ctx) => {
    try {
      const targetUserId = parseInt(ctx.match[1], 10);
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;

      const userRes = await db.execute({
        sql: "SELECT * FROM users WHERE id = ?",
        args: [targetUserId]
      });

      if (userRes.rows.length === 0) return ctx.reply('Akun tidak ditemukan.');

      const targetUser = userRes.rows[0] as any;

      await db.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telegramId, targetUserId]
      });

      const s = await getUserEquityData(targetUserId, targetUser);

      const msg = `🔄 <b>AKUN AKTIF BERHASIL DIGANTI</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🟢 <b>Akun Aktif Sekarang:</b> <code>${targetUser.username}</code>\n` +
                  `🏷️ <b>Mode:</b> ${targetUser.current_mode || 'backtest'}\n` +
                  `💰 <b>Equity:</b> $${s.currentEquity.toFixed(2)}\n\n` +
                  `Semua pencatatan trade sekarang akan otomatis masuk ke akun ini!`;

      await ctx.editMessageText(msg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Jurnal Trade Baru', callback_data: 'cmd_start_journal' }],
            [{ text: '🔙 Menu Utama', callback_data: 'cmd_menu' }]
          ]
        }
      });
    } catch (e) {
      console.error(e);
      await ctx.reply('Gagal mengganti akun.');
    }
  });

  // Command: /switch <username>
  bot.command('switch', async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 2) {
        return ctx.reply('Gunakan: <code>/switch [username]</code>\nContoh: <code>/switch jalu</code>', { parse_mode: 'HTML' });
      }

      const targetUsername = parts[1];
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;

      const userRes = await db.execute({
        sql: "SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?)",
        args: [targetUsername]
      });

      if (userRes.rows.length === 0) {
        return ctx.reply(`❌ Akun <code>${targetUsername}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
      }

      const targetUser = userRes.rows[0] as any;

      await db.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telegramId, targetUser.id]
      });
      await db.execute({
        sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
        args: [telegramId, targetUser.id]
      });

      const s = await getUserEquityData(targetUser.id, targetUser);

      const msg = `🔄 <b>AKUN AKTIF BERHASIL DIGANTI</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🟢 <b>Akun:</b> <code>${targetUser.username}</code>\n` +
                  `💰 <b>Equity:</b> $${s.currentEquity.toFixed(2)}`;

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal berganti akun.');
    }
  });

  // COMMAND: /link & /login
  bot.command('link', async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      const identifier = parts[1];
      if (!identifier) {
        return ctx.reply('Gunakan: <code>/link [username]</code> (Contoh: <code>/link jalu</code>)', { parse_mode: 'HTML' });
      }

      const res = await db.execute({
        sql: "SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?)",
        args: [identifier]
      });

      if (res.rows.length === 0) {
        return ctx.reply(`❌ Username <code>${escapeHtml(identifier)}</code> tidak ditemukan di database.`, { parse_mode: 'HTML' });
      }

      const user = res.rows[0] as any;
      const telId = ctx.from?.id?.toString();
      if (!telId) return;

      await ensureTables();
      await db.execute({
        sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
        args: [telId, user.id]
      });
      await db.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telId, user.id]
      });
      await db.execute({
        sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
        args: [telId, user.id]
      });

      await ctx.reply(
        `✅ <b>AKUN BERHASIL DITAUTKAN!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Telegram Anda sekarang terhubung ke akun <b>${user.username}</b>.\n` +
        `Ketik /jurnal atau /quick untuk mulai mencatat trade!`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.error(e);
      await ctx.reply('Gagal menautkan akun.');
    }
  });

  bot.command('login', async (ctx) => {
    try {
      const text = (ctx.message?.text || '').trim();
      const parts = text.split(/\s+/);
      if (parts.length < 3) {
        return ctx.reply('Gunakan: <code>/login [username] [password]</code>', { parse_mode: 'HTML' });
      }

      const rawUser = parts[1].trim();
      const rawPassword = parts.slice(2).join(' ').trim();
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;

      const userRes = await db.execute({
        sql: "SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?)",
        args: [rawUser]
      });

      if (userRes.rows.length === 0) {
        return ctx.reply(`❌ Akun <code>${escapeHtml(rawUser)}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
      }

      const user = userRes.rows[0] as any;
      let isValid = false;
      try {
        if (user.password) {
          isValid = bcrypt.compareSync(rawPassword, user.password as string);
        }
      } catch (e) {}

      if (!isValid) {
        return ctx.reply('❌ Password salah! Silakan coba lagi.');
      }

      await ensureTables();
      await db.execute({
        sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
        args: [telegramId, user.id]
      });
      await db.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telegramId, user.id]
      });
      await db.execute({
        sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
        args: [telegramId, user.id]
      });

      await ctx.reply(`✅ <b>LOGIN BERHASIL!</b>\nSelamat datang, <b>${user.username}</b>.`, { parse_mode: 'HTML' });
    } catch (e) {
      console.error(e);
      await ctx.reply('Gagal memproses login.');
    }
  });

  // CONTROL PANEL MENU (/menu)
  const renderMenu = async (ctx: any) => {
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);

    let msg = `📱 <b>CONTROL PANEL TRADING</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (user) {
      const s = await getUserEquityData(user.id, user);
      const isNano = user.currency === 'NANO';
      const isCent = user.currency === 'USC';
      const typeLabel = isNano ? 'Nano (1¢/lot)' : isCent ? 'Cent (10¢/lot)' : 'Standard ($10/lot)';
      const unitSym = isNano ? '¢' : isCent ? '¢' : '$';
      msg += `👤 Akun: <code>${user.username}</code> | Mode: <code>${user.current_mode || 'backtest'}</code>\n` +
             `🏷️ Tipe Akun: <b>${typeLabel}</b> | WR: <b>${s.winRate}%</b>\n` +
             `💰 Equity: <b>${unitSym}${s.currentEquity.toFixed(2)}</b>\n\n`;
    } else {
      msg += `⚠️ Akun belum terhubung. Klik tombol hubungkan akun di bawah.\n\n`;
    }

    msg += `Pilih menu aksi cepat:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📝 Jurnal Trade Baru', 'cmd_start_journal'), Markup.button.callback('💰 Cek Saldo & Equity', 'cmd_saldo')],
      [Markup.button.callback('📊 Hari Ini (Today)', 'cmd_today'), Markup.button.callback('📈 7 Hari (Weekly)', 'cmd_weekly')],
      [Markup.button.callback('🧮 Kalkulator Lot', 'cmd_lot'), Markup.button.callback('⏳ Trade Running', 'cmd_running')],
      [Markup.button.callback('📰 Berita Pasar (News)', 'cmd_news'), Markup.button.callback('🛡️ Set Risiko %', 'cmd_setrisk_menu')],
      [Markup.button.callback('💵 Set Modal Awal', 'cmd_setmodal'), Markup.button.callback('🏷️ Ganti Tipe Akun', 'cmd_setaccount')],
      [Markup.button.callback('👥 Kelola Akun', 'cmd_accounts'), Markup.button.callback('⚠️ Reset Data Akun', 'cmd_reset')],
      [Markup.button.callback('💡 Bantuan & Panduan Lengkap', 'cmd_help')]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard }).catch(() => ctx.reply(msg, { parse_mode: 'HTML', ...keyboard }));
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    }
  };
  bot.command('menu', renderMenu);
  bot.action('cmd_menu', renderMenu);
  bot.action('cmd_running', handleRunningTrades);

  // HELP COMMAND (/help, /bantuan)
  const handleHelp = async (ctx: any) => {
    const helpMsg = `📖 <b>PANDUAN LENGKAP & DAFTAR COMMAND BOT</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `📝 <b>1. PENCATATAN TRADE & JURNAL</b>\n` +
                    `• <code>/jurnal</code> — Wizard interaktif catat trade langkah demi langkah\n` +
                    `• <code>/quick [pair] [buy/sell] [lot] [pnl]</code> — Catat trade 1 baris cepat\n` +
                    `  <i>Contoh:</i> <code>/quick XAUUSD BUY 0.10 +150 WIN Setup FVG</code>\n` +
                    `• <code>/buy [pair] [lot] [pnl]</code> — Shortcut instan posisi BUY\n` +
                    `  <i>Contoh:</i> <code>/buy XAUUSD 0.05 +80</code>\n` +
                    `• <code>/sell [pair] [lot] [pnl]</code> — Shortcut instan posisi SELL\n` +
                    `  <i>Contoh:</i> <code>/sell EURUSD 0.10 -40</code>\n` +
                    `• <code>/running</code> — Lihat daftar trade aktif / pending order\n` +
                    `• <code>/close [id] [win/loss] [pnl]</code> — Tutup trade terbuka\n` +
                    `• <code>/undo</code> — Batalkan / hapus trade terakhir jika salah input\n\n` +
                    `💰 <b>2. MODAL, KEUANGAN & PERFORMA</b>\n` +
                    `• <code>/setmodal [jumlah]</code> — Setel modal awal akun (cth: <code>/setmodal 10000</code>)\n` +
                    `• <code>/saldo</code> — Cek saldo modal awal, equity & status drawdown\n` +
                    `• <code>/deposit [jumlah]</code> — Catat penambahan deposit saldo\n` +
                    `• <code>/wd [jumlah]</code> — Catat penarikan keuntungan (withdrawal)\n` +
                    `• <code>/today</code> — Rekap statistik & win rate hari ini\n` +
                    `• <code>/weekly</code> — Rekap statistik performa 7 hari terakhir\n\n` +
                    `🧮 <b>3. KALKULATOR & RISK MANAGEMENT</b>\n` +
                    `• <code>/lot [pips]</code> — Hitung lot rekomendasi otomatis sesuai toleransi risiko\n` +
                    `• <code>/setrisk [persen]</code> — Atur toleransi risiko per trade (cth: <code>/setrisk 1.5</code>)\n` +
                    `• <code>/setaccount [nano/cent/standard]</code> — Ganti tipe akun:\n` +
                    `   ├ <b>Standard</b> ($10 per pip untuk 1.00 lot)\n` +
                    `   ├ <b>Cent</b> (10¢ per pip untuk 1.00 lot)\n` +
                    `   └ <b>Nano</b> (1¢ per pip untuk 1.00 lot)\n\n` +
                    `📰 <b>4. INFORMASI & ANALISA PASAR</b>\n` +
                    `• <code>/news</code> — Kalender ekonomi Forex & rilis berita High-Impact\n` +
                    `  <i>Opsi filter:</i> <code>/news today</code>, <code>/news usd</code>, <code>/news high</code>\n\n` +
                    `👥 <b>5. MULTI-AKUN & NAVIGASI</b>\n` +
                    `• <code>/menu</code> — Buka Control Panel navigasi interaktif utama\n` +
                    `• <code>/accounts</code> — Daftar akun trading yang terhubung\n` +
                    `• <code>/switch [username]</code> — Ganti akun aktif yang digunakan\n` +
                    `• <code>/link [username]</code> — Hubungkan akun Telegram ke web\n` +
                    `• <code>/login [user] [pass]</code> — Login akun resmi via Telegram\n\n` +
                    `⚠️ <b>6. RESET & PEMBERSIHAN DATA</b>\n` +
                    `• <code>/reset</code> — Hapus bersih seluruh riwayat log trade, depo/wd, dan kembalikan akun ke modal awal (dilengkapi tombol konfirmasi keamanan)\n\n` +
                    `📸 <b>7. SCREENSHOT & CHART ENTRY</b>\n` +
                    `• Kirim foto chart + caption: <code>XAUUSD BUY 0.10 +150 WIN Setup Retest</code>\n` +
                    `• Atau kirim foto chart saja, lalu tekan tombol <i>[Catat Jurnal dengan Foto Ini]</i>\n` +
                    `• TradingView: Tempel link chart snapshot di command /quick`;

    await sendOrEdit(ctx, helpMsg, true);
  };
  bot.command(['help', 'bantuan'], handleHelp);
  bot.action('cmd_help', handleHelp);

  // Helper to parse CSV securely
  const parseCSVLine = (line: string) => {
    const arr = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        arr.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    arr.push(current.trim());
    return arr.map(str => str.replace(/^"|"$/g, '').trim());
  };

  // SMART TEXT & FALLBACK HANDLER
  bot.on(message('text'), async (ctx) => {
    try {
      const text = (ctx.message.text || '').trim();
      const telegramId = ctx.from?.id?.toString();

      // 1. Check if user is in interactive journal session
      if (telegramId && journalSessions.has(telegramId)) {
        const session = journalSessions.get(telegramId)!;

        // Custom Pair typed in chat
        if (session.step === 'pair') {
          session.pair = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
          session.step = 'direction';
          session.timestamp = Date.now();

          const dirKeyboard = [
            [Markup.button.callback('🟢 BUY (Long)', 'jd_BUY'), Markup.button.callback('🔴 SELL (Short)', 'jd_SELL')],
            [Markup.button.callback('❌ Batalkan', 'cmd_cancel_journal')]
          ];
          return ctx.reply(`Pair: <b>${session.pair}</b>\nPilih arah posisi:`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: dirKeyboard }
          });
        }

        // Custom Lot typed in chat
        if (session.step === 'lot') {
          const lot = parseFloat(text);
          if (isNaN(lot) || lot <= 0) {
            return ctx.reply('Ketik angka lot yang valid (cth: <code>0.05</code>):', { parse_mode: 'HTML' });
          }
          session.lot = lot;
          session.step = 'entry';
          session.timestamp = Date.now();

          const skipKeyboard = [
            [Markup.button.callback('⏩ Lewati Entry Price', 'js_skip_entry')],
            [Markup.button.callback('❌ Batalkan', 'cmd_cancel_journal')]
          ];
          return ctx.reply(
            `Lot: <b>${lot}</b>\nKetik harga <b>Entry</b> Anda (cth: <code>2650.50</code>) atau klik Lewati:`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: skipKeyboard } }
          );
        }

        // Custom Entry typed in chat
        if (session.step === 'entry') {
          if (text !== '-') {
            const entryVal = parseFloat(text);
            if (!isNaN(entryVal)) session.entry = entryVal;
          }
          session.step = 'result';
          session.timestamp = Date.now();

          const resKeyboard = [
            [Markup.button.callback('🏆 WIN (Profit)', 'jr_WIN'), Markup.button.callback('❌ LOSS (Rugi)', 'jr_LOSS')],
            [Markup.button.callback('⚖️ BE (Break Even)', 'jr_BE'), Markup.button.callback('⏳ Running / Open', 'jr_PENDING')],
            [Markup.button.callback('❌ Batalkan', 'cmd_cancel_journal')]
          ];
          return ctx.reply(`Entry tercatat: <b>${session.entry || 'Dilewati'}</b>\nPilih status hasil trade:`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: resKeyboard }
          });
        }

        // Custom PnL typed in chat
        if (session.step === 'pnl') {
          let pnlVal = parseFloat(text.replace('$', '').trim());
          if (isNaN(pnlVal)) {
            return ctx.reply('Ketik nominal P/L angka yang valid (cth: <code>150</code> atau <code>-45</code>):', { parse_mode: 'HTML' });
          }
          if (session.result === 'LOSS' && pnlVal > 0) pnlVal = -pnlVal;
          if (session.result === 'WIN' && pnlVal < 0) pnlVal = Math.abs(pnlVal);

          session.pnl = pnlVal;
          session.step = 'setup';
          session.timestamp = Date.now();

          return promptSetupStep(ctx, session);
        }

        // Custom Setup / Note typed in chat
        if (session.step === 'setup') {
          session.setup = text;
          if (session.image) {
            return completeInteractiveJournal(ctx, telegramId, session);
          } else {
            return promptImageStep(ctx, session);
          }
        }

        // Custom Image / Skip typed in chat
        if (session.step === 'image') {
          if (text.startsWith('http://') || text.startsWith('https://')) {
            session.image = text;
          }
          return completeInteractiveJournal(ctx, telegramId, session);
        }
      }

      if (text.startsWith('/')) {
        // Unknown command entered
        return ctx.reply(
          `⚠️ Perintah tidak dikenali.\nKetik <code>/menu</code> untuk membuka Control Panel atau <code>/help</code> untuk panduan lengkap.`,
          { parse_mode: 'HTML' }
        );
      }

      // 2. Check if CSV Trade Format (11+ columns)
      if (text.includes(',')) {
        const parts = parseCSVLine(text);
        if (parts.length >= 11 && ['BUY', 'SELL'].includes(parts[3]?.toUpperCase())) {
          const user = await getActiveUser(telegramId, ctx.from?.username);
          if (!user) return sendUnlinkedPrompt(ctx);

          const [dateStr, timeStr, pair, type, setup, entry, sl, tp, lot, status, pnl, emosi, ...notesArr] = parts;
          const notes = notesArr.join(', ');
          const actualUserId = user.id;
          const mode = user.current_mode || 'backtest';
          const realizedPl = parseFloat(pnl) || 0;
          const entryPrice = parseFloat(entry) || 0;
          const slPrice = parseFloat(sl) || 0;
          const tpPrice = parseFloat(tp) || 0;
          const lotSize = parseFloat(lot) || 0.01;
          const isWin = status.toUpperCase() === 'WIN';

          let created_at = new Date().toISOString();
          try {
            const parsedDate = new Date(`${dateStr} ${timeStr}`);
            if (!isNaN(parsedDate.getTime())) created_at = parsedDate.toISOString();
          } catch(e) {}

          await db.execute({
            sql: `INSERT INTO trades (
              user_id, pair, direction, setup_name, entry_price, sl, tp, 
              account_balance, position_size, result, realized_pl, 
              anxiety_level, notes, run_mode, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              actualUserId, pair.toUpperCase(), type.toUpperCase(), setup, entryPrice, slPrice, tpPrice,
              0, lotSize, status.toUpperCase(), realizedPl,
              2, notes, mode, created_at
            ]
          });

          const s = await getUserEquityData(actualUserId, user);
          const pipsGained = calculatePips(pair, entryPrice, tpPrice, realizedPl, lotSize, isWin, user?.currency === 'NANO');
          const sign = realizedPl >= 0 ? '+' : '';

          let msg = `📊 <b>[TRADE CSV RECORDED]</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 Akun: <code>${user.username}</code> (${mode})\n` +
                    `📈 Pair: ${pair.toUpperCase()} (${type.toUpperCase()})\n` +
                    `💵 P/L: <b>${sign}$${realizedPl.toFixed(2)}</b> (${status.toUpperCase()})\n` +
                    `📏 Pips: <b>${pipsGained} Pips</b>\n` +
                    `⚡ Equity Baru: <b>$${s.currentEquity.toFixed(2)}</b>`;

          return ctx.reply(msg, { parse_mode: 'HTML' });
        }
      }

      // 3. Natural Trade Detection (e.g. "BUY XAUUSD 0.1 +120" or "SELL EURUSD 0.05 -35")
      const upper = text.toUpperCase();
      if ((upper.startsWith('BUY ') || upper.startsWith('SELL ')) && (upper.includes('+') || upper.includes('-') || upper.includes('WIN') || upper.includes('LOSS'))) {
        ctx.message.text = `/quick ${text}`;
        return handleQuickTrade(ctx);
      }

      // 4. Polite Fallback / Helper guide for any normal text message
      const user = await getActiveUser(telegramId, ctx.from?.username);
      let replyMsg = `👋 Halo ${escapeHtml(ctx.from?.first_name || 'Trader')}!\n\n` +
                     `Ada yang bisa dibantu?\n` +
                     `• Untuk mencatat trade: ketik <code>/jurnal</code> atau <code>/quick</code>\n` +
                     `• Untuk mengecek saldo: ketik <code>/saldo</code>\n` +
                     `• Untuk Control Panel utama: ketik <code>/menu</code>`;

      const helperKeyboard = [
        [Markup.button.callback('📝 Jurnal Trade Cepat', 'cmd_start_journal'), Markup.button.callback('💰 Cek Saldo', 'cmd_saldo')],
        [Markup.button.callback('📱 Buka Control Panel', 'cmd_menu')]
      ];

      await ctx.reply(replyMsg, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: helperKeyboard }
      });
    } catch (e) {
      console.error("Text message handling error:", e);
      await ctx.reply('⚠️ Terjadi kendala saat memproses pesan.');
    }
  });

  // PHOTO MESSAGE HANDLER (Screenshot + Caption / Interactive Wizard)
  bot.on(message('photo'), async (ctx) => {
    try {
      const caption = (ctx.message as any).caption;
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);

      const actualUserId = user.id;
      const mode = user.current_mode || 'backtest';

      const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const base64Img = await getTelegramImageBase64(fileLink.href);

      // Check if user is in interactive journal session waiting for image
      if (telegramId && journalSessions.has(telegramId)) {
        const session = journalSessions.get(telegramId)!;
        if (session.step === 'image') {
          session.image = base64Img;
          await completeInteractiveJournal(ctx, telegramId, session);
          return;
        }
      }

      if (!caption) {
        pendingPhotos.set(telegramId, { image: base64Img, timestamp: Date.now() });

        const photoMsg = `📸 <b>FOTO SCREENSHOT DITERIMA!</b>\n` +
                         `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                         `👤 Akun: <code>${user.username}</code>\n\n` +
                         `Pilih cara mencatat trade untuk screenshot ini:\n\n` +
                         `1. <b>Jurnal Interaktif:</b> Klik tombol di bawah untuk mengisi pair, lot, P/L langkah demi langkah (gambar otomatis terpasang).\n\n` +
                         `2. <b>Shortcut Caption:</b> Kirim ulang foto dengan caption 1 baris, contoh:\n` +
                         `   • <code>XAUUSD BUY 0.10 +150 WIN Setup Retest</code>\n` +
                         `   • <code>/buy XAUUSD 0.05 +80</code>`;

        const photoKeyboard = [
          [Markup.button.callback('📝 Catat Jurnal dengan Foto Ini', 'cmd_journal_with_saved_photo')],
          [Markup.button.callback('❌ Abaikan Foto', 'cmd_cancel_saved_photo')]
        ];

        return ctx.reply(photoMsg, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: photoKeyboard }
        });
      }

      // Process photo with caption (supports /quick, /buy, /sell, plain text, or CSV)
      let cleanCaption = caption.trim();
      let forcedDir: 'BUY' | 'SELL' | undefined = undefined;
      if (cleanCaption.toLowerCase().startsWith('/buy')) forcedDir = 'BUY';
      if (cleanCaption.toLowerCase().startsWith('/sell')) forcedDir = 'SELL';
      if (cleanCaption.startsWith('/')) {
        cleanCaption = cleanCaption.replace(/^\/[a-zA-Z0-9_]+\s*/, '');
      }

      const tradeData = parseTradeData(cleanCaption);
      let pair = tradeData?.pair || 'XAUUSD';
      let direction: 'BUY' | 'SELL' = forcedDir || (tradeData?.direction?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY');
      let lot = tradeData?.size || 0.01;
      let entry = tradeData?.entry || 0;
      let sl = tradeData?.sl || 0;
      let tp = tradeData?.tp || 0;
      let result = tradeData?.result || 'WIN';
      let pnl = tradeData?.pl || 0;
      let notes = tradeData?.notes || 'Telegram Photo Log';

      if (!tradeData) {
        const tokens = cleanCaption.split(/\s+/);
        const notesArr: string[] = [];
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i].toUpperCase();
          if (t === 'BUY' || t === 'LONG') { direction = 'BUY'; continue; }
          if (t === 'SELL' || t === 'SHORT') { direction = 'SELL'; continue; }
          if (t === 'WIN' || t === 'PROFIT') { result = 'WIN'; continue; }
          if (t === 'LOSS' || t === 'RUGI' || t === 'MC') { result = 'LOSS'; continue; }
          if (t === 'BE' || t === 'BREAKEVEN') { result = 'BE'; pnl = 0; continue; }
          if (t === 'RUNNING' || t === 'OPEN' || t === 'PENDING') { result = 'Pending'; pnl = 0; continue; }
          if (tokens[i].toLowerCase().startsWith('sl=')) { sl = parseFloat(tokens[i].slice(3)) || 0; continue; }
          if (tokens[i].toLowerCase().startsWith('tp=')) { tp = parseFloat(tokens[i].slice(3)) || 0; continue; }
          if (tokens[i].toLowerCase().startsWith('entry=')) { entry = parseFloat(tokens[i].slice(6)) || 0; continue; }
          if (/^[+-]\d+(\.\d+)?$/.test(tokens[i])) {
            pnl = parseFloat(tokens[i]);
            if (pnl < 0) result = 'LOSS';
            else if (pnl > 0 && result !== 'Pending') result = 'WIN';
            continue;
          }
          if (/^[A-Z]{6}$/.test(t) || t === 'GOLD' || t === 'BTC' || t === 'ETH' || t === 'US30' || t === 'NAS100') {
            pair = t === 'GOLD' ? 'XAUUSD' : (t === 'BTC' ? 'BTCUSD' : t);
            continue;
          }
          const num = parseFloat(tokens[i]);
          if (!isNaN(num)) {
            if (num > 0 && num <= 100 && tokens[i].includes('.') && lot === 0.01) {
              lot = num;
              continue;
            }
            if (entry === 0 && num > 100) {
              entry = num;
              continue;
            }
            if (pnl === 0) {
              pnl = num;
              if (pnl < 0) result = 'LOSS';
              continue;
            }
          }
          notesArr.push(tokens[i]);
        }
        if (notesArr.length > 0) notes = notesArr.join(' ');
      }

      if (pnl > 0 && result !== 'Pending') result = 'WIN';
      if (pnl < 0) result = 'LOSS';

      const isWin = result.toUpperCase() === 'WIN';
      const pips = calculatePips(pair, entry, tp, pnl, lot, isWin, user?.currency === 'NANO');

      const ins = await db.execute({
        sql: `INSERT INTO trades (
          user_id, pair, direction, setup_name, entry_price, sl, tp, 
          account_balance, position_size, result, realized_pl, pips,
          image, image_url, has_image, anxiety_level, notes, run_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 2, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          actualUserId, pair, direction, notes || 'Screenshot Journal', entry, sl, tp,
          0, lot, result, pnl, pips,
          base64Img, base64Img, notes, mode
        ]
      });

      const tradeId = ins.lastInsertRowid;
      const s = await getUserEquityData(actualUserId, user);
      const signPL = pnl >= 0 ? '+' : '';
      const signPips = pips >= 0 ? '+' : '';

      const msg = `📸 <b>[TRADE & SCREENSHOT TERSIMPAN]</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🆔 <b>ID:</b> #${tradeId} | 👤 <b>Akun:</b> <code>${user.username}</code> (${mode})\n` +
                  `📈 <b>Pair:</b> <b>${pair}</b> (${direction === 'BUY' ? '🟢 BUY' : '🔴 SELL'})\n` +
                  `📦 <b>Lot:</b> ${lot}\n` +
                  (entry > 0 ? `🎯 <b>Entry:</b> ${entry}\n` : '') +
                  (sl > 0 ? `🛑 <b>SL:</b> ${sl} | 🎯 <b>TP:</b> ${tp}\n` : '') +
                  `🏆 <b>Status:</b> <b>${result}</b>\n` +
                  `💵 <b>Realized P/L:</b> <b>${signPL}$${pnl.toFixed(2)}</b>\n` +
                  `📏 <b>Pips:</b> <b>${signPips}${pips} Pips</b>\n` +
                  `🎯 <b>Setup:</b> ${notes || 'Screenshot Journal'}\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `⚡ <b>Equity Terkini:</b> <b>$${s.currentEquity.toFixed(2)}</b>\n` +
                  `✅ <b>Screenshot:</b> Terlampir & tersinkronisasi ke Dashboard Web!`;

      const doneKeyboard = [
        [Markup.button.callback('📝 Jurnal Lagi', 'cmd_start_journal'), Markup.button.callback('💰 Cek Saldo', 'cmd_saldo')],
        [Markup.button.callback('↩️ Hapus Trade Ini', 'cmd_undo'), Markup.button.callback('📱 Menu Utama', 'cmd_menu')]
      ];

      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: doneKeyboard } });
    } catch (e) {
      console.error("Photo journal error:", e);
      await ctx.reply('❌ Terjadi kesalahan saat memproses foto.');
    }
  });

  bot.action('cmd_journal_with_saved_photo', async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);
    if (!user) return sendUnlinkedPrompt(ctx);

    const saved = pendingPhotos.get(telegramId);
    pendingPhotos.delete(telegramId);

    journalSessions.set(telegramId, {
      step: 'pair',
      image: saved?.image,
      timestamp: Date.now()
    });

    const msg = `📝 <b>JURNAL TRADE BARU (Langkah 1/6)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 Akun: <code>${user.username}</code>\n` +
                `📸 <i>Screenshot chart berhasil dilampirkan!</i>\n\n` +
                `Pilih instrumen / pair yang Anda tradingkan, atau ketik langsung di chat (cth: <i>EURUSD</i>):`;

    const pairKeyboard = [
      [Markup.button.callback('🟡 XAUUSD (Gold)', 'jp_XAUUSD'), Markup.button.callback('🪙 BTCUSD', 'jp_BTCUSD')],
      [Markup.button.callback('🇪🇺 EURUSD', 'jp_EURUSD'), Markup.button.callback('🇬🇧 GBPUSD', 'jp_GBPUSD')],
      [Markup.button.callback('🇯🇵 USDJPY', 'jp_USDJPY'), Markup.button.callback('🇦🇺 AUDUSD', 'jp_AUDUSD')],
      [Markup.button.callback('❌ Batalkan Jurnal', 'cmd_cancel_journal')]
    ];

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: pairKeyboard } })
        .catch(() => ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: pairKeyboard } }));
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: pairKeyboard } });
    }
  });

  bot.action('cmd_cancel_saved_photo', async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (telegramId) pendingPhotos.delete(telegramId);
    await ctx.editMessageText('❌ Foto diabaikan.', {
      reply_markup: { inline_keyboard: [[Markup.button.callback('📱 Buka Menu', 'cmd_menu')]] }
    }).catch(() => ctx.reply('Foto diabaikan.'));
  });

  return bot;
}
