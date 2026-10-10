import dotenv from "dotenv";
dotenv.config({ override: true });
import { GoogleGenAI, Type } from "@google/genai";
import express from "express";
import { createClient } from "@libsql/client";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import { initTelegramBot, botStatus } from "./src/lib/telegram";

const JWT_SECRET = process.env.JWT_SECRET || 'aurel_super_secret_key_123';

const app = express();

const PORT = 3000;
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get('/ping', (req, res) => res.status(200).send('OK'));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());


// Initialize LibSQL Database
let dbUrl = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || "https://jurnal-tryout-lancarkoreaa.aws-ap-northeast-1.turso.io";
// Force HTTPS for Vercel/serverless environments to avoid WebSocket hangups
if (dbUrl.startsWith('libsql://')) {
  dbUrl = dbUrl.replace('libsql://', 'https://');
}
const dbAuthToken = process.env.TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzcyMDMwMDksImlkIjoiMDE5ZDM4MmItZjAwMS03MjlhLTliZjctODQzMGE5NjNjZGY2IiwicmlkIjoiYzRlYzU4MzctOGNhOC00NzBiLTliM2UtYjIwNDkwMDAzNmVhIn0.Ir8xBR4mR7fYLnj6HbSzsHptQjAbfygNHzY6rIRVd3t1qMa7Ktn7dXOklnNDwWg-_nom1XinUpauQRGkciWeAQ";

const dbConfig: any = { url: dbUrl };
if (dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://')) {
  dbConfig.authToken = dbAuthToken;
}

const db = createClient(dbConfig);
// Initialize Telegram Bot safely
const bot = initTelegramBot(db);

// Status route for Telegram bot
app.get('/api/telegram/status', (req, res) => {
  res.json(botStatus);
});

// Webhook config for Vercel/Serverless
if (bot) {
  app.use('/api/webhook', (req, res, next) => {
    try {
      return bot.webhookCallback('/api/webhook')(req, res, next);
    } catch (e) {
      console.warn('Telegram webhook callback error:', e);
      return res.status(200).send('OK');
    }
  });
} else {
  app.post('/api/webhook', (req, res) => res.status(200).send('Bot not configured'));
}


