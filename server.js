// server.ts
import dotenv from "dotenv";
import express from "express";
import { createClient } from "@libsql/client";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt2 from "bcryptjs";
import cookieParser from "cookie-parser";

// src/lib/telegram.ts
import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import bcrypt from "bcryptjs";
function escapeHtml(text) {
  if (text === null || text === void 0) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
var sendOrEdit = async (ctx, msg, useBackButton = false, customButtons) => {
  try {
    const extra = { parse_mode: "HTML" };
    const rows = [];
    if (customButtons && customButtons.length > 0) {
      rows.push(...customButtons);
    }
    if (useBackButton) {
      rows.push([{ text: "\u{1F519} Kembali ke Menu Utama", callback_data: "cmd_menu" }]);
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
function calculatePips(pair, entry, exitPrice, pl, lot, isWin, isNano = false) {
  const p = (pair || "XAUUSD").toUpperCase();
  const safeLot = lot > 0 ? lot : 0.1;
  if (entry > 0 && exitPrice > 0 && Math.abs(exitPrice - entry) > 0) {
    let multiplier = 10;
    if (p.includes("JPY")) multiplier = 100;
    else if (p.includes("EUR") || p.includes("GBP") || p.includes("AUD") || p.includes("NZD") || p.includes("CAD") || p.includes("CHF") || p.includes("USD") && !p.includes("XAU") && !p.includes("BTC") && !p.includes("ETH")) {
      multiplier = 1e4;
    } else if (p.includes("BTC") || p.includes("ETH")) multiplier = 1;
    const diff = Math.round(Math.abs(exitPrice - entry) * multiplier);
    if (diff > 0 && diff < 5e4) return isWin ? diff : -diff;
  }
  if (pl !== 0 && safeLot > 0) {
    let pipValuePerLot = isNano ? 1 : 10;
    if (p.includes("BTC") || p.includes("ETH")) {
      pipValuePerLot = isNano ? 0.1 : 1;
    } else if (p.includes("JPY")) {
      pipValuePerLot = isNano ? 0.85 : 8.5;
    }
    const pipWorth = safeLot * pipValuePerLot;
    if (pipWorth > 0) {
      const calculatedPips = Math.round(Math.abs(pl) / pipWorth);
      if (calculatedPips > 0 && calculatedPips < 5e4) {
        return pl >= 0 ? calculatedPips : -calculatedPips;
      }
    }
  }
  return Math.round(pl);
}
var cachedNews = null;
async function fetchForexNews(force = false) {
  const now = Date.now();
  if (!force && cachedNews && now - cachedNews.fetchedAt < 10 * 60 * 1e3) {
    return cachedNews.data;
  }
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "User-Agent": "Mozilla/5.0 (TelegramTradingJournalBot)" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      cachedNews = { data, fetchedAt: now };
      return data;
    }
  } catch (err) {
    console.warn("Could not fetch live ForexFactory news, using cache or fallback:", err);
  }
  return cachedNews?.data || [];
}
var getCurrencyFlag = (country) => {
  switch ((country || "").toUpperCase()) {
    case "USD":
      return "\u{1F1FA}\u{1F1F8}";
    case "EUR":
      return "\u{1F1EA}\u{1F1FA}";
    case "GBP":
      return "\u{1F1EC}\u{1F1E7}";
    case "JPY":
      return "\u{1F1EF}\u{1F1F5}";
    case "AUD":
      return "\u{1F1E6}\u{1F1FA}";
    case "CAD":
      return "\u{1F1E8}\u{1F1E6}";
    case "CHF":
      return "\u{1F1E8}\u{1F1ED}";
    case "NZD":
      return "\u{1F1F3}\u{1F1FF}";
    case "CNY":
      return "\u{1F1E8}\u{1F1F3}";
    default:
      return "\u{1F310}";
  }
};
var getNewsImpactBadge = (impact) => {
  switch ((impact || "").toLowerCase()) {
    case "high":
      return "\u{1F534} <b>[HIGH]</b>";
    case "medium":
      return "\u{1F7E0} <b>[MED]</b>";
    case "low":
      return "\u{1F7E1} <b>[LOW]</b>";
    default:
      return "\u26AA <b>[HOLIDAY]</b>";
  }
};
function parseTradeData(content) {
  try {
    let parsedPips = null;
    const pMatch = content.match(/pips?[:\s=]+([+-]?\d+(?:\.\d+)?)/i);
    if (pMatch) {
      parsedPips = parseFloat(pMatch[1]);
    }
    const isJson = content.trim().startsWith("{");
    if (isJson) {
      const json = JSON.parse(content);
      if (json.pips !== void 0 && !isNaN(parseFloat(json.pips))) {
        parsedPips = parseFloat(json.pips);
      }
      return {
        dateStr: json.date ? `${json.date}T${json.time || "00:00"}:00` : "",
        pair: json.pair || "XAUUSD",
        direction: json.direction || "Buy",
        setup_name: json.setup_name || json.setup || "Telegram Quick Log",
        entry: parseFloat(json.entry_price || json.entry) || 0,
        sl: parseFloat(json.sl) || 0,
        tp: parseFloat(json.tp) || 0,
        size: parseFloat(json.position_size || json.size) || 0.01,
        result: json.result || "WIN",
        pl: parseFloat(json.pl || json.realized_pl) || 0,
        pips: parsedPips,
        emotionScore: 2,
        notes: json.notes || json.reason || ""
      };
    } else {
      const parts = content.split(",").map((s) => s.trim());
      if (parts.length >= 11) {
        const date = parts[0] || "";
        const time = parts[1] || "";
        let combinedDate = "";
        if (date && time) {
          const cleanDate = date.replace(/\//g, "-").replace(/\./g, "-");
          combinedDate = `${cleanDate}T${time}:00`;
        }
        const rawNotes = parts.length > 12 ? parts.slice(12).join(", ").trim() : "";
        return {
          dateStr: combinedDate,
          pair: parts[2]?.toUpperCase() || "XAUUSD",
          direction: parts[3]?.toUpperCase().includes("SELL") ? "Sell" : "Buy",
          setup_name: parts[4] || "CSV Import",
          entry: parseFloat(parts[5]) || 0,
          sl: parseFloat(parts[6]) || 0,
          tp: parseFloat(parts[7]) || 0,
          size: parseFloat(parts[8]) || 0.01,
          result: parts[9] || "WIN",
          pl: parseFloat(parts[10]) || 0,
          pips: parsedPips,
          emotionScore: 2,
          notes: rawNotes || ""
        };
      }
    }
  } catch (e) {
    console.error("Failed to parse trade data:", e);
  }
  return null;
}
var botStatus = {
  configured: false,
  authenticated: false,
  username: null,
  error: null
};
var journalSessions = /* @__PURE__ */ new Map();
var pendingPhotos = /* @__PURE__ */ new Map();
async function getTelegramImageBase64(fileLinkUrl) {
  try {
    const res = await fetch(fileLinkUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (e) {
    console.error("Failed to convert Telegram image to base64, returning url:", e);
    return fileLinkUrl;
  }
}
var cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of journalSessions.entries()) {
    if (now - session.timestamp > 15 * 60 * 1e3) {
      journalSessions.delete(id);
    }
  }
  for (const [id, photo] of pendingPhotos.entries()) {
    if (now - photo.timestamp > 15 * 60 * 1e3) {
      pendingPhotos.delete(id);
    }
  }
}, 60 * 1e3);
if (typeof cleanupInterval.unref === "function") {
  cleanupInterval.unref();
}
function initTelegramBot(db2) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "8443526888:AAF8B7uWR5NomsFWGZCac3fE7uuP865A2m4";
  if (!token) {
    botStatus.configured = false;
    botStatus.authenticated = false;
    botStatus.error = "Token not configured";
    return null;
  }
  botStatus.configured = true;
  const bot2 = new Telegraf(token);
  bot2.catch((err, ctx) => {
    console.error(`Telegram Bot Error for ${ctx?.updateType || "update"}:`, err?.message || err);
    try {
      if (ctx && ctx.reply) {
        ctx.reply("\u26A0\uFE0F Terjadi sedikit kendala koneksi sistem. Silakan ulangi perintah Anda.");
      }
    } catch (_) {
    }
  });
  bot2.telegram.getMe().then((botInfo) => {
    botStatus.authenticated = true;
    botStatus.username = botInfo.username;
    botStatus.error = null;
    console.log(`\u{1F680} Telegram Bot authenticated successfully as @${botInfo.username}`);
    bot2.telegram.setMyCommands([
      { command: "menu", description: "\u{1F4F1} Buka Control Panel navigasi interaktif" },
      { command: "jurnal", description: "\u{1F4DD} Jurnal trade interaktif langkah demi langkah" },
      { command: "quick", description: "\u26A1 Catat trade 1 baris cepat: /quick [pair] [buy/sell] [lot] [p/l]" },
      { command: "buy", description: "\u{1F7E2} Shortcut catat posisi BUY: /buy [pair] [lot] [p/l]" },
      { command: "sell", description: "\u{1F534} Shortcut catat posisi SELL: /sell [pair] [lot] [p/l]" },
      { command: "running", description: "\u23F3 Lihat daftar trade terbuka / pending order" },
      { command: "close", description: "\u2705 Tutup trade running: /close [id] [win/loss] [p/l]" },
      { command: "saldo", description: "\u{1F4B0} Cek saldo modal, equity & status drawdown" },
      { command: "today", description: "\u{1F4CA} Rekap statistik performa hari ini" },
      { command: "weekly", description: "\u{1F4C8} Rekap performa 7 hari terakhir" },
      { command: "lot", description: "\u{1F9EE} Hitung lot otomatis berdasarkan toleransi risiko" },
      { command: "news", description: "\u{1F4F0} Kalender ekonomi Forex & berita pasar high-impact" },
      { command: "setrisk", description: "\u{1F6E1}\uFE0F Atur toleransi risiko per trade: /setrisk [persen]" },
      { command: "setaccount", description: "\u{1F3F7}\uFE0F Pilih tipe akun: Standard ($), Cent (\xA2), atau Nano (\xA2)" },
      { command: "setmodal", description: "\u{1F4B0} Setel modal awal akun: /setmodal [jumlah]" },
      { command: "deposit", description: "\u{1F4E5} Catat deposit saldo: /deposit [jumlah]" },
      { command: "wd", description: "\u{1F4E4} Catat penarikan keuntungan: /wd [jumlah]" },
      { command: "undo", description: "\u21A9\uFE0F Batalkan/hapus trade terakhir" },
      { command: "accounts", description: "\u{1F465} Kelola akun multi-user & ganti akun" },
      { command: "help", description: "\u{1F4A1} Panduan lengkap semua perintah" }
    ]).catch((cmdErr) => {
      console.warn("\u26A0\uFE0F Could not set Telegram commands:", cmdErr?.message || cmdErr);
    });
    const setupBotRunner = async () => {
      const prodUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
      if (process.env.VERCEL || process.env.NOW_REGION) {
        console.log("\u26A1 Running in Vercel Serverless: Webhook mode active");
        if (prodUrl) {
          let clean = prodUrl.trim();
          if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
            clean = `https://${clean}`;
          }
          if (clean.startsWith("http://") && !clean.includes("localhost")) {
            clean = clean.replace("http://", "https://");
          }
          const webhookUrl = `${clean.replace(/\/+$/, "")}/api/webhook`;
          try {
            const currentInfo = await bot2.telegram.getWebhookInfo();
            if (currentInfo.url !== webhookUrl) {
              await bot2.telegram.setWebhook(webhookUrl, {
                allowed_updates: ["message", "callback_query"]
              });
              console.log(`\u{1F310} Telegram Webhook auto-registered: ${webhookUrl}`);
            }
          } catch (whErr) {
            console.warn("\u26A0\uFE0F Webhook auto-setup notice:", whErr?.message || whErr);
          }
        }
        return;
      }
      bot2.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {
      }).finally(() => {
        bot2.launch({
          allowedUpdates: ["message", "callback_query"]
        }).then(() => {
          console.log("\u{1F680} Telegram Bot is actively running (Long Polling)!");
        }).catch((launchErr) => {
          console.warn("\u26A0\uFE0F Telegram Bot launch warning:", launchErr?.message || launchErr);
          setTimeout(setupBotRunner, 5e3);
        });
      });
    };
    setupBotRunner();
  }).catch((authErr) => {
    botStatus.authenticated = false;
    const is401 = authErr?.response?.error_code === 401 || authErr?.message?.includes("401") || authErr?.message?.includes("Unauthorized");
    botStatus.error = is401 ? "Unauthorized (401): Token is invalid or revoked" : authErr?.message || "Authentication failed";
    console.warn("\u26A0\uFE0F Telegram Bot auth failed:", botStatus.error);
  });
  const ensureTables = async () => {
    try {
      await db2.execute(`
        CREATE TABLE IF NOT EXISTS telegram_sessions (
          telegram_id TEXT PRIMARY KEY,
          active_user_id INTEGER,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db2.execute(`
        CREATE TABLE IF NOT EXISTS telegram_accounts (
          telegram_id TEXT,
          user_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (telegram_id, user_id)
        )
      `);
      try {
        await db2.execute("ALTER TABLE users ADD COLUMN default_risk REAL DEFAULT 2.5");
      } catch (_) {
      }
    } catch (e) {
      console.error("ensureTables error:", e);
    }
  };
  ensureTables();
  const getActiveUser = async (telegramId, telegramUsername) => {
    if (!telegramId) return null;
    await ensureTables();
    try {
      const sessionRes = await db2.execute({
        sql: `SELECT users.* FROM telegram_sessions 
              JOIN users ON telegram_sessions.active_user_id = users.id 
              WHERE telegram_sessions.telegram_id = ?`,
        args: [telegramId]
      });
      if (sessionRes.rows.length > 0) {
        return sessionRes.rows[0];
      }
    } catch (e) {
    }
    try {
      const userRes = await db2.execute({
        sql: "SELECT * FROM users WHERE telegram_id = ?",
        args: [telegramId]
      });
      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        const uId = Number(u.id);
        await db2.execute({
          sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
          args: [telegramId, uId]
        }).catch(() => {
        });
        await db2.execute({
          sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
          args: [telegramId, uId]
        }).catch(() => {
        });
        return u;
      }
    } catch (e) {
    }
    if (telegramUsername) {
      try {
        const cleanTag = telegramUsername.replace(/^@/, "").toLowerCase().trim();
        const tagRes = await db2.execute({
          sql: "SELECT * FROM users WHERE LOWER(TRIM(telegram_tag)) = ? OR LOWER(TRIM(telegram_tag)) = ?",
          args: [cleanTag, "@" + cleanTag]
        });
        if (tagRes.rows.length > 0) {
          const u = tagRes.rows[0];
          const uId = Number(u.id);
          await db2.execute({
            sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
            args: [telegramId, uId]
          }).catch(() => {
          });
          await db2.execute({
            sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
            args: [telegramId, uId]
          }).catch(() => {
          });
          await db2.execute({
            sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
            args: [telegramId, uId]
          }).catch(() => {
          });
          return u;
        }
      } catch (e) {
      }
    }
    try {
      const allUsers = await db2.execute("SELECT * FROM users ORDER BY id ASC");
      if (allUsers.rows.length === 1) {
        const u = allUsers.rows[0];
        const uId = Number(u.id);
        await db2.execute({
          sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
          args: [telegramId, uId]
        }).catch(() => {
        });
        await db2.execute({
          sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
          args: [telegramId, uId]
        }).catch(() => {
        });
        return u;
      }
    } catch (e) {
    }
    return null;
  };
  const sendUnlinkedPrompt = async (ctx) => {
    try {
      const usersRes = await db2.execute("SELECT id, username FROM users WHERE LOWER(username) != 'aurel' ORDER BY id ASC LIMIT 5");
      const userButtons = [];
      const rows = usersRes.rows;
      const btnRow = [];
      rows.forEach((u) => {
        btnRow.push(Markup.button.callback(`\u{1F464} ${u.username}`, `quick_link_${u.id}`));
      });
      if (btnRow.length > 0) {
        userButtons.push(btnRow);
      }
      const msg = `\u26A0\uFE0F <b>AKUN TELEGRAM BELUM TERHUBUNG</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Akun Telegram Anda belum ditautkan ke akun web trading.

<b>Cara Cepat Menghubungkan:</b>
1. Klik salah satu akun Anda di tombol bawah untuk langsung menautkan:
2. Atau ketik perintah: <code>/link username</code> (cth: <code>/link jalu</code>)
3. Atau login resmi: <code>/login username password</code>`;
      await ctx.reply(msg, {
        parse_mode: "HTML",
        reply_markup: userButtons.length > 0 ? { inline_keyboard: userButtons } : void 0
      });
    } catch (e) {
      await ctx.reply("\u26A0\uFE0F Akun belum terhubung. Gunakan: <code>/link [username]</code> atau <code>/login [username] [password]</code>", { parse_mode: "HTML" });
    }
  };
  const getUserEquityData = async (userId, userData) => {
    const isProp = !!userData.prop_firm_enabled;
    const initialBal = isProp ? userData.prop_firm_balance || 1e3 : userData.initial_balance || 1e3;
    const tradesRes = await db2.execute({
      sql: "SELECT realized_pl, result, entry_price, sl, tp, pair, position_size, created_at FROM trades WHERE user_id = ? AND result != 'Pending'",
      args: [userId]
    });
    const trades = tradesRes.rows;
    let totalPL = 0;
    let wins = 0;
    let totalPips = 0;
    let winningPips = 0;
    trades.forEach((t) => {
      const pl = t.realized_pl || 0;
      totalPL += pl;
      const isWin = (t.result || "").toUpperCase() === "WIN";
      if (isWin) wins++;
      const pips = t.pips !== null && t.pips !== void 0 && !isNaN(Number(t.pips)) ? Number(t.pips) : calculatePips(t.pair || "XAUUSD", t.entry_price || 0, t.tp || 0, pl, t.position_size || 0.1, isWin, userData?.currency === "NANO");
      totalPips += pips;
      if (pips > 0) winningPips += pips;
    });
    const txRes = await db2.execute({
      sql: "SELECT type, amount FROM transactions WHERE user_id = ?",
      args: [userId]
    });
    let totalDeposit = 0;
    let totalWithdraw = 0;
    txRes.rows.forEach((tx) => {
      if (tx.type === "deposit") totalDeposit += tx.amount || 0;
      if (tx.type === "withdrawal") totalWithdraw += tx.amount || 0;
    });
    let currentEquity = initialBal + totalDeposit - totalWithdraw + totalPL;
    if (isProp && userData.prop_firm_payout_total) {
      currentEquity -= userData.prop_firm_payout_total || 0;
    }
    const now = /* @__PURE__ */ new Date();
    const todayStr = now.toISOString().split("T")[0];
    let todayLoss = 0;
    let todayTradesCount = 0;
    let todayWins = 0;
    let todayPL = 0;
    trades.forEach((t) => {
      let d = t.created_at || "";
      if (!d.includes("Z")) d += "Z";
      try {
        if (new Date(d).toISOString().split("T")[0] === todayStr) {
          todayTradesCount++;
          const pl = t.realized_pl || 0;
          todayPL += pl;
          if (pl < 0) todayLoss += Math.abs(pl);
          if ((t.result || "").toUpperCase() === "WIN") todayWins++;
        }
      } catch (e) {
      }
    });
    const dailyDDPct = userData.prop_firm_daily_dd || 5;
    const dailyMaxLoss = Math.max(25, initialBal * dailyDDPct / 100);
    const ddRemaining = Math.max(0, dailyMaxLoss - todayLoss);
    return {
      initialBal,
      totalDeposit,
      totalWithdraw,
      totalPL,
      currentEquity,
      tradesCount: trades.length,
      winRate: trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : "0.0",
      totalPips,
      winningPips,
      dailyMaxLoss,
      todayLoss,
      ddRemaining,
      todayTradesCount,
      todayWins,
      todayPL,
      todayWinRate: todayTradesCount > 0 ? (todayWins / todayTradesCount * 100).toFixed(1) : "0.0"
    };
  };
  bot2.action(/quick_link_(\d+)/, async (ctx) => {
    try {
      const targetUserId = parseInt(ctx.match[1], 10);
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;
      const userRes = await db2.execute({
        sql: "SELECT * FROM users WHERE id = ?",
        args: [targetUserId]
      });
      if (userRes.rows.length === 0) {
        return ctx.reply("\u274C Akun tidak ditemukan.");
      }
      const u = userRes.rows[0];
      await ensureTables();
      await db2.execute({
        sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
        args: [telegramId, targetUserId]
      });
      await db2.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telegramId, targetUserId]
      });
      await db2.execute({
        sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
        args: [telegramId, targetUserId]
      });
      await ctx.editMessageText(
        `\u2705 <b>AKUN BERHASIL DITAUTKAN!</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Akun aktif sekarang: <code>${u.username}</code>

Sekarang Anda dapat langsung mencatat trade dengan /jurnal atau /quick!`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "\u{1F4DD} Mulai Jurnal Trade", callback_data: "cmd_start_journal" }],
              [{ text: "\u{1F4B0} Cek Saldo & Equity", callback_data: "cmd_saldo" }]
            ]
          }
        }
      );
    } catch (e) {
      console.error(e);
      await ctx.reply("\u274C Gagal menautkan akun.");
    }
  });
  const handleStart = async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);
    let welcome = `\u{1F4CA} <b>PRO TRADING JOURNAL BOT</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Selamat datang di asisten pencatatan trading otomatis.

`;
    if (user) {
      const stats = await getUserEquityData(user.id, user);
      welcome += `\u{1F464} <b>Akun Aktif:</b> <code>${user.username}</code> (${user.current_mode || "backtest"})
\u{1F4B0} <b>Equity Terkini:</b> $${stats.currentEquity.toFixed(2)}
\u{1F3AF} <b>Total Trades:</b> ${stats.tradesCount} trades | Win Rate: ${stats.winRate}%

`;
    } else {
      welcome += `\u26A0\uFE0F <b>Status Akun:</b> Belum terhubung ke dashboard web.
Tautkan akun dengan: <code>/link username</code> atau <code>/login user pass</code>

`;
    }
    welcome += `\u{1F4CB} <b>Menu & Perintah Utama:</b>
\u2022 <code>/jurnal</code> - \u{1F4DD} Form interaktif input trade langkah demi langkah
\u2022 <code>/quick</code> - \u26A1 Catat trade 1 baris cepat
\u2022 <code>/buy</code> & <code>/sell</code> - \u{1F7E2}\u{1F534} Shortcut instan posisi Buy / Sell
\u2022 <code>/running</code> - \u23F3 Lihat & tutup trade terbuka
\u2022 <code>/saldo</code> - \u{1F4B0} Cek saldo, equity & drawdown
\u2022 <code>/today</code> - \u{1F4CA} Rekap performa hari ini
\u2022 <code>/menu</code> - \u{1F4F1} Buka Control Panel tombol navigasi
\u2022 <code>/help</code> - \u{1F4A1} Panduan format lengkap`;
    const buttons = [
      [Markup.button.callback("\u{1F4DD} Jurnal Trade Baru", "cmd_start_journal"), Markup.button.callback("\u{1F4B0} Cek Saldo", "cmd_saldo")],
      [Markup.button.callback("\u{1F4CA} Performa Hari Ini", "cmd_today"), Markup.button.callback("\u{1F9EE} Hitung Lot", "cmd_lot")],
      [Markup.button.callback("\u{1F4F1} Buka Menu Lengkap", "cmd_menu")]
    ];
    await ctx.reply(welcome, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    });
  };
  bot2.start(handleStart);
  const startJournalWizard = async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);
    if (!user) {
      return sendUnlinkedPrompt(ctx);
    }
    journalSessions.set(telegramId, {
      step: "pair",
      timestamp: Date.now()
    });
    const msg = `\u{1F4DD} <b>JURNAL TRADE BARU (Langkah 1/6)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <code>${user.username}</code>

Pilih instrumen / pair yang Anda tradingkan, atau ketik langsung di chat (cth: <i>EURUSD</i>):`;
    const pairKeyboard = [
      [Markup.button.callback("\u{1F7E1} XAUUSD (Gold)", "jp_XAUUSD"), Markup.button.callback("\u{1FA99} BTCUSD", "jp_BTCUSD")],
      [Markup.button.callback("\u{1F1EA}\u{1F1FA} EURUSD", "jp_EURUSD"), Markup.button.callback("\u{1F1EC}\u{1F1E7} GBPUSD", "jp_GBPUSD")],
      [Markup.button.callback("\u{1F1EF}\u{1F1F5} USDJPY", "jp_USDJPY"), Markup.button.callback("\u{1F1E6}\u{1F1FA} AUDUSD", "jp_AUDUSD")],
      [Markup.button.callback("\u274C Batalkan Jurnal", "cmd_cancel_journal")]
    ];
    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: pairKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: pairKeyboard } }));
    } else {
      await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: pairKeyboard } });
    }
  };
  bot2.command(["jurnal", "journal", "trade", "catat", "input"], startJournalWizard);
  bot2.action("cmd_start_journal", startJournalWizard);
  bot2.action(/jp_(.+)/, async (ctx) => {
    const pair = ctx.match[1];
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) {
      return ctx.reply("Sesi jurnal telah berakhir. Ketik /jurnal untuk mulai baru.");
    }
    session.pair = pair;
    session.step = "direction";
    session.timestamp = Date.now();
    const msg = `\u{1F4DD} <b>JURNAL TRADE (Langkah 2/6)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4C8} Pair: <b>${pair}</b>

Pilih arah posisi trade:`;
    const dirKeyboard = [
      [Markup.button.callback("\u{1F7E2} BUY (Long)", "jd_BUY"), Markup.button.callback("\u{1F534} SELL (Short)", "jd_SELL")],
      [Markup.button.callback("\u274C Batalkan", "cmd_cancel_journal")]
    ];
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: dirKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: dirKeyboard } }));
  });
  bot2.action(/jd_(BUY|SELL)/, async (ctx) => {
    const direction = ctx.match[1];
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply("Sesi jurnal telah berakhir. Ketik /jurnal untuk mulai baru.");
    session.direction = direction;
    session.step = "lot";
    session.timestamp = Date.now();
    const dirBadge = direction === "BUY" ? "\u{1F7E2} BUY" : "\u{1F534} SELL";
    const msg = `\u{1F4DD} <b>JURNAL TRADE (Langkah 3/6)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4C8} Pair: <b>${session.pair}</b> (${dirBadge})

Pilih atau ketik ukuran Lot posisi (cth: <i>0.05</i>):`;
    const lotKeyboard = [
      [Markup.button.callback("0.01 Lot", "jl_0.01"), Markup.button.callback("0.05 Lot", "jl_0.05"), Markup.button.callback("0.10 Lot", "jl_0.10")],
      [Markup.button.callback("0.20 Lot", "jl_0.20"), Markup.button.callback("0.50 Lot", "jl_0.50"), Markup.button.callback("1.00 Lot", "jl_1.00")],
      [Markup.button.callback("\u274C Batalkan", "cmd_cancel_journal")]
    ];
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: lotKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: lotKeyboard } }));
  });
  bot2.action(/jl_([0-9.]+)/, async (ctx) => {
    const lot = parseFloat(ctx.match[1]);
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply("Sesi jurnal telah berakhir. Ketik /jurnal untuk mulai baru.");
    session.lot = lot;
    session.step = "entry";
    session.timestamp = Date.now();
    const dirBadge = session.direction === "BUY" ? "\u{1F7E2} BUY" : "\u{1F534} SELL";
    const msg = `\u{1F4DD} <b>JURNAL TRADE (Langkah 4/6)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4C8} Pair: <b>${session.pair}</b> (${dirBadge}) | Lot: <b>${lot}</b>