// Initialize DB schema asynchronously (does not block route registration)
async function initDb() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user',
        current_mode TEXT DEFAULT 'backtest',
        discord_id TEXT,
        target_balance REAL DEFAULT 1000000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add current_mode column if it doesn't exist (for existing DBs)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        is_used BOOLEAN DEFAULT 0,
        used_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        amount REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        pair TEXT,
        direction TEXT DEFAULT 'Buy',
        setup_name TEXT,
        entry_price REAL,
        sl REAL,
        tp REAL,
        account_balance REAL,
        risk_percentage REAL,
        position_size REAL,
        nominal_risk REAL,
        anxiety_level INTEGER,
        checklist TEXT,
        notes TEXT,
        result TEXT DEFAULT 'Pending',
        realized_pl REAL,
        pips REAL,
        image TEXT,
        
        run_mode TEXT DEFAULT 'backtest',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);
    
    try {
      await db.execute("ALTER TABLE trades ADD COLUMN pips REAL DEFAULT NULL");
    } catch (e) {}

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

    try { await db.execute("ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 250"); } catch (e) {}
    try { await db.execute("ALTER TABLE users ADD COLUMN active_character_id TEXT DEFAULT 'jinwoo_e'"); } catch (e) {}
    try { await db.execute("ALTER TABLE users ADD COLUMN telegram_tag TEXT DEFAULT NULL"); } catch (e) {}

    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_characters (
        user_id INTEGER,
        character_id TEXT,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, character_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_quests (
        user_id INTEGER,
        quest_id TEXT,
        claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, quest_id)
      )
    `);

    // Add run_mode column if it doesn't exist

    // Seed default admin user
    const adminCheck = await db.execute("SELECT id FROM users WHERE username = 'aurel'");
    if (adminCheck.rows.length === 0) {
      const hash = bcrypt.hashSync("aurel22", 10);
      await db.execute({
        sql: "INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')",
        args: ["aurel", hash]
      });
      console.log("Default admin account created.");
    }
  } catch (e) {
    console.error("Error initializing DB:", e);
  }
}
initDb();

// Auth Middleware
const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

const adminMiddleware = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// Auth Routes
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body;
    
    const inviteRes = await db.execute({
      sql: "SELECT * FROM invite_codes WHERE code = ? AND is_used = 0",
      args: [inviteCode]
    });
    
    if (inviteRes.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or already used invite code." });
    }
    
    const hash = bcrypt.hashSync(password, 10);
    let userId;
    
    try {
      const insertUser = await db.execute({
        sql: "INSERT INTO users (username, password, role) VALUES (?, ?, 'user') RETURNING id",
        args: [username, hash]
      });
      userId = insertUser.rows[0].id;
    } catch (err) {
      return res.status(400).json({ error: "Username already exists." });
    }
    
    await db.execute({
      sql: "UPDATE invite_codes SET is_used = 1, used_by = ? WHERE code = ?",
      args: [username, inviteCode]
    });
    
    const token = jwt.sign({ id: userId, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
    
    res.json({ user: {
      id: userId, 
      username, 
      role: 'user',
      current_mode: 'backtest',
      currency: 'USD',
      prop_firm_enabled: false,
      prop_firm_balance: 1000,
      prop_firm_daily_dd: 5,
      prop_firm_max_dd: 10,
      prop_firm_target: 10,
      prop_firm_payout_total: 0
    } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const userRes = await db.execute({
      sql: "SELECT * FROM users WHERE username = ?",
      args: [username]
    });
    
    if (userRes.rows.length === 0) return res.status(400).json({ error: "Invalid credentials" });
    
    const user = userRes.rows[0] as any;
    const isValid = bcrypt.compareSync(password, user.password as string);
    if (!isValid) return res.status(400).json({ error: "Invalid credentials" });
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
    
    res.json({ user: {
      id: user.id,
      username: user.username,
      role: user.role,
      current_mode: user.current_mode || 'backtest',
      currency: user.currency || 'USD',
      initial_balance: user.initial_balance || 0,
      prop_firm_enabled: user.prop_firm_enabled ? true : false,
      prop_firm_balance: user.prop_firm_balance || 1000,
      prop_firm_daily_dd: user.prop_firm_daily_dd || 5,
      prop_firm_max_dd: user.prop_firm_max_dd || 10,
      prop_firm_target: user.prop_firm_target || 10,
      prop_firm_payout_total: user.prop_firm_payout_total || 0
    } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});


app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
  try {
    const userRes = await db.execute({
      sql: "SELECT id, username, role, current_mode, currency, prop_firm_enabled, prop_firm_balance, prop_firm_daily_dd, prop_firm_max_dd, prop_firm_target, prop_firm_payout_total, initial_balance, myfxbook_session, telegram_id, telegram_tag, coins, active_character_id FROM users WHERE id = ?",
      args: [req.user.id]
    });
    if (userRes.rows.length === 0) return res.status(401).json({ error: "Unauthorized" });
    const user = userRes.rows[0];
    res.json({ user: {
      id: user.id, 
      username: user.username, 
      role: user.role, 
      current_mode: user.current_mode || 'backtest',
      currency: user.currency || 'USD',
      prop_firm_enabled: Boolean(user.prop_firm_enabled),
      prop_firm_balance: user.prop_firm_balance || 1000,
      initial_balance: user.initial_balance,
      myfxbook_connected: !!user.myfxbook_session,
      prop_firm_daily_dd: user.prop_firm_daily_dd || 5,
      prop_firm_max_dd: user.prop_firm_max_dd || 10,
      prop_firm_target: user.prop_firm_target || 10,
      prop_firm_payout_total: user.prop_firm_payout_total || 0,
      telegram_id: user.telegram_id || null,
      telegram_tag: user.telegram_tag || null,
      coins: user.coins !== undefined && user.coins !== null ? Number(user.coins) : 250,
      active_character_id: user.active_character_id || 'jinwoo_e'
    } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/telegram-tag", authMiddleware, async (req: any, res) => {
  try {
    const { telegram_tag, telegram_id } = req.body;
    let cleanTag = telegram_tag ? String(telegram_tag).trim().replace(/^@/, '') : null;
    let cleanId = telegram_id ? String(telegram_id).trim() : null;

    await db.execute({
      sql: "UPDATE users SET telegram_tag = ?, telegram_id = COALESCE(?, telegram_id) WHERE id = ?",
      args: [cleanTag, cleanId, req.user.id]
    });

    if (cleanId) {
      await db.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [cleanId, req.user.id]
      });
      await db.execute({
        sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
        args: [cleanId, req.user.id]
      });
    }

    res.json({ success: true, telegram_tag: cleanTag, telegram_id: cleanId });
  } catch (e) {
    console.error("Save telegram tag error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/currency", authMiddleware, async (req: any, res) => {
  try {
    const { currency } = req.body;
    if (!['USD', 'USC', 'IDR'].includes(currency)) {
      return res.status(400).json({ error: "Invalid currency" });
    }
    await db.execute({
      sql: "UPDATE users SET currency = ? WHERE id = ?",
      args: [currency, req.user.id]
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/balance", authMiddleware, async (req: any, res) => {
  try {
    const { initial_balance } = req.body;
    await db.execute({
      sql: "UPDATE users SET initial_balance = ? WHERE id = ?",
      args: [initial_balance, req.user.id]
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/prop-firm-payout", authMiddleware, async (req: any, res) => {
  try {
    const { amount } = req.body;
    await db.execute({
      sql: "UPDATE users SET prop_firm_payout_total = prop_firm_payout_total + ? WHERE id = ?",
      args: [amount, req.user.id]
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/prop-firm", authMiddleware, async (req: any, res) => {
  try {
    const { prop_firm_enabled, prop_firm_balance, prop_firm_daily_dd, prop_firm_max_dd, prop_firm_target } = req.body;
    await db.execute({
      sql: "UPDATE users SET prop_firm_enabled = ?, prop_firm_balance = ?, prop_firm_daily_dd = ?, prop_firm_max_dd = ?, prop_firm_target = ? WHERE id = ?",
      args: [prop_firm_enabled ? 1 : 0, prop_firm_balance, prop_firm_daily_dd, prop_firm_max_dd, prop_firm_target, req.user.id]
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/mode", authMiddleware, async (req: any, res) => {
  try {
    const { mode } = req.body;
    if (!['backtest', 'live'].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode" });
    }
    await db.execute({
      sql: "UPDATE users SET current_mode = ? WHERE id = ?",
      args: [mode, req.user.id]
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ success: true });
});

app.get("/api/admin/invites", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const invites = await db.execute("SELECT i.*, u.username as used_by_username FROM invite_codes i LEFT JOIN users u ON i.used_by = u.username ORDER BY i.created_at DESC");
    res.json({ invites: invites.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});


app.post("/api/admin/invites", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    await db.execute({
      sql: "INSERT INTO invite_codes (code) VALUES (?)",
      args: [code]
    });
    res.json({ success: true, code });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await db.execute("SELECT id, username, role, created_at FROM users ORDER BY created_at DESC");
    res.json({ users: users.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/users/:id/password", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.execute({
      sql: "UPDATE users SET password = ? WHERE id = ?",
      args: [hashedPassword, req.params.id]
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// API Routes

app.post("/api/trades/bulk", authMiddleware, async (req: any, res) => {
  try {
    const { trades } = req.body;
    if (!Array.isArray(trades)) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    const userRes = await db.execute({
      sql: "SELECT current_mode FROM users WHERE id = ?",
      args: [req.user.id]
    });
    const modeToUse = userRes.rows.length > 0 ? userRes.rows[0].current_mode : 'backtest';

    let successCount = 0;
    for (const trade of trades) {
      await db.execute({
        sql: `INSERT INTO trades (
          user_id, pair, direction, setup_name, entry_price, sl, tp, account_balance, risk_percentage, position_size, nominal_risk, anxiety_level, checklist, notes, result, realized_pl, image, run_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          req.user.id, 
          trade.pair || null, 
          trade.direction || 'Buy', 
          trade.setup_name || 'bgg', 
          trade.entry_price !== undefined ? Number(trade.entry_price) : null, 
          trade.sl !== undefined ? Number(trade.sl) : null, 
          trade.tp !== undefined ? Number(trade.tp) : null, 
          trade.account_balance !== undefined ? Number(trade.account_balance) : 1000, 
          trade.risk_percentage !== undefined ? Number(trade.risk_percentage) : 2.5, 
          trade.position_size !== undefined ? Number(trade.position_size) : 0, 
          trade.nominal_risk !== undefined ? Number(trade.nominal_risk) : 0, 
          trade.anxiety_level !== undefined ? Number(trade.anxiety_level) : 5, 
          trade.checklist ? JSON.stringify(trade.checklist) : '[]', 
          trade.notes || null, 
          trade.result || 'Pending', 
          trade.realized_pl !== undefined && trade.realized_pl !== null ? Number(trade.realized_pl) : null,
          trade.image || null,
          modeToUse,
          trade.created_at || new Date().toISOString()
        ]
      });
      successCount++;
    }

    res.json({ success: true, count: successCount });
  } catch (error) {
    console.error("Bulk import error:", error);
    res.status(500).json({ error: "Failed to import trades" });
  }
});