Ketik harga <b>Entry</b> Anda di chat (cth: <code>2650.50</code>)
<i>Atau klik tombol lewati jika tidak ingin mencatat harga entry.</i>`;
    const skipKeyboard = [
      [Markup.button.callback("\u23E9 Lewati Entry Price", "js_skip_entry")],
      [Markup.button.callback("\u274C Batalkan", "cmd_cancel_journal")]
    ];
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: skipKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: skipKeyboard } }));
  });
  bot2.action("js_skip_entry", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply("Sesi jurnal telah berakhir. Ketik /jurnal.");
    session.entry = 0;
    session.step = "result";
    session.timestamp = Date.now();
    const msg = `\u{1F4DD} <b>JURNAL TRADE (Langkah 5/6)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4C8} Pair: <b>${session.pair}</b> (${session.direction}) | Lot: <b>${session.lot}</b>

Pilih status hasil dari trade ini:`;
    const resKeyboard = [
      [Markup.button.callback("\u{1F3C6} WIN (Profit)", "jr_WIN"), Markup.button.callback("\u274C LOSS (Rugi)", "jr_LOSS")],
      [Markup.button.callback("\u2696\uFE0F BE (Break Even)", "jr_BE"), Markup.button.callback("\u23F3 Masih Berjalan (Running)", "jr_PENDING")],
      [Markup.button.callback("\u274C Batalkan", "cmd_cancel_journal")]
    ];
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: resKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: resKeyboard } }));
  });
  bot2.action(/jr_(WIN|LOSS|BE|PENDING)/, async (ctx) => {
    const res = ctx.match[1];
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply("Sesi jurnal telah berakhir. Ketik /jurnal.");
    session.result = res === "PENDING" ? "Pending" : res;
    session.timestamp = Date.now();
    if (res === "BE") {
      session.pnl = 0;
      session.step = "setup";
      return promptSetupStep(ctx, session);
    }
    if (res === "PENDING") {
      session.pnl = 0;
      session.step = "setup";
      return promptSetupStep(ctx, session);
    }
    session.step = "pnl";
    const isWin = res === "WIN";
    const msg = `\u{1F4DD} <b>JURNAL TRADE (Langkah 6/6 - Profit/Loss)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Status: ${isWin ? "\u{1F3C6} <b>WIN (Profit)</b>" : "\u274C <b>LOSS (Rugi)</b>"}

Ketik nominal Realized P/L dalam USD ($):
\u2022 Contoh jika untung: <code>+125.50</code> atau <code>125</code>
\u2022 Contoh jika rugi: <code>-45.00</code> atau <code>45</code>`;
    await ctx.editMessageText(msg, { parse_mode: "HTML" }).catch(() => ctx.reply(msg, { parse_mode: "HTML" }));
  });
  const promptSetupStep = async (ctx, session) => {
    const msg = `\u{1F3AF} <b>PILIH STRATEGI / SETUP TRADE</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Pilih setup atau ketik catatan strategi Anda di chat:`;
    const setupKeyboard = [
      [Markup.button.callback("Breakout H4/H1", "jsu_Breakout"), Markup.button.callback("FVG / ICT Concept", "jsu_FVG")],
      [Markup.button.callback("Support & Resistance", "jsu_SnR"), Markup.button.callback("Trend Following", "jsu_Trend")],
      [Markup.button.callback("\u23E9 Tanpa Setup (Lanjut)", "jsu_General")]
    ];
    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: setupKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: setupKeyboard } }));
    } else {
      await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: setupKeyboard } });
    }
  };
  const promptImageStep = async (ctx, session) => {
    session.step = "image";
    session.timestamp = Date.now();
    const msg = `\u{1F4F8} <b>LAMPIRKAN SCREENSHOT CHART (Opsional)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Kirim foto atau screenshot chart entry Anda sekarang di chat.

<i>Atau klik tombol di bawah jika tidak ingin melampirkan gambar.</i>`;
    const imgKeyboard = [
      [Markup.button.callback("\u23E9 Simpan Tanpa Gambar", "js_skip_image")],
      [Markup.button.callback("\u274C Batalkan Jurnal", "cmd_cancel_journal")]
    ];
    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: imgKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: imgKeyboard } }));
    } else {
      await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: imgKeyboard } });
    }
  };
  bot2.action(/jsu_(.+)/, async (ctx) => {
    const setup = ctx.match[1];
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply("Sesi jurnal telah berakhir. Ketik /jurnal.");
    session.setup = setup === "General" ? "Standard Setup" : setup;
    if (session.image) {
      await completeInteractiveJournal(ctx, telegramId, session);
    } else {
      await promptImageStep(ctx, session);
    }
  });
  bot2.action("js_skip_image", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const session = journalSessions.get(telegramId);
    if (!session) return ctx.reply("Sesi jurnal telah berakhir. Ketik /jurnal.");
    await completeInteractiveJournal(ctx, telegramId, session);
  });
  bot2.action("cmd_cancel_journal", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (telegramId) journalSessions.delete(telegramId);
    await ctx.editMessageText("\u274C Pencatatan jurnal dibatalkan.", {
      reply_markup: {
        inline_keyboard: [[{ text: "\u{1F4F1} Buka Menu", callback_data: "cmd_menu" }]]
      }
    }).catch(() => ctx.reply("Pencatatan jurnal dibatalkan."));
  });
  const completeInteractiveJournal = async (ctx, telegramId, s) => {
    try {
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return ctx.reply("\u274C Akun tidak ditemukan.");
      journalSessions.delete(telegramId);
      const pair = (s.pair || "XAUUSD").toUpperCase();
      const direction = s.direction || "BUY";
      const lot = s.lot || 0.01;
      const entry = s.entry || 0;
      const sl = s.sl || 0;
      const tp = s.tp || 0;
      const result = s.result || "WIN";
      const pnl = s.pnl || 0;
      const setup = s.setup || "Telegram Journal";
      const mode = user.current_mode || "backtest";
      const isWin = result.toUpperCase() === "WIN";
      const pips = calculatePips(pair, entry, tp, pnl, lot, isWin, user?.currency === "NANO");
      const insertRes = await db2.execute({
        sql: `INSERT INTO trades (
          user_id, pair, direction, setup_name, entry_price, sl, tp,
          account_balance, position_size, result, realized_pl, pips,
          anxiety_level, notes, image, image_url, has_image, run_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          user.id,
          pair,
          direction,
          setup,
          entry,
          sl,
          tp,
          0,
          lot,
          result,
          pnl,
          pips,
          2,
          `Logged via Telegram Interactive Wizard`,
          s.image || null,
          s.image || null,
          s.image ? 1 : 0,
          mode
        ]
      });
      const tradeId = insertRes.lastInsertRowid;
      const equityData = await getUserEquityData(user.id, user);
      const signPL = pnl >= 0 ? "+" : "";
      const signPips = pips >= 0 ? "+" : "";
      const card = `\u2705 <b>TRADE BERHASIL DICATAT!</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F194} <b>Trade ID:</b> #${tradeId}
\u{1F464} <b>Akun:</b> <code>${user.username}</code> (${mode})
\u{1F4C8} <b>Pair:</b> <b>${pair}</b> (${direction === "BUY" ? "\u{1F7E2} BUY" : "\u{1F534} SELL"})
\u{1F4E6} <b>Lot Size:</b> <b>${lot}</b>
` + (entry > 0 ? `\u{1F3AF} <b>Entry:</b> ${entry}
` : "") + (sl > 0 ? `\u{1F6D1} <b>SL:</b> ${sl} | \u{1F3AF} <b>TP:</b> ${tp}
` : "") + `\u{1F3C6} <b>Status:</b> <b>${result}</b>
\u{1F4B5} <b>Realized P/L:</b> <b>${signPL}$${pnl.toFixed(2)}</b>
\u{1F4CF} <b>Pips:</b> <b>${signPips}${pips} Pips</b>
\u{1F3AF} <b>Setup:</b> ${setup}
` + (s.image ? `\u{1F4F8} <b>Screenshot:</b> Terlampir (Tersimpan di Web)
` : "") + `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u26A1 <b>Equity Terkini:</b> <b>$${equityData.currentEquity.toFixed(2)}</b>
<i>Data otomatis tersinkronisasi ke Dashboard Web!</i>`;
      const doneKeyboard = [
        [Markup.button.callback("\u{1F4DD} Jurnal Trade Lagi", "cmd_start_journal"), Markup.button.callback("\u{1F4B0} Cek Saldo", "cmd_saldo")],
        [Markup.button.callback("\u{1F4CA} Hari Ini", "cmd_today"), Markup.button.callback("\u{1F4F1} Menu Utama", "cmd_menu")]
      ];
      if (ctx.callbackQuery) {
        await ctx.editMessageText(card, { parse_mode: "HTML", reply_markup: { inline_keyboard: doneKeyboard } }).catch(() => ctx.reply(card, { parse_mode: "HTML", reply_markup: { inline_keyboard: doneKeyboard } }));
      } else {
        await ctx.reply(card, { parse_mode: "HTML", reply_markup: { inline_keyboard: doneKeyboard } });
      }
    } catch (e) {
      console.error("completeInteractiveJournal error:", e);
      await ctx.reply("\u274C Terjadi kesalahan saat menyimpan trade.");
    }
  };
  const handleQuickTrade = async (ctx, forcedDirection) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      const rawText = (ctx.message?.text || "").trim();
      const tokens = rawText.split(/\s+/).slice(1);
      if (tokens.length === 0) {
        let helpMsg = `\u26A1 <b>FORMAT PENCATATAN TRADE CEPAT:</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Gunakan format 1 baris mudah:

1. <b>Shortcut /buy:</b>
   <code>/buy XAUUSD 0.10 +150 WIN FVG Breakout</code>
   <code>/buy EURUSD 0.05 +80</code> (Otomatis Win)

2. <b>Shortcut /sell:</b>
   <code>/sell BTCUSD 0.02 -50 LOSS Setup BoS</code>
   <code>/sell GBPUSD 0.10 -35</code> (Otomatis Loss)

3. <b>Perintah /quick:</b>
   <code>/quick XAUUSD BUY 0.10 2650 +200 WIN</code>
   <code>/quick EURUSD SELL 0.50 -100 LOSS</code>`;
        return ctx.reply(helpMsg, { parse_mode: "HTML" });
      }
      let pair = "XAUUSD";
      let direction = forcedDirection || "BUY";
      let lot = 0.01;
      let entry = 0;
      let sl = 0;
      let tp = 0;
      let pnl = 0;
      let result = "WIN";
      let parsedImage = null;
      const notesArr = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i].toUpperCase();
        if (tokens[i].startsWith("http://") || tokens[i].startsWith("https://")) {
          parsedImage = tokens[i];
          continue;
        }
        if (tokens[i].toLowerCase().startsWith("img=") || tokens[i].toLowerCase().startsWith("image=")) {
          parsedImage = tokens[i].split("=")[1];
          continue;
        }
        if (t === "BUY" || t === "LONG") {
          direction = "BUY";
          continue;
        }
        if (t === "SELL" || t === "SHORT") {
          direction = "SELL";
          continue;
        }
        if (t === "WIN" || t === "PROFIT") {
          result = "WIN";
          continue;
        }
        if (t === "LOSS" || t === "RUGI" || t === "MC") {
          result = "LOSS";
          continue;
        }
        if (t === "BE" || t === "BREAKEVEN") {
          result = "BE";
          pnl = 0;
          continue;
        }
        if (t === "RUNNING" || t === "OPEN" || t === "PENDING") {
          result = "Pending";
          pnl = 0;
          continue;
        }
        if (tokens[i].toLowerCase().startsWith("sl=")) {
          sl = parseFloat(tokens[i].slice(3)) || 0;
          continue;
        }
        if (tokens[i].toLowerCase().startsWith("tp=")) {
          tp = parseFloat(tokens[i].slice(3)) || 0;
          continue;
        }
        if (tokens[i].toLowerCase().startsWith("entry=")) {
          entry = parseFloat(tokens[i].slice(6)) || 0;
          continue;
        }
        if (/^[+-]\d+(\.\d+)?$/.test(tokens[i])) {
          pnl = parseFloat(tokens[i]);
          if (pnl < 0) result = "LOSS";
          else if (pnl > 0 && result !== "Pending") result = "WIN";
          continue;
        }
        if (/^[A-Z]{6}$/.test(t) || t === "GOLD" || t === "BTC" || t === "ETH" || t === "US30" || t === "NAS100") {
          pair = t === "GOLD" ? "XAUUSD" : t === "BTC" ? "BTCUSD" : t;
          continue;
        }
        const num = parseFloat(tokens[i]);
        if (!isNaN(num)) {
          if (num > 0 && num <= 100 && tokens[i].includes(".") && lot === 0.01) {
            lot = num;
            continue;
          }
          if (entry === 0 && num > 100) {
            entry = num;
            continue;
          }
          if (pnl === 0) {
            pnl = num;
            if (pnl < 0) result = "LOSS";
            continue;
          }
        }
        notesArr.push(tokens[i]);
      }
      if (pnl > 0 && result !== "Pending") result = "WIN";
      if (pnl < 0) result = "LOSS";
      const setupName = notesArr.length > 0 ? notesArr.join(" ") : "Quick Telegram Trade";
      const mode = user.current_mode || "backtest";
      const isWin = result === "WIN";
      const pips = calculatePips(pair, entry, tp, pnl, lot, isWin, user?.currency === "NANO");
      const ins = await db2.execute({
        sql: `INSERT INTO trades (
          user_id, pair, direction, setup_name, entry_price, sl, tp,
          account_balance, position_size, result, realized_pl, pips,
          anxiety_level, notes, image, image_url, has_image, run_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          user.id,
          pair,
          direction,
          setupName,
          entry,
          sl,
          tp,
          0,
          lot,
          result,
          pnl,
          pips,
          2,
          setupName,
          parsedImage || null,
          parsedImage || null,
          parsedImage ? 1 : 0,
          mode
        ]
      });
      const tradeId = ins.lastInsertRowid;
      const s = await getUserEquityData(user.id, user);
      const signPL = pnl >= 0 ? "+" : "";
      const signPips = pips >= 0 ? "+" : "";
      const msg = `\u26A1 <b>[QUICK TRADE RECORDED]</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F194} <b>ID:</b> #${tradeId} | \u{1F464} <b>Akun:</b> <code>${user.username}</code> (${mode})
\u{1F4C8} <b>Pair:</b> <b>${pair}</b> (${direction === "BUY" ? "\u{1F7E2} BUY" : "\u{1F534} SELL"})
\u{1F4E6} <b>Lot:</b> ${lot}
` + (entry > 0 ? `\u{1F3AF} <b>Entry:</b> ${entry}
` : "") + (sl > 0 ? `\u{1F6D1} <b>SL:</b> ${sl} | \u{1F3AF} <b>TP:</b> ${tp}
` : "") + `\u{1F3C6} <b>Status:</b> <b>${result}</b>
\u{1F4B5} <b>P/L Realized:</b> <b>${signPL}$${pnl.toFixed(2)}</b>
\u{1F4CF} <b>Pips:</b> <b>${signPips}${pips} Pips</b>
\u{1F3AF} <b>Setup:</b> ${setupName}
` + (parsedImage ? `\u{1F4F8} <b>Screenshot:</b> Terlampir (Bisa dilihat di web)
` : "") + `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u26A1 <b>Equity Baru:</b> <b>$${s.currentEquity.toFixed(2)}</b>`;
      const quickKeys = [
        [Markup.button.callback("\u{1F4DD} Jurnal Lagi", "cmd_start_journal"), Markup.button.callback("\u{1F4B0} Cek Saldo", "cmd_saldo")],
        [Markup.button.callback("\u21A9\uFE0F Hapus Trade Ini", "cmd_undo")]
      ];
      await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: quickKeys } });
    } catch (e) {
      console.error("Quick trade error:", e);
      await ctx.reply("\u274C Terjadi kesalahan saat mencatat quick trade.");
    }
  };
  bot2.command(["quick", "q"], (ctx) => handleQuickTrade(ctx));
  bot2.command("buy", (ctx) => handleQuickTrade(ctx, "BUY"));
  bot2.command("sell", (ctx) => handleQuickTrade(ctx, "SELL"));
  const handleRunningTrades = async (ctx) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      const openRes = await db2.execute({
        sql: "SELECT * FROM trades WHERE user_id = ? AND result = 'Pending' ORDER BY id DESC LIMIT 10",
        args: [user.id]
      });
      const openTrades = openRes.rows;
      if (openTrades.length === 0) {
        const noTradeMsg = `\u23F3 <b>TIDAK ADA TRADE BERJALAN</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Semua trade Anda telah ditutup / realized.

Untuk mencatat posisi baru yang sedang berjalan, gunakan:
<code>/quick [pair] [buy/sell] [lot] [entry] RUNNING</code>
Contoh: <code>/quick XAUUSD BUY 0.10 2650 RUNNING</code>`;
        if (ctx.callbackQuery) {
          return ctx.editMessageText(noTradeMsg, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [[{ text: "\u{1F519} Menu Utama", callback_data: "cmd_menu" }]] }
          }).catch(() => ctx.reply(noTradeMsg, { parse_mode: "HTML" }));
        }
        return ctx.reply(noTradeMsg, { parse_mode: "HTML" });
      }
      let msg = `\u23F3 <b>DAFTAR TRADE RUNNING / PENDING (${openTrades.length})</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <code>${user.username}</code>

`;
      const buttons = [];
      openTrades.forEach((t) => {
        msg += `\u2022 <b>#${t.id} ${t.pair}</b> (${t.direction}) | Lot: ${t.position_size || 0.01}
  Entry: ${t.entry_price || "-"} | SL: ${t.sl || "-"} | TP: ${t.tp || "-"}
  Setup: <i>${t.setup_name || "-"}</i>

`;
        buttons.push([
          Markup.button.callback(`\u2705 Tutup #${t.id} WIN`, `close_trade_${t.id}_WIN`),
          Markup.button.callback(`\u274C Tutup #${t.id} LOSS`, `close_trade_${t.id}_LOSS`)
        ]);
      });
      msg += `\u{1F4A1} <i>Klik tombol di atas atau ketik:</i>
<code>/close [id] [win/loss] [p/l]</code> (Contoh: <code>/close ${openTrades[0].id} win 120</code>)`;
      buttons.push([{ text: "\u{1F519} Menu Utama", callback_data: "cmd_menu" }]);
      if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } }).catch(() => ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } }));
      } else {
        await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      }
    } catch (e) {
      console.error(e);
      await ctx.reply("\u274C Terjadi kesalahan saat memuat trade running.");
    }
  };
  bot2.command(["running", "pending", "open"], handleRunningTrades);
  bot2.action(/close_trade_(\d+)_(WIN|LOSS)/, async (ctx) => {
    const tradeId = parseInt(ctx.match[1], 10);
    const result = ctx.match[2];
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);
    if (!user) return ctx.reply("\u274C Akun belum terhubung.");
    const promptText = `Ketik nominal P/L penutupan untuk trade <b>#${tradeId}</b> (${result}):
Ketik perintah: <code>/close ${tradeId} ${result.toLowerCase()} [nominal_dollar]</code>
Contoh: <code>/close ${tradeId} ${result.toLowerCase()} ${result === "WIN" ? "150" : "-50"}</code>`;
    await ctx.reply(promptText, { parse_mode: "HTML" });
  });
  bot2.command("close", async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 4) {
        return ctx.reply(
          `\u274C <b>Format Salah</b>
Gunakan: <code>/close [id] [win/loss/be] [pnl]</code>
Contoh untung: <code>/close 15 win 125.50</code>
Contoh rugi: <code>/close 15 loss -40</code>`,
          { parse_mode: "HTML" }
        );
      }
      const tradeId = parseInt(parts[1], 10);
      const resStatus = parts[2].toUpperCase();
      let pnl = parseFloat(parts[3]) || 0;
      if (resStatus === "LOSS" && pnl > 0) pnl = -pnl;
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      const tradeRes = await db2.execute({
        sql: "SELECT * FROM trades WHERE id = ? AND user_id = ?",
        args: [tradeId, user.id]
      });
      if (tradeRes.rows.length === 0) {
        return ctx.reply(`\u274C Trade #${tradeId} tidak ditemukan.`);
      }
      const trade = tradeRes.rows[0];
      const isWin = resStatus === "WIN";
      const pips = calculatePips(trade.pair, trade.entry_price || 0, trade.tp || 0, pnl, trade.position_size || 0.01, isWin, user?.currency === "NANO");
      await db2.execute({
        sql: "UPDATE trades SET result = ?, realized_pl = ?, pips = ? WHERE id = ?",
        args: [resStatus, pnl, pips, tradeId]
      });
      const s = await getUserEquityData(user.id, user);
      const sign = pnl >= 0 ? "+" : "";
      const msg = `\u2705 <b>[TRADE #${tradeId} DITUTUP]</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4C8} Pair: <b>${trade.pair}</b> (${trade.direction})
\u{1F3C6} Status: <b>${resStatus}</b>
\u{1F4B5} Realized P/L: <b>${sign}$${pnl.toFixed(2)}</b>
\u{1F4CF} Pips: <b>${pips} Pips</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u26A1 Equity Terkini: <b>$${s.currentEquity.toFixed(2)}</b>`;
      await ctx.reply(msg, { parse_mode: "HTML" });
    } catch (e) {
      console.error(e);
      await ctx.reply("\u274C Gagal menutup trade.");
    }
  });
  const handleSaldo = async (ctx) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      const s = await getUserEquityData(user.id, user);
      const signPL = s.totalPL >= 0 ? "+" : "";
      const isCent = user.currency === "USC" || user.currency === "NANO";
      const sym = isCent ? "\xA2" : user.currency === "IDR" ? "Rp " : "$";
      const isNano = user.currency === "NANO";
      const typeLabel = isNano ? "Nano (1\xA2/lot)" : isCent ? "Cent (10\xA2/lot)" : "Standard ($10/lot)";
      let msg = `\u{1F4B0} <b>RINGKASAN SALDO & EQUITY TRADING</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} <b>Akun:</b> <code>${user.username}</code>
\u{1F3F7}\uFE0F <b>Tipe:</b> <code>${typeLabel}</code> | <b>Mode:</b> <code>${user.current_mode || "backtest"}</code>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4B5} <b>Modal Awal:</b> ${sym}${s.initialBal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
\u{1F4E5} <b>Total Deposit:</b> +${sym}${s.totalDeposit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
\u{1F4E4} <b>Total Penarikan (WD):</b> -${sym}${s.totalWithdraw.toLocaleString("en-US", { minimumFractionDigits: 2 })}
\u{1F4CA} <b>Net Realized P/L:</b> <b>${signPL}${sym}${s.totalPL.toLocaleString("en-US", { minimumFractionDigits: 2 })}</b>
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\u26A1 <b>CURRENT EQUITY:</b> <b>${sym}${s.currentEquity.toLocaleString("en-US", { minimumFractionDigits: 2 })}</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F3AF} <b>Performa Trading:</b>
\u2022 Win Rate: <b>${s.winRate}%</b> (${s.tradesCount} total trades)
\u2022 Akumulasi Pips: <b>${s.totalPips >= 0 ? "+" : ""}${s.totalPips} Pips</b>
\u2022 Sisa Buffer Drawdown Hari Ini: <b>${sym}${s.ddRemaining.toFixed(2)}</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
<i>\u{1F4A1} Gunakan <code>/setmodal [jumlah]</code> untuk mengubah modal awal akun.</i>`;
      const buttons = [
        [Markup.button.callback("\u{1F4DD} Jurnal Trade Baru", "cmd_start_journal"), Markup.button.callback("\u{1F4CA} Hari Ini", "cmd_today")],
        [Markup.button.callback("\u{1F4B0} Ubah Modal (/setmodal)", "cmd_setmodal"), Markup.button.callback("\u{1F9EE} Hitung Lot (/lot)", "cmd_lot")],
        [Markup.button.callback("\u{1F519} Menu Utama", "cmd_menu")]
      ];
      await sendOrEdit(ctx, msg, false, buttons);
    } catch (e) {
      console.error(e);
      await ctx.reply("Terjadi kesalahan saat memuat saldo.");
    }
  };
  bot2.command(["saldo", "balance"], handleSaldo);
  bot2.action("cmd_saldo", handleSaldo);
  const getStatsByTimeframe = async (ctx, timeframe) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      const s = await getUserEquityData(user.id, user);
      const tradesRes = await db2.execute({
        sql: "SELECT * FROM trades WHERE user_id = ? AND result != 'Pending' ORDER BY created_at ASC",
        args: [user.id]
      });
      const allTrades = tradesRes.rows;
      const now = /* @__PURE__ */ new Date();
      let label = "HARI INI";
      let filteredTrades = allTrades;
      if (timeframe === "today") {
        label = "HARI INI";
        const todayStr = now.toISOString().split("T")[0];
        filteredTrades = allTrades.filter((t) => {
          let d = t.created_at || "";
          if (!d.includes("Z")) d += "Z";
          try {
            return new Date(d).toISOString().split("T")[0] === todayStr;
          } catch (e) {
            return false;
          }
        });
      } else if (timeframe === "weekly") {
        label = "7 HARI TERAKHIR";
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
        filteredTrades = allTrades.filter((t) => {
          let d = t.created_at || "";
          if (!d.includes("Z")) d += "Z";
          try {
            return new Date(d) >= sevenDaysAgo;
          } catch (e) {
            return false;
          }
        });
      } else if (timeframe === "monthly") {
        label = "BULAN INI";
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        filteredTrades = allTrades.filter((t) => {
          let d = t.created_at || "";
          if (!d.includes("Z")) d += "Z";
          try {
            const tDate = new Date(d);
            return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
          } catch (e) {
            return false;
          }
        });
      }
      let totalPL = 0;
      let wins = 0;
      let losses = 0;
      let grossProfit = 0;
      let grossLoss = 0;
      filteredTrades.forEach((t) => {
        const pl = t.realized_pl || 0;
        totalPL += pl;
        if ((t.result || "").toUpperCase() === "WIN") {
          wins++;
          grossProfit += Math.max(0, pl);
        } else if ((t.result || "").toUpperCase() === "LOSS") {
          losses++;
          grossLoss += Math.abs(Math.min(0, pl));
        }
      });
      const winRate = filteredTrades.length > 0 ? (wins / filteredTrades.length * 100).toFixed(1) : "0.0";
      const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? "MAX" : "0.00";
      const signPL = totalPL >= 0 ? "+" : "";
      const msg = `\u{1F4CA} <b>RINGKASAN PERFORMA: ${label}</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} <b>Akun:</b> <code>${user.username}</code>
\u{1F4E6} <b>Total Trades:</b> <b>${filteredTrades.length}</b> (Menang: ${wins} | Kalah: ${losses})
\u{1F3AF} <b>Win Rate:</b> <b>${winRate}%</b>
\u2696\uFE0F <b>Profit Factor:</b> <b>${profitFactor}</b>
\u{1F4B5} <b>Net Realized P/L:</b> <b>${signPL}$${totalPL.toFixed(2)}</b>
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\u26A1 <b>Equity Terkini:</b> <b>$${s.currentEquity.toFixed(2)}</b>`;
      const buttons = [
        [Markup.button.callback("\u{1F4CA} Hari Ini", "cmd_today"), Markup.button.callback("\u{1F4C8} 7 Hari", "cmd_weekly")],
        [Markup.button.callback("\u{1F4DD} Jurnal Trade Baru", "cmd_start_journal"), Markup.button.callback("\u{1F519} Menu", "cmd_menu")]
      ];
      await sendOrEdit(ctx, msg, false, buttons);
    } catch (e) {
      console.error(e);
      await ctx.reply("Terjadi kesalahan saat memuat statistik.");
    }
  };
  bot2.command("today", (ctx) => getStatsByTimeframe(ctx, "today"));
  bot2.command("weekly", (ctx) => getStatsByTimeframe(ctx, "weekly"));
  bot2.command("monthly", (ctx) => getStatsByTimeframe(ctx, "monthly"));
  bot2.command("stats", (ctx) => getStatsByTimeframe(ctx, "all"));
  bot2.action("cmd_today", (ctx) => getStatsByTimeframe(ctx, "today"));
  bot2.action("cmd_weekly", (ctx) => getStatsByTimeframe(ctx, "weekly"));
  const handleLotCalc = async (ctx) => {
    try {
      const parts = (ctx.message?.text || "").trim().split(/\s+/);
      const customPips = parts.length > 1 ? parseFloat(parts[1]) : null;
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      const eq = user ? (await getUserEquityData(user.id, user)).currentEquity : 1e3;
      const userRisk = user && user.default_risk !== void 0 && user.default_risk !== null && !isNaN(Number(user.default_risk)) ? Number(user.default_risk) : 2.5;
      const isNano = user?.currency === "NANO";
      const isCent = user?.currency === "USC";
      const pipMultiplier = isNano ? 1 : 10;
      const unitSym = isNano ? "\xA2" : isCent ? "\xA2" : "$";
      const accountTypeName = isNano ? "Nano (1 pip = 1\xA2/lot)" : isCent ? "Cent (1 pip = 10\xA2/lot)" : "Standard (1 pip = $10/lot)";
      const userRiskNominal = eq * (userRisk / 100);
      let msg = `\u{1F9EE} <b>KALKULATOR LOT & RISK MANAGEMENT</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <b>${user?.username || "Trader"}</b>
\u{1F3F7}\uFE0F Tipe Akun: <b>${accountTypeName}</b>
\u{1F4B0} Equity: <b>${unitSym}${eq.toFixed(2)}</b>
\u{1F6E1}\uFE0F Setting Risiko: <b>${userRisk}%</b> (Ganti: <code>/setrisk</code>)
\u{1F4A1} Pip Value: <b>${isNano ? "1\xA2 ($0.01)" : isCent ? "10\xA2 ($0.10)" : "$10.00"} / 1.00 Lot</b>

`;
      if (customPips && customPips > 0) {
        const userLot = userRiskNominal / (customPips * pipMultiplier);
        const risk1Lot = eq * 0.01 / (customPips * pipMultiplier);
        const risk2Lot = eq * 0.02 / (customPips * pipMultiplier);
        msg += `\u{1F3AF} <b>Stop Loss: ${customPips} Pips</b>
\u2B50 <b>Rekomendasi Anda (${userRisk}% = ${unitSym}${userRiskNominal.toFixed(2)}):</b> \u27A1\uFE0F <b>${userLot.toFixed(2)} Lot</b>

<i>Perbandingan toleransi risiko lain:</i>
\u2022 Risk 1.0% (${unitSym}${(eq * 0.01).toFixed(2)}) \u27A1\uFE0F <b>${risk1Lot.toFixed(2)} Lot</b>
\u2022 Risk 2.0% (${unitSym}${(eq * 0.02).toFixed(2)}) \u27A1\uFE0F <b>${risk2Lot.toFixed(2)} Lot</b>

<i>Formula: Lot = Nominal Risk / (SL Pips \xD7 ${pipMultiplier})</i>
<i>(0.04 Lot \xD7 100 Pips = ${isNano ? "4\xA2" : isCent ? "40\xA2" : "$40"})</i>`;
      } else {
        msg += `\u{1F6E1}\uFE0F <b>Rekomendasi Lot (Setting Risiko ${userRisk}% = ${unitSym}${userRiskNominal.toFixed(2)}):</b>
\u2022 SL 15 pips \u27A1\uFE0F <b>${(userRiskNominal / (15 * pipMultiplier)).toFixed(2)} Lot</b>
\u2022 SL 20 pips \u27A1\uFE0F <b>${(userRiskNominal / (20 * pipMultiplier)).toFixed(2)} Lot</b>
\u2022 SL 25 pips \u27A1\uFE0F <b>${(userRiskNominal / (25 * pipMultiplier)).toFixed(2)} Lot</b>
\u2022 SL 30 pips \u27A1\uFE0F <b>${(userRiskNominal / (30 * pipMultiplier)).toFixed(2)} Lot</b>
\u2022 SL 40 pips \u27A1\uFE0F <b>${(userRiskNominal / (40 * pipMultiplier)).toFixed(2)} Lot</b>
\u2022 SL 50 pips \u27A1\uFE0F <b>${(userRiskNominal / (50 * pipMultiplier)).toFixed(2)} Lot</b>

<i>\u{1F4A1} Ketik <code>/lot [pips]</code> untuk menghitung SL spesifik (cth: <code>/lot 25</code>).
Ketik <code>/setrisk [persen]</code> untuk mengatur persentase risiko.
Ketik <code>/setaccount [nano/cent/standard]</code> untuk ganti tipe akun.</i>`;
      }
      const buttons = [
        [
          { text: isNano ? "\u2705 Nano (1\xA2)" : "Ganti ke Nano (1\xA2)", callback_data: "cmd_set_account_nano" },
          { text: isCent ? "\u2705 Cent (10\xA2)" : "Ganti ke Cent (10\xA2)", callback_data: "cmd_set_account_cent" },
          { text: !isNano && !isCent ? "\u2705 Standard ($10)" : "Ganti Standard ($10)", callback_data: "cmd_set_account_standard" }
        ],
        [
          { text: "\u{1F6E1}\uFE0F Atur Risiko (/setrisk)", callback_data: "cmd_setrisk" },
          { text: "\u{1F4F1} Menu Utama", callback_data: "cmd_menu" }
        ]
      ];
      await sendOrEdit(ctx, msg, false, buttons);
    } catch (e) {
      console.error(e);
      await ctx.reply("Terjadi kesalahan kalkulator lot.");
    }
  };
  bot2.command("lot", handleLotCalc);
  bot2.action("cmd_lot", handleLotCalc);
  const handleSetAccount = async (ctx, targetType) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) {
        return ctx.reply("\u26A0\uFE0F Akun belum terhubung. Gunakan <code>/link [username]</code> terlebih dahulu.", { parse_mode: "HTML" });
      }
      let chosen = targetType;
      if (!chosen) {
        const text = (ctx.message?.text || "").trim().toLowerCase();
        const parts = text.split(/\s+/);
        if (parts.length > 1) {
          const arg = parts[1];
          if (arg.includes("nano")) chosen = "NANO";
          else if (arg.includes("cent") || arg.includes("usc")) chosen = "USC";
          else if (arg.includes("usd") || arg.includes("standard")) chosen = "USD";
        }
      }
      if (chosen && ["NANO", "USC", "USD"].includes(chosen)) {
        await ensureTables();
        await db2.execute({
          sql: "UPDATE users SET currency = ? WHERE id = ?",
          args: [chosen, user.id]
        });
        user.currency = chosen;
        const isNano = chosen === "NANO";
        const isCent = chosen === "USC";
        const label = isNano ? "Nano (1 pip = 1\xA2 | 0.04 lot 100 pips = 4\xA2)" : isCent ? "Cent (1 pip = 10\xA2 | 0.04 lot 100 pips = 40\xA2)" : "Standard (1 pip = $10 | 0.04 lot 100 pips = $40)";
        const successMsg = `\u{1F3F7}\uFE0F <b>TIPE AKUN BERHASIL DIPERBARUI!</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <b>${user.username}</b>
\u26A1 Tipe Baru: <b>${label}</b>

\u{1F4A1} <i>Kini kalkulasi lot <code>/lot</code> dan penghitungan pips trade otomatis menggunakan multiplier akun ${chosen}!</i>`;
        const btns2 = [
          [{ text: "\u{1F9EE} Hitung Lot Sekarang", callback_data: "cmd_lot" }],
          [{ text: "\u{1F4F1} Buka Menu Utama", callback_data: "cmd_menu" }]
        ];
        return sendOrEdit(ctx, successMsg, false, btns2);
      }
      const current = user.currency || "USD";
      const currentLabel = current === "NANO" ? "Nano (1\xA2/lot)" : current === "USC" ? "Cent (10\xA2/lot)" : "Standard ($10/lot)";
      const msg = `\u{1F3F7}\uFE0F <b>PILIH TIPE AKUN TRADING</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <b>${user.username}</b>
Status Saat Ini: <b>${currentLabel}</b>

Pilih tipe akun Anda di bawah ini agar rumus lot & pips akurat:
\u2022 <b>Standard (USD):</b> 1 lot = $10/pip | 0.04 lot 100 pips = $40.00
\u2022 <b>Cent (USC):</b> 1 lot = 10\xA2/pip | 0.04 lot 100 pips = 40\xA2
\u2022 <b>Nano:</b> 1 lot = 1\xA2/pip | 0.04 lot 100 pips = 4\xA2

<i>Atau ketik <code>/setaccount nano</code>, <code>/setaccount cent</code>, atau <code>/setaccount standard</code></i>`;
      const btns = [
        [
          { text: current === "NANO" ? "\u2705 Nano (1\xA2)" : "Nano (1\xA2)", callback_data: "cmd_set_account_nano" },
          { text: current === "USC" ? "\u2705 Cent (10\xA2)" : "Cent (10\xA2)", callback_data: "cmd_set_account_cent" },
          { text: current !== "NANO" && current !== "USC" ? "\u2705 Standard ($10)" : "Standard ($10)", callback_data: "cmd_set_account_standard" }
        ],
        [{ text: "\u{1F4F1} Kembali ke Menu", callback_data: "cmd_menu" }]
      ];
      return sendOrEdit(ctx, msg, false, btns);
    } catch (e) {
      console.error(e);
      await ctx.reply("Terjadi kesalahan saat mengatur tipe akun.");
    }
  };
  bot2.command("setaccount", (ctx) => handleSetAccount(ctx));
  bot2.command("accounttype", (ctx) => handleSetAccount(ctx));
  bot2.action("cmd_setaccount", (ctx) => handleSetAccount(ctx));
  bot2.action("cmd_set_account_nano", (ctx) => handleSetAccount(ctx, "NANO"));
  bot2.action("cmd_set_account_cent", (ctx) => handleSetAccount(ctx, "USC"));
  bot2.action("cmd_set_account_standard", (ctx) => handleSetAccount(ctx, "USD"));
  const handleSetRisk = async (ctx, customValue) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) {
        return ctx.reply("\u26A0\uFE0F Akun belum terhubung. Gunakan <code>/link [username]</code> terlebih dahulu.", { parse_mode: "HTML" });
      }
      let targetRisk = customValue;
      if (targetRisk === void 0) {
        const text = (ctx.message?.text || "").trim();
        const parts = text.split(/\s+/);
        if (parts.length > 1) {
          const parsed = parseFloat(parts[1].replace("%", ""));
          if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
            targetRisk = parsed;
          }
        }
      }
      if (targetRisk !== void 0 && !isNaN(targetRisk) && targetRisk > 0 && targetRisk <= 50) {
        await ensureTables();
        await db2.execute({
          sql: "UPDATE users SET default_risk = ? WHERE id = ?",
          args: [targetRisk, user.id]
        });
        user.default_risk = targetRisk;
        const equityData2 = await getUserEquityData(user.id, user);
        const eq2 = equityData2.currentEquity;
        const nominalRisk = eq2 * targetRisk / 100;
        const successMsg = `\u{1F6E1}\uFE0F <b>TOLERANSI RISIKO DIPERBARUI!</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <b>${user.username}</b>
\u26A1 Risiko Baru: <b>${targetRisk}% per trade</b>
\u{1F4B0} Nominal Risiko (Equity $${eq2.toFixed(2)}): <b>$${nominalRisk.toFixed(2)}</b>

\u{1F4A1} <i>Kini setiap kalkulasi <code>/lot</code> dan rekomendasi posisi otomatis menggunakan acuan <b>${targetRisk}%</b> modal Anda.</i>`;
        const customButtons2 = [
          [{ text: "\u{1F9EE} Hitung Lot Sekarang", callback_data: "cmd_lot" }],
          [{ text: "\u{1F4F1} Buka Menu Utama", callback_data: "cmd_menu" }]
        ];
        return sendOrEdit(ctx, successMsg, false, customButtons2);
      }
      const currentRisk = user.default_risk !== void 0 && user.default_risk !== null && !isNaN(Number(user.default_risk)) ? Number(user.default_risk) : 2.5;
      const equityData = await getUserEquityData(user.id, user);
      const eq = equityData.currentEquity;
      const nominalCurrent = eq * currentRisk / 100;
      const msg = `\u{1F6E1}\uFE0F <b>PENGATURAN TOLERANSI RISIKO (/setrisk)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <b>${user.username}</b>
\u{1F3AF} Toleransi Saat Ini: <b>${currentRisk}% per trade</b>
\u{1F4B5} Maksimal Loss per Trade: <b>$${nominalCurrent.toFixed(2)}</b> (Equity: $${eq.toFixed(2)})

Pilih persentase risiko cepat di bawah, atau ketik langsung:
<code>/setrisk [persen]</code> (contoh: <code>/setrisk 1.5</code>)`;
      const customButtons = [
        [
          { text: "\u{1F6E1}\uFE0F 0.5% (Sangat Aman)", callback_data: "setrisk_0.5" },
          { text: "\u{1F6E1}\uFE0F 1.0% (Konservatif)", callback_data: "setrisk_1.0" }
        ],
        [
          { text: "\u{1F6E1}\uFE0F 1.5% (Disiplin)", callback_data: "setrisk_1.5" },
          { text: "\u{1F6E1}\uFE0F 2.0% (Standar Forex)", callback_data: "setrisk_2.0" }
        ],
        [
          { text: "\u{1F6E1}\uFE0F 2.5% (Agresif Terukur)", callback_data: "setrisk_2.5" },
          { text: "\u{1F6E1}\uFE0F 3.0% (Maksimal)", callback_data: "setrisk_3.0" }
        ]
      ];
      await sendOrEdit(ctx, msg, true, customButtons);
    } catch (e) {
      console.error("handleSetRisk error:", e);
      await ctx.reply("Terjadi kesalahan saat mengatur toleransi risiko.");
    }
  };
  bot2.command("setrisk", (ctx) => handleSetRisk(ctx));
  bot2.action("cmd_setrisk_menu", (ctx) => handleSetRisk(ctx));
  bot2.action(/^setrisk_(\d+(?:\.\d+)?)$/, async (ctx) => {
    const val = parseFloat(ctx.match[1]);
    await handleSetRisk(ctx, val);
  });
  const handleNews = async (ctx, filterMode = "high") => {
    try {
      const text = (ctx.message?.text || "").trim();
      const parts = text.split(/\s+/);
      let mode = filterMode;
      if (parts.length > 1) {
        const arg = parts[1].toLowerCase();
        if (arg === "today" || arg === "hariini") mode = "today";
        else if (arg === "usd" || arg === "gold" || arg === "xau") mode = "usd";
        else if (arg === "all" || arg === "semua") mode = "all";
        else if (arg === "high") mode = "high";
      }
      const allEvents = await fetchForexNews(filterMode === "all");
      if (!allEvents || allEvents.length === 0) {
        const fallbackMsg = `\u{1F4F0} <b>KALENDER FOREX & JADWAL SESI TRADING</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u26A0\uFE0F <i>Data kalender eksternal sedang dalam pembaruan. Jadwal Sesi Utama (WIB):</i>

\u{1F30F} <b>Sesi Tokyo (Asia):</b> 07:00 - 16:00 WIB
\u{1F1EC}\u{1F1E7} <b>Sesi London (Eropa):</b> 14:00 - 23:00 WIB
\u{1F1FA}\u{1F1F8} <b>Sesi New York (US):</b> 19:00 - 04:00 WIB

\u{1F525} <i>Waktu Overlap Volatilitas Tertinggi: 19:00 - 23:00 WIB</i>`;
        return sendOrEdit(ctx, fallbackMsg, true);
      }
      const now = /* @__PURE__ */ new Date();
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
      let filtered = allEvents.filter((ev) => {
        const evDate = new Date(ev.date);
        const evDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(evDate);
        if (mode === "today") {
          return evDateStr === todayStr && (ev.impact === "High" || ev.impact === "Medium");
        } else if (mode === "usd") {
          return ev.country.toUpperCase() === "USD" && (ev.impact === "High" || ev.impact === "Medium");
        } else if (mode === "all") {
          return true;
        } else {
          return ev.impact === "High";
        }
      });
      let fallbackNote = "";
      if (filtered.length === 0) {
        if (mode === "today") {
          fallbackNote = "<i>(Event High/Med hari ini sudah selesai atau libur. Menampilkan High-Impact terdekat:)</i>\n";
          filtered = allEvents.filter((ev) => ev.impact === "High").slice(0, 7);
        } else {
          filtered = allEvents.slice(0, 8);
        }
      }
      const displayEvents = filtered.slice(0, 8);
      const modeTitle = mode === "today" ? "\u{1F4C5} HARI INI" : mode === "usd" ? "\u{1F1FA}\u{1F1F8} USD & GOLD IMPACT" : mode === "all" ? "\u{1F310} SEMUA BERITA" : "\u{1F525} HIGH IMPACT ONLY";
      let msg = `\u{1F4F0} <b>KALENDER FOREX & ECONOMIC NEWS</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Filter: <b>${modeTitle}</b> | Waktu: <b>WIB (UTC+7)</b>
` + (fallbackNote ? `${fallbackNote}
` : "\n");
      displayEvents.forEach((item) => {
        const evDate = new Date(item.date);
        const dateStr = evDate.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
        const timeStr = evDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":");
        const flag = getCurrencyFlag(item.country);
        const badge = getNewsImpactBadge(item.impact);
        msg += `\u{1F4C5} <b>${dateStr}</b> - <b>${timeStr} WIB</b>
${flag} <b>${item.country}</b> | ${badge}
\u{1F4CC} <b>${item.title}</b>
`;
        if (item.forecast || item.previous) {
          msg += `   <i>Forecast: ${item.forecast || "-"} | Prev: ${item.previous || "-"}</i>
`;
        }
        msg += `
`;
      });
      msg += `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
<i>\u26A0\uFE0F Waspadai lonjakan spread & slippage menjelang berita High Impact dirilis!</i>`;
      const customButtons = [
        [
          { text: "\u{1F525} High Impact", callback_data: "news_high" },
          { text: "\u{1F4C5} Hari Ini", callback_data: "news_today" }
        ],
        [
          { text: "\u{1F1FA}\u{1F1F8} USD Saja (Gold)", callback_data: "news_usd" },
          { text: "\u{1F310} Semua Berita", callback_data: "news_all" }
        ],
        [
          { text: "\u{1F504} Refresh News", callback_data: "news_refresh" }
        ]
      ];
      await sendOrEdit(ctx, msg, true, customButtons);
    } catch (err) {
      console.error("handleNews error:", err);
      await ctx.reply("Terjadi kesalahan memuat berita forex.");
    }
  };
  bot2.command("news", (ctx) => handleNews(ctx, "high"));
  bot2.action("cmd_news", (ctx) => handleNews(ctx, "high"));
  bot2.action("news_high", (ctx) => handleNews(ctx, "high"));
  bot2.action("news_today", (ctx) => handleNews(ctx, "today"));
  bot2.action("news_usd", (ctx) => handleNews(ctx, "usd"));
  bot2.action("news_all", (ctx) => handleNews(ctx, "all"));
  bot2.action("news_refresh", async (ctx) => {
    cachedNews = null;
    await handleNews(ctx, "high");
  });
  bot2.command(["deposit", "topup"], async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 2) {
        return ctx.reply("\u274C Format salah.\nGunakan: <code>/deposit [jumlah]</code>\nContoh: <code>/deposit 500</code>", { parse_mode: "HTML" });
      }
      const amount = parseFloat(parts[1].replace(/,/g, ""));
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply("\u274C Jumlah nominal harus lebih dari 0.");
      }
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      await db2.execute({
        sql: "INSERT INTO transactions (user_id, type, amount) VALUES (?, 'deposit', ?)",
        args: [user.id, amount]
      });
      const s = await getUserEquityData(user.id, user);
      const msg = `\u{1F4E5} <b>[DEPOSIT BERHASIL DICATAT]</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4B5} Jumlah: <b>+$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</b>
\u{1F464} Akun: <code>${user.username}</code>
\u26A1 Equity Baru: <b>$${s.currentEquity.toFixed(2)}</b>
\u2705 Data otomatis tersinkron ke dashboard web.`;
      await ctx.reply(msg, { parse_mode: "HTML" });
    } catch (e) {
      console.error(e);
      await ctx.reply("\u274C Gagal memproses deposit.");
    }
  });
  bot2.command(["wd", "withdraw"], async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 2) {
        return ctx.reply("\u274C Format salah.\nGunakan: <code>/wd [jumlah]</code>\nContoh: <code>/wd 200</code>", { parse_mode: "HTML" });
      }
      const amount = parseFloat(parts[1].replace(/,/g, ""));
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply("\u274C Jumlah nominal harus lebih dari 0.");
      }
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      await db2.execute({
        sql: "INSERT INTO transactions (user_id, type, amount) VALUES (?, 'withdrawal', ?)",
        args: [user.id, amount]
      });
      const s = await getUserEquityData(user.id, user);
      const msg = `\u{1F4E4} <b>[PENARIKAN (WD) BERHASIL DICATAT]</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4B8} Jumlah: <b>-$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</b>
\u{1F464} Akun: <code>${user.username}</code>
\u26A1 Sisa Equity: <b>$${s.currentEquity.toFixed(2)}</b>
\u2705 Data otomatis tersinkron ke dashboard web.`;
      await ctx.reply(msg, { parse_mode: "HTML" });
    } catch (e) {
      console.error(e);
      await ctx.reply("\u274C Gagal memproses penarikan saldo.");
    }
  });
  const handleSetModal = async (ctx, presetAmount) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      let amount = presetAmount;
      if (amount === void 0) {
        const text = (ctx.message?.text || "").trim();
        const parts = text.split(/\s+/);
        if (parts.length > 1) {
          const parsed = parseFloat(parts[1].replace(/,/g, ""));
          if (!isNaN(parsed) && parsed > 0) {
            amount = parsed;
          }
        }
      }
      const isCent = user.currency === "USC" || user.currency === "NANO";
      const sym = isCent ? "\xA2" : user.currency === "IDR" ? "Rp " : "$";
      if (amount !== void 0 && !isNaN(amount) && amount > 0) {
        if (user.prop_firm_enabled) {
          await db2.execute({
            sql: "UPDATE users SET prop_firm_balance = ? WHERE id = ?",
            args: [amount, user.id]
          });
          user.prop_firm_balance = amount;
        } else {
          await db2.execute({
            sql: "UPDATE users SET initial_balance = ? WHERE id = ?",
            args: [amount, user.id]
          });
          user.initial_balance = amount;
        }
        const s2 = await getUserEquityData(user.id, user);
        const msg2 = `\u{1F3AF} <b>[MODAL AWAL BERHASIL DIPERBARUI]</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <code>${user.username}</code>
\u{1F4B0} Modal Baru: <b>${sym}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
\u26A1 Current Equity: <b>${sym}${s2.currentEquity.toFixed(2)}</b>

\u{1F4A1} <i>Kini kalkulasi drawdown, performa akun, dan kalkulator <code>/lot</code> menggunakan modal awal ini.</i>`;
        const btns = [
          [{ text: "\u{1F4B0} Cek Saldo & Equity", callback_data: "cmd_saldo" }],
          [{ text: "\u{1F9EE} Hitung Lot (/lot)", callback_data: "cmd_lot" }],
          [{ text: "\u{1F4F1} Menu Utama", callback_data: "cmd_menu" }]
        ];
        return sendOrEdit(ctx, msg2, false, btns);
      }
      const currentInitial = user.prop_firm_enabled ? user.prop_firm_balance || 1e3 : user.initial_balance || 1e4;
      const s = await getUserEquityData(user.id, user);
      const msg = `\u{1F4B0} <b>ATUR MODAL AWAL AKUN (/setmodal)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <code>${user.username}</code>
\u{1F4B5} Modal Awal Saat Ini: <b>${sym}${Number(currentInitial).toLocaleString("en-US", { minimumFractionDigits: 2 })}</b>
\u26A1 Current Equity: <b>${sym}${s.currentEquity.toFixed(2)}</b>

Pilih nominal modal awal cepat di bawah atau ketik:
<code>/setmodal [jumlah]</code>

<i>Contoh:</i>
\u2022 <code>/setmodal 10000</code>
\u2022 <code>/setmodal 5000</code>
\u2022 <code>/setmodal 100</code>`;
      const presets = isCent ? [1e3, 5e3, 1e4, 5e4, 1e5, 5e5] : [500, 1e3, 5e3, 1e4, 25e3, 5e4, 1e5, 2e5];
      const presetRows = [];
      let currentRow = [];
      presets.forEach((val) => {
        const label = `${sym}${val >= 1e3 ? `${val / 1e3}k` : val}`;
        currentRow.push(Markup.button.callback(label, `cmd_setmodal_${val}`));
        if (currentRow.length === 3) {
          presetRows.push(currentRow);
          currentRow = [];
        }
      });
      if (currentRow.length > 0) presetRows.push(currentRow);
      presetRows.push([Markup.button.callback("\u{1F4F1} Kembali ke Menu", "cmd_menu")]);
      return sendOrEdit(ctx, msg, false, presetRows);
    } catch (e) {
      console.error(e);
      await ctx.reply("\u274C Gagal mengubah modal awal.");
    }
  };
  bot2.command(["setmodal", "setbalance", "setsaldo"], (ctx) => handleSetModal(ctx));
  bot2.action("cmd_setmodal", (ctx) => handleSetModal(ctx));
  bot2.action(/^cmd_setmodal_(\d+)$/, (ctx) => {
    const val = parseFloat(ctx.match[1]);
    return handleSetModal(ctx, val);
  });
  const handleUndo = async (ctx) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      const lastTradeRes = await db2.execute({
        sql: "SELECT id, pair, direction, realized_pl, result FROM trades WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        args: [user.id]
      });
      if (lastTradeRes.rows.length === 0) {
        return ctx.reply("\u274C Belum ada trade yang dapat dihapus.");
      }
      const trade = lastTradeRes.rows[0];
      await db2.execute({
        sql: "DELETE FROM trades WHERE id = ?",
        args: [trade.id]
      });
      const s = await getUserEquityData(user.id, user);
      const msg = `\u21A9\uFE0F <b>TRADE TERAKHIR BERHASIL DIHAPUS</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
ID: #${trade.id} | Pair: ${trade.pair} (${trade.direction})
P/L Dibatalkan: $${trade.realized_pl}
\u26A1 Equity Dipulihkan: <b>$${s.currentEquity.toFixed(2)}</b>`;
      await sendOrEdit(ctx, msg, true);
    } catch (e) {
      console.error(e);
      await ctx.reply("\u274C Gagal menghapus trade.");
    }
  };
  bot2.command("undo", handleUndo);
  bot2.action("cmd_undo", handleUndo);
  const handleAccounts = async (ctx) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;
      const activeUser = await getActiveUser(telegramId, ctx.from?.username);
      const accountsRes = await db2.execute({
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
      let msg = `\u{1F465} <b>DAFTAR AKUN TRADING TERHUBUNG</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`;
      const switchButtons = [];
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const isActive = activeUser && activeUser.id === acc.id;
        const s = await getUserEquityData(acc.id, acc);
        const marker = isActive ? "\u{1F7E2} [AKTIF]" : "\u26AA";
        msg += `${i + 1}. ${marker} <b>${acc.username}</b>
   \u2022 Mode: <code>${acc.current_mode || "backtest"}</code> | Equity: <b>$${s.currentEquity.toFixed(2)}</b>
   \u2022 Net P/L: <b>$${s.totalPL >= 0 ? "+" : ""}${s.totalPL.toFixed(2)}</b> | Total: ${s.tradesCount} trades

`;
        if (!isActive) {
          switchButtons.push([Markup.button.callback(`\u{1F504} Ganti ke ${acc.username}`, `switch_to_${acc.id}`)]);
        }
      }
      msg += `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F504} Untuk berganti akun aktif: ketik <code>/switch [username]</code> atau klik tombol di bawah.`;
      await sendOrEdit(ctx, msg, true, switchButtons);
    } catch (e) {
      console.error(e);
      await ctx.reply("\u274C Gagal memuat daftar akun.");
    }
  };
  bot2.command("accounts", handleAccounts);
  bot2.action("cmd_accounts", handleAccounts);
  bot2.action(/switch_to_(\d+)/, async (ctx) => {
    try {
      const targetUserId = parseInt(ctx.match[1], 10);
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;
      const userRes = await db2.execute({
        sql: "SELECT * FROM users WHERE id = ?",
        args: [targetUserId]
      });
      if (userRes.rows.length === 0) return ctx.reply("Akun tidak ditemukan.");
      const targetUser = userRes.rows[0];
      await db2.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telegramId, targetUserId]
      });
      const s = await getUserEquityData(targetUserId, targetUser);
      const msg = `\u{1F504} <b>AKUN AKTIF BERHASIL DIGANTI</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F7E2} <b>Akun Aktif Sekarang:</b> <code>${targetUser.username}</code>
\u{1F3F7}\uFE0F <b>Mode:</b> ${targetUser.current_mode || "backtest"}
\u{1F4B0} <b>Equity:</b> $${s.currentEquity.toFixed(2)}

Semua pencatatan trade sekarang akan otomatis masuk ke akun ini!`;
      await ctx.editMessageText(msg, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "\u{1F4DD} Jurnal Trade Baru", callback_data: "cmd_start_journal" }],
            [{ text: "\u{1F519} Menu Utama", callback_data: "cmd_menu" }]
          ]
        }
      });
    } catch (e) {
      console.error(e);
      await ctx.reply("Gagal mengganti akun.");
    }
  });
  bot2.command("switch", async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 2) {
        return ctx.reply("Gunakan: <code>/switch [username]</code>\nContoh: <code>/switch jalu</code>", { parse_mode: "HTML" });
      }
      const targetUsername = parts[1];
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;
      const userRes = await db2.execute({
        sql: "SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?)",
        args: [targetUsername]
      });
      if (userRes.rows.length === 0) {
        return ctx.reply(`\u274C Akun <code>${targetUsername}</code> tidak ditemukan.`, { parse_mode: "HTML" });
      }
      const targetUser = userRes.rows[0];
      await db2.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telegramId, targetUser.id]
      });
      await db2.execute({
        sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
        args: [telegramId, targetUser.id]
      });
      const s = await getUserEquityData(targetUser.id, targetUser);
      const msg = `\u{1F504} <b>AKUN AKTIF BERHASIL DIGANTI</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F7E2} <b>Akun:</b> <code>${targetUser.username}</code>
\u{1F4B0} <b>Equity:</b> $${s.currentEquity.toFixed(2)}`;
      await ctx.reply(msg, { parse_mode: "HTML" });
    } catch (e) {
      console.error(e);
      await ctx.reply("\u274C Gagal berganti akun.");
    }
  });
  bot2.command("link", async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      const identifier = parts[1];
      if (!identifier) {
        return ctx.reply("Gunakan: <code>/link [username]</code> (Contoh: <code>/link jalu</code>)", { parse_mode: "HTML" });
      }
      const res = await db2.execute({
        sql: "SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?)",
        args: [identifier]
      });
      if (res.rows.length === 0) {
        return ctx.reply(`\u274C Username <code>${escapeHtml(identifier)}</code> tidak ditemukan di database.`, { parse_mode: "HTML" });
      }
      const user = res.rows[0];
      const telId = ctx.from?.id?.toString();
      if (!telId) return;
      await ensureTables();
      await db2.execute({
        sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
        args: [telId, user.id]
      });
      await db2.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telId, user.id]
      });
      await db2.execute({
        sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
        args: [telId, user.id]
      });
      await ctx.reply(
        `\u2705 <b>AKUN BERHASIL DITAUTKAN!</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Telegram Anda sekarang terhubung ke akun <b>${user.username}</b>.
Ketik /jurnal atau /quick untuk mulai mencatat trade!`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      console.error(e);
      await ctx.reply("Gagal menautkan akun.");
    }
  });
  bot2.command("login", async (ctx) => {
    try {
      const text = (ctx.message?.text || "").trim();
      const parts = text.split(/\s+/);
      if (parts.length < 3) {
        return ctx.reply("Gunakan: <code>/login [username] [password]</code>", { parse_mode: "HTML" });
      }
      const rawUser = parts[1].trim();
      const rawPassword = parts.slice(2).join(" ").trim();
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;
      const userRes = await db2.execute({
        sql: "SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?)",
        args: [rawUser]
      });
      if (userRes.rows.length === 0) {
        return ctx.reply(`\u274C Akun <code>${escapeHtml(rawUser)}</code> tidak ditemukan.`, { parse_mode: "HTML" });
      }
      const user = userRes.rows[0];
      let isValid = false;
      try {
        if (user.password) {
          isValid = bcrypt.compareSync(rawPassword, user.password);
        }
      } catch (e) {
      }
      if (!isValid) {
        return ctx.reply("\u274C Password salah! Silakan coba lagi.");
      }
      await ensureTables();
      await db2.execute({
        sql: "UPDATE users SET telegram_id = ? WHERE id = ?",
        args: [telegramId, user.id]
      });
      await db2.execute({
        sql: "INSERT OR REPLACE INTO telegram_sessions (telegram_id, active_user_id) VALUES (?, ?)",
        args: [telegramId, user.id]
      });
      await db2.execute({
        sql: "INSERT OR IGNORE INTO telegram_accounts (telegram_id, user_id) VALUES (?, ?)",
        args: [telegramId, user.id]
      });
      await ctx.reply(`\u2705 <b>LOGIN BERHASIL!</b>
Selamat datang, <b>${user.username}</b>.`, { parse_mode: "HTML" });
    } catch (e) {
      console.error(e);
      await ctx.reply("Gagal memproses login.");
    }
  });
  const renderMenu = async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);
    let msg = `\u{1F4F1} <b>CONTROL PANEL TRADING</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`;
    if (user) {
      const s = await getUserEquityData(user.id, user);
      const isNano = user.currency === "NANO";
      const isCent = user.currency === "USC";
      const typeLabel = isNano ? "Nano (1\xA2/lot)" : isCent ? "Cent (10\xA2/lot)" : "Standard ($10/lot)";
      const unitSym = isNano ? "\xA2" : isCent ? "\xA2" : "$";
      msg += `\u{1F464} Akun: <code>${user.username}</code> | Mode: <code>${user.current_mode || "backtest"}</code>
\u{1F3F7}\uFE0F Tipe Akun: <b>${typeLabel}</b> | WR: <b>${s.winRate}%</b>
\u{1F4B0} Equity: <b>${unitSym}${s.currentEquity.toFixed(2)}</b>

`;
    } else {
      msg += `\u26A0\uFE0F Akun belum terhubung. Klik tombol hubungkan akun di bawah.

`;
    }
    msg += `Pilih menu aksi cepat:`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("\u{1F4DD} Jurnal Trade Baru", "cmd_start_journal"), Markup.button.callback("\u{1F4B0} Cek Saldo & Equity", "cmd_saldo")],
      [Markup.button.callback("\u{1F4CA} Hari Ini (Today)", "cmd_today"), Markup.button.callback("\u{1F4C8} 7 Hari (Weekly)", "cmd_weekly")],
      [Markup.button.callback("\u{1F9EE} Kalkulator Lot", "cmd_lot"), Markup.button.callback("\u23F3 Trade Running", "cmd_running")],
      [Markup.button.callback("\u{1F4F0} Berita Pasar (News)", "cmd_news"), Markup.button.callback("\u{1F6E1}\uFE0F Set Toleransi Risiko", "cmd_setrisk_menu")],
      [Markup.button.callback("\u{1F3F7}\uFE0F Ganti Tipe Akun", "cmd_setaccount"), Markup.button.callback("\u{1F465} Kelola Akun", "cmd_accounts")],
      [Markup.button.callback("\u{1F4A1} Bantuan & Panduan", "cmd_help")]
    ]);
    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard }).catch(() => ctx.reply(msg, { parse_mode: "HTML", ...keyboard }));
    } else {
      await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
    }
  };
  bot2.command("menu", renderMenu);
  bot2.action("cmd_menu", renderMenu);
  bot2.action("cmd_running", handleRunningTrades);
  const handleHelp = async (ctx) => {
    const helpMsg = `\u{1F4D6} <b>PANDUAN LENGKAP BOT JURNAL TRADING</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
<b>1. PENCATATAN TRADE (JOURNALING):</b>
\u2022 <code>/jurnal</code> - Wizard interaktif langkah demi langkah
\u2022 <code>/quick [pair] [buy/sell] [lot] [pnl]</code> - Catat trade 1 baris cepat
  <i>Contoh:</i> <code>/quick XAUUSD BUY 0.10 +150 WIN Setup FVG</code>
\u2022 <code>/buy [pair] [lot] [pnl]</code> - Shortcut BUY instan
  <i>Contoh:</i> <code>/buy XAUUSD 0.05 +80</code>
\u2022 <code>/sell [pair] [lot] [pnl]</code> - Shortcut SELL instan
  <i>Contoh:</i> <code>/sell EURUSD 0.10 -40</code>
\u2022 <code>/running</code> - Lihat daftar trade terbuka / pending
\u2022 <code>/close [id] [win/loss] [pnl]</code> - Tutup trade terbuka
\u2022 <code>/undo</code> - Batalkan/hapus trade terakhir jika salah input

<b>2. TOOLS & RISK MANAGEMENT:</b>
\u2022 <code>/news</code> - Kalender ekonomi Forex & rilis berita High-Impact
  <i>Opsi:</i> <code>/news today</code>, <code>/news usd</code>, <code>/news high</code>, <code>/news all</code>
\u2022 <code>/setrisk [persen]</code> - Atur toleransi risiko per trade (cth: <code>/setrisk 1.5</code>)
\u2022 <code>/setaccount [nano/cent/standard]</code> - Ganti tipe akun: Standard ($10), Cent (10\xA2), atau Nano (1\xA2/lot)
\u2022 <code>/lot [pips]</code> - Hitung lot optimal berdasarkan toleransi risiko akun

<b>3. KEUANGAN & PERFORMA:</b>
\u2022 <code>/saldo</code> - Cek modal awal, penarikan & current equity
\u2022 <code>/today</code> - Statistik trade hari ini (Win rate & P/L)
\u2022 <code>/weekly</code> - Statistik performa 7 hari terakhir
\u2022 <code>/deposit [jumlah]</code> - Catat deposit saldo
\u2022 <code>/wd [jumlah]</code> - Catat penarikan keuntungan
\u2022 <code>/setmodal [jumlah]</code> - Setel modal awal akun (cth: <code>/setmodal 10000</code>)

<b>4. MANAJEMEN AKUN:</b>
\u2022 <code>/menu</code> - Buka Control Panel navigasi utama
\u2022 <code>/accounts</code> - Daftar akun multi-user
\u2022 <code>/switch [username]</code> - Ganti akun aktif
\u2022 <code>/link [username]</code> - Tautkan akun Telegram

<b>5. SCREENSHOT & GAMBAR ENTRY:</b>
\u2022 <b>Kirim Foto + Caption:</b> Kirim chart dengan caption: <code>XAUUSD BUY 0.10 +150 WIN Setup Retest</code>
\u2022 <b>Kirim Foto Langsung:</b> Kirim foto tanpa caption, lalu klik tombol <i>[Catat Jurnal dengan Foto Ini]</i>
\u2022 <b>Wizard /jurnal:</b> Di langkah akhir wizard, kirim foto chart Anda
\u2022 <b>TradingView Link:</b> Sertakan link snapshot di /quick (cth: <code>https://tradingview.com/x/...</code>)`;
    await sendOrEdit(ctx, helpMsg, true);
  };
  bot2.command(["help", "bantuan"], handleHelp);
  bot2.action("cmd_help", handleHelp);
  const parseCSVLine = (line) => {
    const arr = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        arr.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    arr.push(current.trim());
    return arr.map((str) => str.replace(/^"|"$/g, "").trim());
  };
  bot2.on(message("text"), async (ctx) => {
    try {
      const text = (ctx.message.text || "").trim();
      const telegramId = ctx.from?.id?.toString();
      if (telegramId && journalSessions.has(telegramId)) {
        const session = journalSessions.get(telegramId);
        if (session.step === "pair") {
          session.pair = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
          session.step = "direction";
          session.timestamp = Date.now();
          const dirKeyboard = [
            [Markup.button.callback("\u{1F7E2} BUY (Long)", "jd_BUY"), Markup.button.callback("\u{1F534} SELL (Short)", "jd_SELL")],
            [Markup.button.callback("\u274C Batalkan", "cmd_cancel_journal")]
          ];
          return ctx.reply(`Pair: <b>${session.pair}</b>
Pilih arah posisi:`, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: dirKeyboard }
          });
        }
        if (session.step === "lot") {
          const lot = parseFloat(text);
          if (isNaN(lot) || lot <= 0) {
            return ctx.reply("Ketik angka lot yang valid (cth: <code>0.05</code>):", { parse_mode: "HTML" });
          }
          session.lot = lot;
          session.step = "entry";
          session.timestamp = Date.now();
          const skipKeyboard = [
            [Markup.button.callback("\u23E9 Lewati Entry Price", "js_skip_entry")],
            [Markup.button.callback("\u274C Batalkan", "cmd_cancel_journal")]
          ];
          return ctx.reply(
            `Lot: <b>${lot}</b>
Ketik harga <b>Entry</b> Anda (cth: <code>2650.50</code>) atau klik Lewati:`,
            { parse_mode: "HTML", reply_markup: { inline_keyboard: skipKeyboard } }
          );
        }
        if (session.step === "entry") {
          if (text !== "-") {
            const entryVal = parseFloat(text);
            if (!isNaN(entryVal)) session.entry = entryVal;
          }
          session.step = "result";
          session.timestamp = Date.now();
          const resKeyboard = [
            [Markup.button.callback("\u{1F3C6} WIN (Profit)", "jr_WIN"), Markup.button.callback("\u274C LOSS (Rugi)", "jr_LOSS")],
            [Markup.button.callback("\u2696\uFE0F BE (Break Even)", "jr_BE"), Markup.button.callback("\u23F3 Running / Open", "jr_PENDING")],
            [Markup.button.callback("\u274C Batalkan", "cmd_cancel_journal")]
          ];
          return ctx.reply(`Entry tercatat: <b>${session.entry || "Dilewati"}</b>
Pilih status hasil trade:`, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: resKeyboard }
          });
        }
        if (session.step === "pnl") {
          let pnlVal = parseFloat(text.replace("$", "").trim());
          if (isNaN(pnlVal)) {
            return ctx.reply("Ketik nominal P/L angka yang valid (cth: <code>150</code> atau <code>-45</code>):", { parse_mode: "HTML" });
          }
          if (session.result === "LOSS" && pnlVal > 0) pnlVal = -pnlVal;
          if (session.result === "WIN" && pnlVal < 0) pnlVal = Math.abs(pnlVal);
          session.pnl = pnlVal;
          session.step = "setup";
          session.timestamp = Date.now();
          return promptSetupStep(ctx, session);
        }
        if (session.step === "setup") {
          session.setup = text;
          if (session.image) {
            return completeInteractiveJournal(ctx, telegramId, session);
          } else {
            return promptImageStep(ctx, session);
          }
        }
        if (session.step === "image") {
          if (text.startsWith("http://") || text.startsWith("https://")) {
            session.image = text;
          }
          return completeInteractiveJournal(ctx, telegramId, session);
        }
      }
      if (text.startsWith("/")) {
        return ctx.reply(
          `\u26A0\uFE0F Perintah tidak dikenali.
Ketik <code>/menu</code> untuk membuka Control Panel atau <code>/help</code> untuk panduan lengkap.`,
          { parse_mode: "HTML" }
        );
      }
      if (text.includes(",")) {
        const parts = parseCSVLine(text);
        if (parts.length >= 11 && ["BUY", "SELL"].includes(parts[3]?.toUpperCase())) {
          const user2 = await getActiveUser(telegramId, ctx.from?.username);
          if (!user2) return sendUnlinkedPrompt(ctx);
          const [dateStr, timeStr, pair, type, setup, entry, sl, tp, lot, status, pnl, emosi, ...notesArr] = parts;
          const notes = notesArr.join(", ");
          const actualUserId = user2.id;
          const mode = user2.current_mode || "backtest";
          const realizedPl = parseFloat(pnl) || 0;
          const entryPrice = parseFloat(entry) || 0;
          const slPrice = parseFloat(sl) || 0;
          const tpPrice = parseFloat(tp) || 0;
          const lotSize = parseFloat(lot) || 0.01;
          const isWin = status.toUpperCase() === "WIN";
          let created_at = (/* @__PURE__ */ new Date()).toISOString();
          try {
            const parsedDate = /* @__PURE__ */ new Date(`${dateStr} ${timeStr}`);
            if (!isNaN(parsedDate.getTime())) created_at = parsedDate.toISOString();
          } catch (e) {
          }
          await db2.execute({
            sql: `INSERT INTO trades (
              user_id, pair, direction, setup_name, entry_price, sl, tp, 
              account_balance, position_size, result, realized_pl, 
              anxiety_level, notes, run_mode, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              actualUserId,
              pair.toUpperCase(),
              type.toUpperCase(),
              setup,
              entryPrice,
              slPrice,
              tpPrice,
              0,
              lotSize,
              status.toUpperCase(),
              realizedPl,
              2,
              notes,
              mode,
              created_at
            ]
          });
          const s = await getUserEquityData(actualUserId, user2);
          const pipsGained = calculatePips(pair, entryPrice, tpPrice, realizedPl, lotSize, isWin, user2?.currency === "NANO");
          const sign = realizedPl >= 0 ? "+" : "";
          let msg = `\u{1F4CA} <b>[TRADE CSV RECORDED]</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <code>${user2.username}</code> (${mode})
\u{1F4C8} Pair: ${pair.toUpperCase()} (${type.toUpperCase()})
\u{1F4B5} P/L: <b>${sign}$${realizedPl.toFixed(2)}</b> (${status.toUpperCase()})
\u{1F4CF} Pips: <b>${pipsGained} Pips</b>
\u26A1 Equity Baru: <b>$${s.currentEquity.toFixed(2)}</b>`;
          return ctx.reply(msg, { parse_mode: "HTML" });
        }
      }
      const upper = text.toUpperCase();
      if ((upper.startsWith("BUY ") || upper.startsWith("SELL ")) && (upper.includes("+") || upper.includes("-") || upper.includes("WIN") || upper.includes("LOSS"))) {
        ctx.message.text = `/quick ${text}`;
        return handleQuickTrade(ctx);
      }
      const user = await getActiveUser(telegramId, ctx.from?.username);
      let replyMsg = `\u{1F44B} Halo ${escapeHtml(ctx.from?.first_name || "Trader")}!

Ada yang bisa dibantu?
\u2022 Untuk mencatat trade: ketik <code>/jurnal</code> atau <code>/quick</code>
\u2022 Untuk mengecek saldo: ketik <code>/saldo</code>
\u2022 Untuk Control Panel utama: ketik <code>/menu</code>`;
      const helperKeyboard = [
        [Markup.button.callback("\u{1F4DD} Jurnal Trade Cepat", "cmd_start_journal"), Markup.button.callback("\u{1F4B0} Cek Saldo", "cmd_saldo")],
        [Markup.button.callback("\u{1F4F1} Buka Control Panel", "cmd_menu")]
      ];
      await ctx.reply(replyMsg, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: helperKeyboard }
      });
    } catch (e) {
      console.error("Text message handling error:", e);
      await ctx.reply("\u26A0\uFE0F Terjadi kendala saat memproses pesan.");
    }
  });
  bot2.on(message("photo"), async (ctx) => {
    try {
      const caption = ctx.message.caption;
      const telegramId = ctx.from?.id?.toString();
      const user = await getActiveUser(telegramId, ctx.from?.username);
      if (!user) return sendUnlinkedPrompt(ctx);
      const actualUserId = user.id;
      const mode = user.current_mode || "backtest";
      const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const base64Img = await getTelegramImageBase64(fileLink.href);
      if (telegramId && journalSessions.has(telegramId)) {
        const session = journalSessions.get(telegramId);
        if (session.step === "image") {
          session.image = base64Img;
          await completeInteractiveJournal(ctx, telegramId, session);
          return;
        }
      }
      if (!caption) {
        pendingPhotos.set(telegramId, { image: base64Img, timestamp: Date.now() });
        const photoMsg = `\u{1F4F8} <b>FOTO SCREENSHOT DITERIMA!</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <code>${user.username}</code>

Pilih cara mencatat trade untuk screenshot ini:

1. <b>Jurnal Interaktif:</b> Klik tombol di bawah untuk mengisi pair, lot, P/L langkah demi langkah (gambar otomatis terpasang).

2. <b>Shortcut Caption:</b> Kirim ulang foto dengan caption 1 baris, contoh:
   \u2022 <code>XAUUSD BUY 0.10 +150 WIN Setup Retest</code>
   \u2022 <code>/buy XAUUSD 0.05 +80</code>`;
        const photoKeyboard = [
          [Markup.button.callback("\u{1F4DD} Catat Jurnal dengan Foto Ini", "cmd_journal_with_saved_photo")],
          [Markup.button.callback("\u274C Abaikan Foto", "cmd_cancel_saved_photo")]
        ];
        return ctx.reply(photoMsg, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: photoKeyboard }
        });
      }
      let cleanCaption = caption.trim();
      let forcedDir = void 0;
      if (cleanCaption.toLowerCase().startsWith("/buy")) forcedDir = "BUY";
      if (cleanCaption.toLowerCase().startsWith("/sell")) forcedDir = "SELL";
      if (cleanCaption.startsWith("/")) {
        cleanCaption = cleanCaption.replace(/^\/[a-zA-Z0-9_]+\s*/, "");
      }
      const tradeData = parseTradeData(cleanCaption);
      let pair = tradeData?.pair || "XAUUSD";
      let direction = forcedDir || (tradeData?.direction?.toUpperCase() === "SELL" ? "SELL" : "BUY");
      let lot = tradeData?.size || 0.01;
      let entry = tradeData?.entry || 0;
      let sl = tradeData?.sl || 0;
      let tp = tradeData?.tp || 0;
      let result = tradeData?.result || "WIN";
      let pnl = tradeData?.pl || 0;
      let notes = tradeData?.notes || "Telegram Photo Log";
      if (!tradeData) {
        const tokens = cleanCaption.split(/\s+/);
        const notesArr = [];
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i].toUpperCase();
          if (t === "BUY" || t === "LONG") {
            direction = "BUY";
            continue;
          }
          if (t === "SELL" || t === "SHORT") {
            direction = "SELL";
            continue;
          }
          if (t === "WIN" || t === "PROFIT") {
            result = "WIN";
            continue;
          }
          if (t === "LOSS" || t === "RUGI" || t === "MC") {
            result = "LOSS";
            continue;
          }
          if (t === "BE" || t === "BREAKEVEN") {
            result = "BE";
            pnl = 0;
            continue;
          }
          if (t === "RUNNING" || t === "OPEN" || t === "PENDING") {
            result = "Pending";
            pnl = 0;
            continue;
          }
          if (tokens[i].toLowerCase().startsWith("sl=")) {
            sl = parseFloat(tokens[i].slice(3)) || 0;
            continue;
          }
          if (tokens[i].toLowerCase().startsWith("tp=")) {
            tp = parseFloat(tokens[i].slice(3)) || 0;
            continue;
          }
          if (tokens[i].toLowerCase().startsWith("entry=")) {
            entry = parseFloat(tokens[i].slice(6)) || 0;
            continue;
          }
          if (/^[+-]\d+(\.\d+)?$/.test(tokens[i])) {
            pnl = parseFloat(tokens[i]);
            if (pnl < 0) result = "LOSS";
            else if (pnl > 0 && result !== "Pending") result = "WIN";
            continue;
          }
          if (/^[A-Z]{6}$/.test(t) || t === "GOLD" || t === "BTC" || t === "ETH" || t === "US30" || t === "NAS100") {
            pair = t === "GOLD" ? "XAUUSD" : t === "BTC" ? "BTCUSD" : t;
            continue;
          }
          const num = parseFloat(tokens[i]);
          if (!isNaN(num)) {
            if (num > 0 && num <= 100 && tokens[i].includes(".") && lot === 0.01) {
              lot = num;
              continue;
            }
            if (entry === 0 && num > 100) {
              entry = num;
              continue;
            }
            if (pnl === 0) {
              pnl = num;
              if (pnl < 0) result = "LOSS";
              continue;
            }
          }
          notesArr.push(tokens[i]);
        }
        if (notesArr.length > 0) notes = notesArr.join(" ");
      }
      if (pnl > 0 && result !== "Pending") result = "WIN";
      if (pnl < 0) result = "LOSS";
      const isWin = result.toUpperCase() === "WIN";
      const pips = calculatePips(pair, entry, tp, pnl, lot, isWin, user?.currency === "NANO");
      const ins = await db2.execute({
        sql: `INSERT INTO trades (
          user_id, pair, direction, setup_name, entry_price, sl, tp, 
          account_balance, position_size, result, realized_pl, pips,
          image, image_url, has_image, anxiety_level, notes, run_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 2, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          actualUserId,
          pair,
          direction,
          notes || "Screenshot Journal",
          entry,
          sl,
          tp,
          0,
          lot,
          result,
          pnl,
          pips,
          base64Img,
          base64Img,
          notes,
          mode
        ]
      });
      const tradeId = ins.lastInsertRowid;
      const s = await getUserEquityData(actualUserId, user);
      const signPL = pnl >= 0 ? "+" : "";
      const signPips = pips >= 0 ? "+" : "";
      const msg = `\u{1F4F8} <b>[TRADE & SCREENSHOT TERSIMPAN]</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F194} <b>ID:</b> #${tradeId} | \u{1F464} <b>Akun:</b> <code>${user.username}</code> (${mode})
\u{1F4C8} <b>Pair:</b> <b>${pair}</b> (${direction === "BUY" ? "\u{1F7E2} BUY" : "\u{1F534} SELL"})
\u{1F4E6} <b>Lot:</b> ${lot}
` + (entry > 0 ? `\u{1F3AF} <b>Entry:</b> ${entry}
` : "") + (sl > 0 ? `\u{1F6D1} <b>SL:</b> ${sl} | \u{1F3AF} <b>TP:</b> ${tp}
` : "") + `\u{1F3C6} <b>Status:</b> <b>${result}</b>
\u{1F4B5} <b>Realized P/L:</b> <b>${signPL}$${pnl.toFixed(2)}</b>
\u{1F4CF} <b>Pips:</b> <b>${signPips}${pips} Pips</b>
\u{1F3AF} <b>Setup:</b> ${notes || "Screenshot Journal"}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u26A1 <b>Equity Terkini:</b> <b>$${s.currentEquity.toFixed(2)}</b>
\u2705 <b>Screenshot:</b> Terlampir & tersinkronisasi ke Dashboard Web!`;
      const doneKeyboard = [
        [Markup.button.callback("\u{1F4DD} Jurnal Lagi", "cmd_start_journal"), Markup.button.callback("\u{1F4B0} Cek Saldo", "cmd_saldo")],
        [Markup.button.callback("\u21A9\uFE0F Hapus Trade Ini", "cmd_undo"), Markup.button.callback("\u{1F4F1} Menu Utama", "cmd_menu")]
      ];
      await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: doneKeyboard } });
    } catch (e) {
      console.error("Photo journal error:", e);
      await ctx.reply("\u274C Terjadi kesalahan saat memproses foto.");
    }
  });
  bot2.action("cmd_journal_with_saved_photo", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    const user = await getActiveUser(telegramId, ctx.from?.username);
    if (!user) return sendUnlinkedPrompt(ctx);
    const saved = pendingPhotos.get(telegramId);
    pendingPhotos.delete(telegramId);
    journalSessions.set(telegramId, {
      step: "pair",
      image: saved?.image,
      timestamp: Date.now()
    });
    const msg = `\u{1F4DD} <b>JURNAL TRADE BARU (Langkah 1/6)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} Akun: <code>${user.username}</code>
\u{1F4F8} <i>Screenshot chart berhasil dilampirkan!</i>

Pilih instrumen / pair yang Anda tradingkan, atau ketik langsung di chat (cth: <i>EURUSD</i>):`;
    const pairKeyboard = [
      [Markup.button.callback("\u{1F7E1} XAUUSD (Gold)", "jp_XAUUSD"), Markup.button.callback("\u{1FA99} BTCUSD", "jp_BTCUSD")],
      [Markup.button.callback("\u{1F1EA}\u{1F1FA} EURUSD", "jp_EURUSD"), Markup.button.callback("\u{1F1EC}\u{1F1E7} GBPUSD", "jp_GBPUSD")],
      [Markup.button.callback("\u{1F1EF}\u{1F1F5} USDJPY", "jp_USDJPY"), Markup.button.callback("\u{1F1E6}\u{1F1FA} AUDUSD", "jp_AUDUSD")],
      [Markup.button.callback("\u274C Batalkan Jurnal", "cmd_cancel_journal")]
    ];
    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: pairKeyboard } }).catch(() => ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: pairKeyboard } }));
    } else {
      await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: pairKeyboard } });
    }
  });
  bot2.action("cmd_cancel_saved_photo", async (ctx) => {
    const telegramId = ctx.from?.id?.toString();
    if (telegramId) pendingPhotos.delete(telegramId);
    await ctx.editMessageText("\u274C Foto diabaikan.", {
      reply_markup: { inline_keyboard: [[Markup.button.callback("\u{1F4F1} Buka Menu", "cmd_menu")]] }
    }).catch(() => ctx.reply("Foto diabaikan."));
  });
  return bot2;
}