app.post("/api/trades", authMiddleware, async (req: any, res) => {
  try {
    const {
      pair,
      setup_name,
      entry_price,
      sl,
      tp,
      account_balance,
      risk_percentage,
      position_size,
      nominal_risk,
      anxiety_level,
      checklist,
      notes,
      result,
      realized_pl,
      pips,
      direction,
      image,
      run_mode
    } = req.body;

    const userRes = await db.execute({
      sql: "SELECT current_mode FROM users WHERE id = ?",
      args: [req.user.id]
    });
    const modeToUse = run_mode || (userRes.rows.length > 0 ? userRes.rows[0].current_mode : 'backtest');

    const resultDb = await db.execute({
      sql: `INSERT INTO trades (
        user_id, pair, direction, setup_name, entry_price, sl, tp, account_balance, risk_percentage, position_size, nominal_risk, anxiety_level, checklist, notes, result, realized_pl, pips, image, run_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        req.user.id, 
        pair || null, 
        direction || 'Buy', 
        setup_name || null, 
        entry_price !== undefined ? entry_price : null, 
        sl !== undefined ? sl : null, 
        tp !== undefined ? tp : null, 
        account_balance !== undefined ? account_balance : null, 
        risk_percentage !== undefined ? risk_percentage : null, 
        position_size !== undefined ? position_size : null, 
        nominal_risk !== undefined ? nominal_risk : null, 
        anxiety_level !== undefined ? anxiety_level : null, 
        checklist ? JSON.stringify(checklist) : '[]', 
        notes || null, 
        result || 'Pending', 
        realized_pl !== undefined ? realized_pl : null, 
        pips !== undefined && pips !== null && pips !== '' ? Number(pips) : null,
        image || null, 
        modeToUse
      ]
    });

    res.status(201).json({ id: Number(resultDb.lastInsertRowid) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create trade" });
  }
});

app.get("/api/transactions", authMiddleware, async (req: any, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at ASC",
      args: [req.user.id]
    });
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

app.post("/api/transactions", authMiddleware, async (req: any, res) => {
  try {
    const { type, amount } = req.body;
    if (!['deposit', 'withdrawal'].includes(type) || !amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid transaction data" });
    }
    await db.execute({
      sql: "INSERT INTO transactions (user_id, type, amount) VALUES (?, ?, ?)",
      args: [req.user.id, type, amount]
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add transaction" });
  }
});

app.get("/api/trades", authMiddleware, async (req: any, res) => {
  try {
    const userRes = await db.execute({
      sql: "SELECT current_mode FROM users WHERE id = ?",
      args: [req.user.id]
    });
    const currentMode = userRes.rows.length > 0 ? userRes.rows[0].current_mode : 'backtest';

    const result = await db.execute({
      sql: "SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC",
      args: [req.user.id]
    });
    
    const trades = result.rows.map(row => {
      const rowObj: any = { ...row };
      for (const [key, value] of Object.entries(rowObj)) {
        if (typeof value === 'bigint') {
          rowObj[key] = Number(value);
        }
      }
      return {
        ...rowObj,
        checklist: JSON.parse(rowObj.checklist as string || "[]")
      };
    });
    
    res.json(trades);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch trades" });
  }
});

app.put("/api/trades/:id", authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { result, realized_pl, pips, notes, image } = req.body;
    
    await db.execute({
      sql: `UPDATE trades SET 
        result = ?, 
        realized_pl = ?, 
        pips = CASE WHEN ? IS NOT NULL THEN ? ELSE pips END,
        notes = ?, 
        image = ? 
      WHERE id = ? AND user_id = ?`,
      args: [
        result, 
        realized_pl !== undefined ? realized_pl : null, 
        pips !== undefined ? Number(pips) : null,
        pips !== undefined ? Number(pips) : null,
        notes !== undefined ? notes : null,
        image !== undefined ? image : null,
        id, 
        req.user.id
      ]
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update trade" });
  }
});

app.delete("/api/trades/date/:dateStr", authMiddleware, async (req: any, res) => {
  try {
    const { dateStr } = req.params; // format: YYYY-MM-DD
    const allTrades = await db.execute({
      sql: "SELECT id, created_at FROM trades WHERE user_id = ?",
      args: [req.user.id]
    });
    
    const idsToDelete = allTrades.rows
      .filter(row => {
         try {
           const d = new Date(row.created_at + (String(row.created_at).includes('Z') ? '' : 'Z'));
           return d.toISOString().split('T')[0] === dateStr;
         } catch(e) {
           return String(row.created_at).startsWith(dateStr);
         }
      })
      .map(row => row.id);
      
    if (idsToDelete.length > 0) {
      for (const id of idsToDelete) {
        await db.execute({
          sql: "DELETE FROM trades WHERE id = ? AND user_id = ?",
          args: [id, req.user.id]
        });
      }
    }
    
    res.json({ success: true, deletedCount: idsToDelete.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete trades for this date" });
  }
});


app.delete("/api/trades/:id", authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    await db.execute({
      sql: "DELETE FROM trades WHERE id = ? AND user_id = ?",
      args: [Number(id), req.user.id]
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete trade" });
  }
});

// Add catchall for /api 404 to guarantee JSON
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API Route Not Found: ${req.method} ${req.url}` });
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Unhandled API error:", err);
  res.status(err.status || 500).json({ error: err?.message || "Internal Server Error" });
});



// Setup Vite & Static Files asynchronously
async function setupVite() {
  if (process.env.VERCEL) return;
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const viteMod = "vite";
    const { createServer: createViteServer } = await import(/* @vite-ignore */ viteMod);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
       res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Telegram Keep-Alive / Anti-Cold Start
    setInterval(() => {
      try {
        fetch(`http://localhost:${PORT}/api/health`).catch(() => {});
      } catch (e) {}
    }, 4 * 60 * 1000); // ping every 4 mins
  });
}

setupVite();

export default app;