// server.ts
dotenv.config({ override: true });
var JWT_SECRET = process.env.JWT_SECRET || "trading_journal_super_secret_key_123";
var app = express();
var PORT = 3e3;
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get("/ping", (req, res) => res.status(200).send("OK"));
app.use((req, res, next) => {
  if (typeof req.body === "string") {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
    }
    req._body = true;
  } else if (Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(req.body.toString("utf8"));
    } catch (e) {
    }
    req._body = true;
  } else if (req.body !== void 0 && req.body !== null && typeof req.body === "object") {
    req._body = true;
  }
  next();
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
var dbUrl = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || "https://jurnal-tryout-lancarkoreaa.aws-ap-northeast-1.turso.io";
if (dbUrl.startsWith("libsql://")) {
  dbUrl = dbUrl.replace("libsql://", "https://");
}
var dbAuthToken = process.env.TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzcyMDMwMDksImlkIjoiMDE5ZDM4MmItZjAwMS03MjlhLTliZjctODQzMGE5NjNjZGY2IiwicmlkIjoiYzRlYzU4MzctOGNhOC00NzBiLTliM2UtYjIwNDkwMDAzNmVhIn0.Ir8xBR4mR7fYLnj6HbSzsHptQjAbfygNHzY6rIRVd3t1qMa7Ktn7dXOklnNDwWg-_nom1XinUpauQRGkciWeAQ";
var dbConfig = { url: dbUrl };
if (dbUrl.startsWith("libsql://") || dbUrl.startsWith("https://")) {
  dbConfig.authToken = dbAuthToken;
}
var db = createClient(dbConfig);
var bot = initTelegramBot(db);
app.get("/api/telegram/status", async (req, res) => {
  let webhookInfo = null;
  if (bot) {
    try {
      webhookInfo = await bot.telegram.getWebhookInfo();
    } catch (err) {
      webhookInfo = { error: err?.message };
    }
  }
  const host = req.get("host") || "";
  const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
  const detectedUrl = host ? `${proto}://${host}/api/webhook` : null;
  res.json({
    ...botStatus,
    webhookInfo,
    detectedUrl,
    isVercel: !!(process.env.VERCEL || process.env.NOW_REGION)
  });
});
app.get("/api/telegram/webhook-info", async (req, res) => {
  if (!bot) return res.status(400).json({ error: "Bot not configured" });
  try {
    const info = await bot.telegram.getWebhookInfo();
    res.json({ success: true, info });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Failed to get webhook info" });
  }
});
app.all("/api/telegram/set-webhook", async (req, res) => {
  if (!bot) return res.status(400).json({ error: "Bot not configured" });
  try {
    let targetUrl = req.query.url || req.body && req.body.url;
    if (!targetUrl) {
      const host = req.get("host") || "";
      const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
      targetUrl = `${proto}://${host}/api/webhook`;
    }
    if (targetUrl.startsWith("http://") && !targetUrl.includes("localhost")) {
      targetUrl = targetUrl.replace("http://", "https://");
    }
    await bot.telegram.setWebhook(targetUrl, {
      allowed_updates: ["message", "callback_query"]
    });
    const info = await bot.telegram.getWebhookInfo();
    res.json({ success: true, message: `Webhook set to ${targetUrl}`, info });
  } catch (err) {
    console.error("Failed to set Telegram webhook:", err);
    res.status(500).json({ error: err?.message || "Failed to set webhook" });
  }
});
app.all("/api/telegram/delete-webhook", async (req, res) => {
  if (!bot) return res.status(400).json({ error: "Bot not configured" });
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    res.json({ success: true, message: "Webhook deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Failed to delete webhook" });
  }
});
var webhookAutoCheckDone = false;
app.use((req, res, next) => {
  if ((process.env.VERCEL || process.env.NOW_REGION) && bot && !webhookAutoCheckDone && req.headers.host && !req.headers.host.includes("localhost")) {
    webhookAutoCheckDone = true;
    (async () => {
      try {
        const info = await bot.telegram.getWebhookInfo();
        const expectedUrl = `https://${req.headers.host}/api/webhook`;
        if (info.url !== expectedUrl) {
          await bot.telegram.setWebhook(expectedUrl, { allowed_updates: ["message", "callback_query"] });
          console.log(`\u26A1 Auto-synchronized Telegram Webhook to ${expectedUrl}`);
        }
      } catch (err) {
        console.warn("Auto webhook sync notice:", err?.message || err);
      }
    })();
  }
  next();
});
if (bot) {
  app.post(["/api/webhook", "/api/telegram/webhook"], async (req, res) => {
    try {
      let update = req.body;
      if (typeof update === "string") {
        try {
          update = JSON.parse(update);
        } catch {
        }
      }
      if (update && typeof update === "object" && update.update_id !== void 0) {
        await bot.handleUpdate(update);
      }
      if (!res.headersSent) {
        res.status(200).send("OK");
      }
    } catch (e) {
      console.warn("Telegram webhook callback error:", e?.message || e);
      if (!res.headersSent) {
        res.status(200).send("OK");
      }
    }
  });
  app.get(["/api/webhook", "/api/telegram/webhook"], (req, res) => {
    res.json({
      status: "active",
      bot: botStatus.username ? `@${botStatus.username}` : "configured",
      message: "Telegram webhook endpoint is ready and operational."
    });
  });
} else {
  app.all(["/api/webhook", "/api/telegram/webhook"], (req, res) => res.status(200).send("Bot not configured"));
}
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
    await db.execute(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        is_used BOOLEAN DEFAULT 0,
        used_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try {
      await db.execute("ALTER TABLE users ADD COLUMN default_risk REAL DEFAULT 2.5");
    } catch (_) {
    }
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
    } catch (e) {
    }
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
      await db.execute("ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 250");
    } catch (e) {
    }
    try {
      await db.execute("ALTER TABLE users ADD COLUMN active_character_id TEXT DEFAULT 'jinwoo_e'");
    } catch (e) {
    }
    try {
      await db.execute("ALTER TABLE users ADD COLUMN telegram_tag TEXT DEFAULT NULL");
    } catch (e) {
    }
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
    await db.execute("UPDATE users SET role = 'admin' WHERE username = 'singga'");
    const aurelCheck = await db.execute("SELECT id FROM users WHERE username = 'aurel'");
    if (aurelCheck.rows.length === 0) {
      const hash = bcrypt2.hashSync("aurel22", 10);
      await db.execute({
        sql: "INSERT INTO users (username, password, role) VALUES ('aurel', ?, 'admin')",
        args: [hash]
      });
    } else {
      await db.execute("UPDATE users SET role = 'admin' WHERE username = 'aurel'");
    }
  } catch (e) {
    console.error("Error initializing DB:", e);
  }
}
initDb();
var authMiddleware = (req, res, next) => {
  let token = req.cookies?.token;
  if (!token && req.headers?.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Sesi tidak valid atau telah berakhir" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Token kedaluwarsa atau tidak valid" });
  }
};
var adminMiddleware = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Akses hanya untuk administrator" });
  }
  next();
};
app.get("/api/auth/invite-hint", (req, res) => {
  res.status(403).json({ error: "Kode khusus pendaftaran hanya diterbitkan oleh Admin di Akun Admin." });
});
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi." });
    }
    const cleanUsername = String(username).trim();
    const cleanPassword = String(password).trim();
    if (cleanUsername.length < 2) {
      return res.status(400).json({ error: "Username minimal 2 karakter." });
    }
    if (cleanPassword.length < 4) {
      return res.status(400).json({ error: "Password minimal 4 karakter." });
    }
    if (!inviteCode || !String(inviteCode).trim()) {
      return res.status(400).json({
        error: "Kode khusus dari Admin wajib diisi. Silakan hubungi Admin untuk mendapatkan kode akses pendaftaran agar terhindar dari spam."
      });
    }
    const cleanInvite = String(inviteCode).trim().toUpperCase();
    const codeCheck = await db.execute({
      sql: "SELECT code, is_used, used_by FROM invite_codes WHERE UPPER(code) = ?",
      args: [cleanInvite]
    });
    if (codeCheck.rows.length === 0) {
      return res.status(400).json({
        error: "Kode khusus pendaftaran tidak valid. Silakan hubungi Admin untuk meminta kode akses pendaftaran yang sah."
      });
    }
    const codeRow = codeCheck.rows[0];
    if (codeRow.is_used) {
      return res.status(400).json({
        error: `Kode khusus "${cleanInvite}" sudah pernah digunakan. Setiap kode hanya berlaku untuk 1 akun. Silakan hubungi Admin.`
      });
    }
    const hash = bcrypt2.hashSync(cleanPassword, 10);
    let userId;
    try {
      const insertUser = await db.execute({
        sql: "INSERT INTO users (username, password, role) VALUES (?, ?, 'user') RETURNING id",
        args: [cleanUsername, hash]
      });
      userId = insertUser.rows[0]?.id;
    } catch (err) {
      return res.status(400).json({ error: "Username sudah terdaftar. Silakan pilih username lain." });
    }
    if (!userId) {
      const u = await db.execute({
        sql: "SELECT id FROM users WHERE LOWER(username) = LOWER(?)",
        args: [cleanUsername]
      });
      userId = u.rows[0]?.id;
    }
    await db.execute({
      sql: "UPDATE invite_codes SET is_used = 1, used_by = ? WHERE UPPER(code) = ?",
      args: [cleanUsername, cleanInvite]
    });
    const token = jwt.sign({ id: userId, username: cleanUsername, role: "user" }, JWT_SECRET, { expiresIn: "30d" });
    const isHttps = req.headers?.["x-forwarded-proto"] === "https" || Boolean(req.connection?.encrypted) || Boolean(req.socket?.encrypted);
    res.cookie("token", token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1e3
    });
    res.json({
      token,
      user: {
        id: userId,
        username: cleanUsername,
        role: "user",
        current_mode: "backtest",
        currency: "USD",
        prop_firm_enabled: false,
        prop_firm_balance: 1e3,
        prop_firm_daily_dd: 5,
        prop_firm_max_dd: 10,
        prop_firm_target: 10,
        prop_firm_payout_total: 0,
        coins: 250,
        active_character_id: "jinwoo_e"
      }
    });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: e?.message || "Terjadi kesalahan server saat mendaftar" });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi." });
    }
    const cleanUsername = String(username).trim();
    const cleanPassword = String(password);
    const userRes = await db.execute({
      sql: "SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR username = ?",
      args: [cleanUsername, cleanUsername]
    });
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: "Username atau password salah." });
    }
    const user = userRes.rows[0];
    const isValid = bcrypt2.compareSync(cleanPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Username atau password salah." });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "30d" });
    const isHttps = req.headers?.["x-forwarded-proto"] === "https" || Boolean(req.connection?.encrypted) || Boolean(req.socket?.encrypted);
    res.cookie("token", token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1e3
    });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        current_mode: user.current_mode || "backtest",
        currency: user.currency || "USD",
        initial_balance: user.initial_balance || 0,
        prop_firm_enabled: Boolean(user.prop_firm_enabled),
        prop_firm_balance: user.prop_firm_balance || 1e3,
        prop_firm_daily_dd: user.prop_firm_daily_dd || 5,
        prop_firm_max_dd: user.prop_firm_max_dd || 10,
        prop_firm_target: user.prop_firm_target || 10,
        prop_firm_payout_total: user.prop_firm_payout_total || 0,
        telegram_id: user.telegram_id || null,
        telegram_tag: user.telegram_tag || null,
        coins: user.coins !== void 0 && user.coins !== null ? Number(user.coins) : 250,
        active_character_id: user.active_character_id || "jinwoo_e"
      }
    });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: e?.message || "Terjadi kesalahan server saat login" });
  }
});
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const userRes = await db.execute({
      sql: "SELECT id, username, role, current_mode, currency, default_risk, prop_firm_enabled, prop_firm_balance, prop_firm_daily_dd, prop_firm_max_dd, prop_firm_target, prop_firm_payout_total, initial_balance, myfxbook_session, telegram_id, telegram_tag, coins, active_character_id FROM users WHERE id = ?",
      args: [req.user.id]
    });
    if (userRes.rows.length === 0) return res.status(401).json({ error: "Unauthorized" });
    const user = userRes.rows[0];
    res.json({ user: {
      id: user.id,
      username: user.username,
      role: user.role,
      current_mode: user.current_mode || "backtest",
      currency: user.currency || "USD",
      default_risk: user.default_risk !== void 0 && user.default_risk !== null ? Number(user.default_risk) : 2.5,
      prop_firm_enabled: Boolean(user.prop_firm_enabled),
      prop_firm_balance: user.prop_firm_balance || 1e3,
      initial_balance: user.initial_balance,
      myfxbook_connected: !!user.myfxbook_session,
      prop_firm_daily_dd: user.prop_firm_daily_dd || 5,
      prop_firm_max_dd: user.prop_firm_max_dd || 10,
      prop_firm_target: user.prop_firm_target || 10,
      prop_firm_payout_total: user.prop_firm_payout_total || 0,
      telegram_id: user.telegram_id || null,
      telegram_tag: user.telegram_tag || null,
      coins: user.coins !== void 0 && user.coins !== null ? Number(user.coins) : 250,
      active_character_id: user.active_character_id || "jinwoo_e"
    } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});
app.post("/api/auth/telegram-tag", authMiddleware, async (req, res) => {
  try {
    const { telegram_tag, telegram_id } = req.body;
    let cleanTag = telegram_tag ? String(telegram_tag).trim().replace(/^@/, "") : null;
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
app.post("/api/auth/currency", authMiddleware, async (req, res) => {
  try {
    const { currency } = req.body;
    if (!["USD", "USC", "NANO", "IDR"].includes(currency)) {
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
app.post("/api/auth/balance", authMiddleware, async (req, res) => {
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
app.post("/api/auth/prop-firm-payout", authMiddleware, async (req, res) => {
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
app.post("/api/auth/prop-firm", authMiddleware, async (req, res) => {
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
app.post("/api/auth/mode", authMiddleware, async (req, res) => {
  try {
    const { mode } = req.body;
    if (!["backtest", "live"].includes(mode)) {
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
  res.clearCookie("token", { httpOnly: true, secure: true, sameSite: "none" });
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
    const { customCode } = req.body || {};
    let code = customCode && String(customCode).trim() ? String(customCode).trim().toUpperCase() : "TRADER" + Math.floor(1e3 + Math.random() * 9e3);
    code = code.replace(/[^A-Z0-9_-]/g, "");
    if (code.length < 3) {
      return res.status(400).json({ error: "Kode khusus minimal 3 karakter." });
    }
    const existing = await db.execute({
      sql: "SELECT code FROM invite_codes WHERE UPPER(code) = UPPER(?)",
      args: [code]
    });
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `Kode "${code}" sudah terdaftar.` });
    }
    await db.execute({
      sql: "INSERT INTO invite_codes (code, is_used) VALUES (?, 0)",
      args: [code]
    });
    res.json({ success: true, code });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Server error" });
  }
});
app.delete("/api/admin/invites/:code", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    await db.execute({
      sql: "DELETE FROM invite_codes WHERE UPPER(code) = UPPER(?)",
      args: [code]
    });
    res.json({ success: true, message: `Kode "${code}" berhasil dihapus.` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Server error" });
  }
});
app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await db.execute("SELECT id, username, role, created_at FROM users WHERE LOWER(username) != 'aurel' ORDER BY created_at DESC");
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
    const hashedPassword = await bcrypt2.hash(password, 10);
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
app.delete("/api/admin/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!targetId || isNaN(targetId)) {
      return res.status(400).json({ error: "ID pengguna tidak valid." });
    }
    if (targetId === Number(req.user.id)) {
      return res.status(400).json({ error: "Tidak dapat menghapus akun Anda sendiri." });
    }
    const check = await db.execute({
      sql: "SELECT id, username, role FROM users WHERE id = ?",
      args: [targetId]
    });
    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Pengguna tidak ditemukan." });
    }
    const targetUser = check.rows[0];
    if (targetUser.role === "admin" || targetUser.username?.toLowerCase() === "singga" || targetUser.username?.toLowerCase() === "aurel") {
      return res.status(403).json({ error: "Akun administrator tidak dapat dihapus. Hanya akun biasa yang dapat dihapus." });
    }
    await db.execute({ sql: "DELETE FROM trades WHERE user_id = ?", args: [targetId] }).catch(() => {
    });
    await db.execute({ sql: "DELETE FROM transactions WHERE user_id = ?", args: [targetId] }).catch(() => {
    });
    await db.execute({ sql: "DELETE FROM telegram_accounts WHERE user_id = ?", args: [targetId] }).catch(() => {
    });
    await db.execute({ sql: "DELETE FROM telegram_sessions WHERE active_user_id = ?", args: [targetId] }).catch(() => {
    });
    await db.execute({ sql: "DELETE FROM user_characters WHERE user_id = ?", args: [targetId] }).catch(() => {
    });
    await db.execute({ sql: "DELETE FROM user_quests WHERE user_id = ?", args: [targetId] }).catch(() => {
    });
    await db.execute({ sql: "UPDATE invite_codes SET is_used = 0, used_by = NULL WHERE used_by = ?", args: [targetUser.username] }).catch(() => {
    });
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [targetId] });
    res.json({ success: true, message: `Akun pengguna "${targetUser.username}" berhasil dihapus secara permanen.` });
  } catch (e) {
    console.error("Delete user error:", e);
    res.status(500).json({ error: "Gagal menghapus user dari database." });
  }
});
app.post("/api/trades/bulk", authMiddleware, async (req, res) => {
  try {
    const { trades } = req.body;
    if (!Array.isArray(trades)) {
      return res.status(400).json({ error: "Invalid data format" });
    }
    const userRes = await db.execute({
      sql: "SELECT current_mode FROM users WHERE id = ?",
      args: [req.user.id]
    });
    const modeToUse = userRes.rows.length > 0 ? userRes.rows[0].current_mode : "backtest";
    let successCount = 0;
    for (const trade of trades) {
      await db.execute({
        sql: `INSERT INTO trades (
          user_id, pair, direction, setup_name, entry_price, sl, tp, account_balance, risk_percentage, position_size, nominal_risk, anxiety_level, checklist, notes, result, realized_pl, image, run_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          req.user.id,
          trade.pair || null,
          trade.direction || "Buy",
          trade.setup_name || "bgg",
          trade.entry_price !== void 0 ? Number(trade.entry_price) : null,
          trade.sl !== void 0 ? Number(trade.sl) : null,
          trade.tp !== void 0 ? Number(trade.tp) : null,
          trade.account_balance !== void 0 ? Number(trade.account_balance) : 1e3,
          trade.risk_percentage !== void 0 ? Number(trade.risk_percentage) : 2.5,
          trade.position_size !== void 0 ? Number(trade.position_size) : 0,
          trade.nominal_risk !== void 0 ? Number(trade.nominal_risk) : 0,
          trade.anxiety_level !== void 0 ? Number(trade.anxiety_level) : 5,
          trade.checklist ? JSON.stringify(trade.checklist) : "[]",
          trade.notes || null,
          trade.result || "Pending",
          trade.realized_pl !== void 0 && trade.realized_pl !== null ? Number(trade.realized_pl) : null,
          trade.image || null,
          modeToUse,
          trade.created_at || (/* @__PURE__ */ new Date()).toISOString()
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
app.post("/api/trades", authMiddleware, async (req, res) => {
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
    const modeToUse = run_mode || (userRes.rows.length > 0 ? userRes.rows[0].current_mode : "backtest");
    const resultDb = await db.execute({
      sql: `INSERT INTO trades (
        user_id, pair, direction, setup_name, entry_price, sl, tp, account_balance, risk_percentage, position_size, nominal_risk, anxiety_level, checklist, notes, result, realized_pl, pips, image, run_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        req.user.id,
        pair || null,
        direction || "Buy",
        setup_name || null,
        entry_price !== void 0 ? entry_price : null,
        sl !== void 0 ? sl : null,
        tp !== void 0 ? tp : null,
        account_balance !== void 0 ? account_balance : null,
        risk_percentage !== void 0 ? risk_percentage : null,
        position_size !== void 0 ? position_size : null,
        nominal_risk !== void 0 ? nominal_risk : null,
        anxiety_level !== void 0 ? anxiety_level : null,
        checklist ? JSON.stringify(checklist) : "[]",
        notes || null,
        result || "Pending",
        realized_pl !== void 0 ? realized_pl : null,
        pips !== void 0 && pips !== null && pips !== "" ? Number(pips) : null,
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
app.get("/api/transactions", authMiddleware, async (req, res) => {
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
app.post("/api/transactions", authMiddleware, async (req, res) => {
  try {
    const { type, amount } = req.body;
    if (!["deposit", "withdrawal"].includes(type) || !amount || amount <= 0) {
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
app.get("/api/trades", authMiddleware, async (req, res) => {
  try {
    const userRes = await db.execute({
      sql: "SELECT current_mode FROM users WHERE id = ?",
      args: [req.user.id]
    });
    const currentMode = userRes.rows.length > 0 ? userRes.rows[0].current_mode : "backtest";
    const result = await db.execute({
      sql: "SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC",
      args: [req.user.id]
    });
    const trades = result.rows.map((row) => {
      const rowObj = { ...row };
      for (const [key, value] of Object.entries(rowObj)) {
        if (typeof value === "bigint") {
          rowObj[key] = Number(value);
        }
      }
      return {
        ...rowObj,
        checklist: JSON.parse(rowObj.checklist || "[]")
      };
    });
    res.json(trades);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch trades" });
  }
});
app.put("/api/trades/:id", authMiddleware, async (req, res) => {
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
        realized_pl !== void 0 ? realized_pl : null,
        pips !== void 0 ? Number(pips) : null,
        pips !== void 0 ? Number(pips) : null,
        notes !== void 0 ? notes : null,
        image !== void 0 ? image : null,
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
app.delete("/api/trades/date/:dateStr", authMiddleware, async (req, res) => {
  try {
    const { dateStr } = req.params;
    const allTrades = await db.execute({
      sql: "SELECT id, created_at FROM trades WHERE user_id = ?",
      args: [req.user.id]
    });
    const idsToDelete = allTrades.rows.filter((row) => {
      try {
        const d = /* @__PURE__ */ new Date(row.created_at + (String(row.created_at).includes("Z") ? "" : "Z"));
        return d.toISOString().split("T")[0] === dateStr;
      } catch (e) {
        return String(row.created_at).startsWith(dateStr);
      }
    }).map((row) => row.id);
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
app.delete("/api/trades/:id", authMiddleware, async (req, res) => {
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
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API Route Not Found: ${req.method} ${req.url}` });
});
app.use((err, req, res, next) => {
  console.error("Unhandled API error:", err);
  res.status(err.status || 500).json({ error: err?.message || "Internal Server Error" });
});
async function setupVite() {
  if (process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV) return;
  if (process.env.NODE_ENV !== "production") {
    const viteMod = "vite";
    const { createServer: createViteServer } = await import(
      /* @vite-ignore */
      viteMod
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
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
    setInterval(() => {
      try {
        fetch(`http://localhost:${PORT}/api/health`).catch(() => {
        });
      } catch (e) {
      }
    }, 4 * 60 * 1e3);
  });
}
if (!process.env.VERCEL && !process.env.NOW_REGION && !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.VERCEL_ENV) {
  setupVite();
}
var server_default = app;
export {
  server_default as default
};
//# sourceMappingURL=server.js.map
