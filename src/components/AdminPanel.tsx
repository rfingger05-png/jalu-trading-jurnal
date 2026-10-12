import React, { useState, useEffect } from 'react';
import { InviteCode, User } from '../types';
import { Shield, KeyRound, User as UserIcon, Bot, CheckCircle2, AlertTriangle, RefreshCw, Send, Globe, Radio } from 'lucide-react';
import { authFetch, safeFormatDate } from '../utils';

export default function AdminPanel() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Password change state
  const [passwordChangeId, setPasswordChangeId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Telegram bot state
  const [botData, setBotData] = useState<any>(null);
  const [botLoading, setBotLoading] = useState(false);
  const [syncingWebhook, setSyncingWebhook] = useState(false);

  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchInvites = async () => {
    try {
      const res = await authFetch('/api/admin/invites?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      }
    } catch (e) { console.error(e); }
  };
  
  const fetchUsers = async () => {
    try {
      const res = await authFetch('/api/admin/users?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        // Hide aurel completely from any UI view
        const visibleUsers = (data.users || []).filter((u: any) => u.username?.toLowerCase() !== 'aurel');
        setUsers(visibleUsers);
      }
    } catch (e) { console.error(e); }
  };

  const fetchBotStatus = async () => {
    setBotLoading(true);
    try {
      const res = await authFetch('/api/telegram/status?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        setBotData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBotLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
    fetchUsers();
    fetchBotStatus();
  }, []);

  const handleSyncWebhook = async () => {
    setSyncingWebhook(true);
    setFeedbackMsg(null);
    try {
      const currentOrigin = window.location.origin;
      // Guarantee https unless testing on localhost
      const secureOrigin = currentOrigin.startsWith('http://') && !currentOrigin.includes('localhost') 
        ? currentOrigin.replace('http://', 'https://') 
        : currentOrigin;
      const targetUrl = `${secureOrigin}/api/webhook`;

      const res = await authFetch('/api/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });

      if (res.ok) {
        const data = await res.json();
        setFeedbackMsg({ 
          text: `✅ Webhook Telegram 24/7 berhasil disinkronkan ke: ${targetUrl}`, 
          type: 'success' 
        });
        await fetchBotStatus();
      } else {
        const err = await res.json();
        setFeedbackMsg({ text: `Gagal sinkron webhook: ${err.error || 'Unknown error'}`, type: 'error' });
      }
    } catch (e: any) {
      console.error(e);
      setFeedbackMsg({ text: e?.message || 'Gagal menghubungi server.', type: 'error' });
    } finally {
      setSyncingWebhook(false);
    }
  };

  const generateInvite = async () => {
    setLoading(true);
    try {
      const resp = await authFetch('/api/admin/invites', { method: 'POST' });
      if (resp.ok) await fetchInvites();
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  
  const handleChangePassword = async (userId: number) => {
    if (!newPassword || newPassword.length < 4) {
      setFeedbackMsg({ text: 'Password minimal 4 karakter.', type: 'error' });
      return;
    }
    setSavingPassword(true);
    setFeedbackMsg(null);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      if (res.ok) {
        setFeedbackMsg({ text: 'Password berhasil diperbarui.', type: 'success' });
        setPasswordChangeId(null);
        setNewPassword('');
      } else {
        const err = await res.json();
        setFeedbackMsg({ text: err.error || 'Gagal mengubah password.', type: 'error' });
      }
    } catch (e: any) {
      console.error(e);
      setFeedbackMsg({ text: e?.message || 'Terjadi kesalahan sistem.', type: 'error' });
    } finally {
      setSavingPassword(false);
    }
  };

  // Filter out aurel so aurel is never visible anywhere in the UI
  const displayUsers = users.filter(u => u.username?.toLowerCase() !== 'aurel');

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
      <div className="p-4 border-b border-slate-100 dark:border-neutral-800 flex justify-between items-center shrink-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Admin Command Center</h3>
      </div>
      
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-neutral-950/50 p-6 flex flex-col gap-10">
        {feedbackMsg && (
          <div className={`p-3 rounded text-xs font-medium border ${feedbackMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
            {feedbackMsg.text}
          </div>
        )}

        {/* Telegram Bot 24/7 Engine Section */}
        <div className="border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm rounded-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded bg-sky-500/10 text-sky-500 flex items-center justify-center border border-sky-500/20">
                <Bot size={20} />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-neutral-200 flex items-center gap-2">
                  Telegram Bot Engine 24/7
                  <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${botData?.webhookInfo?.url ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                    {botData?.webhookInfo?.url ? 'ONLINE 24/7 (WEBHOOK)' : 'POLLING / STANDBY'}
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">
                  Bot: <span className="font-mono font-bold text-sky-600 dark:text-sky-400">@{botData?.username || 'jalu_trade_bot'}</span> • Mode Serverless Vercel
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchBotStatus}
                disabled={botLoading}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border border-slate-200 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors text-slate-700 dark:text-neutral-300 disabled:opacity-50"
              >
                <RefreshCw size={12} className={botLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={handleSyncWebhook}
                disabled={syncingWebhook}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50 shadow-sm"
              >
                <Radio size={12} className={syncingWebhook ? 'animate-pulse' : ''} />
                {syncingWebhook ? 'Menyinkronkan...' : 'Sinkronkan Webhook 24/7'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-neutral-950/60 border border-slate-200 dark:border-neutral-800 rounded">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                <Globe size={12} />
                URL Webhook Telegram Aktif
              </div>
              <div className="font-mono text-[11px] break-all text-slate-700 dark:text-neutral-300">
                {botData?.webhookInfo?.url || (
                  <span className="text-amber-500 italic">Belum disinkronkan ke domain Vercel. Klik "Sinkronkan Webhook 24/7".</span>
                )}
              </div>
              {botData?.webhookInfo?.has_custom_certificate !== undefined && (
                <div className="text-[10px] text-slate-400 mt-1.5">
                  Pending Updates: <span className="font-mono font-bold text-slate-600 dark:text-neutral-300">{botData.webhookInfo.pending_update_count ?? 0}</span>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-neutral-950/60 border border-slate-200 dark:border-neutral-800 rounded flex flex-col justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Petunjuk 24/7 Vercel
              </div>
              <p className="text-[11px] text-slate-600 dark:text-neutral-400 leading-relaxed">
                Di Vercel Serverless, bot menerima pesan secara instan via Webhook <code className="bg-slate-200 dark:bg-neutral-800 px-1 py-0.5 text-[10px]">/api/webhook</code> setiap kali ada chat di Telegram. Bot selalu online 24/7 tanpa henti.
              </p>
            </div>
          </div>
        </div>

        {/* Invites Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400">Active Invite Codes</h4>
            <button 
              onClick={generateInvite}
              disabled={loading}
              className="text-[9px] font-bold bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 px-3 py-1 hover:bg-slate-800 transition-all uppercase disabled:opacity-50"
            >
              {loading ? '...' : 'Generate Invite'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {invites.map(invite => (
              <div key={invite.code} className={`p-4 border shadow-sm flex flex-col gap-2 ${invite.is_used ? 'bg-slate-100 dark:bg-neutral-950 border-slate-200 dark:border-neutral-800 opacity-60' : 'bg-white dark:bg-neutral-900 border-slate-300 dark:border-neutral-700'}`}>
                 <div className="flex justify-between items-center">
                   <span className="font-mono text-lg font-bold tracking-widest">{invite.code}</span>
                   <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 ${invite.is_used ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                     {invite.is_used ? 'Used' : 'Available'}
                   </span>
                 </div>
                 {invite.is_used && (
                   <div className="text-[10px] text-slate-500 dark:text-neutral-500 uppercase tracking-widest font-bold mt-2 border-t border-slate-200 dark:border-neutral-800 pt-2">
                     Used By: <span className="text-slate-800 dark:text-neutral-300">{invite.used_by}</span>
                   </div>
                 )}
              </div>
            ))}
            {invites.length === 0 && (
              <div className="col-span-full border border-slate-200 dark:border-neutral-800 border-dashed text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center py-8">
                No invite codes generated yet.
              </div>
            )}
          </div>
        </div>

        {/* Users Section */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-4">User Management</h4>
          <div className="flex flex-col gap-3">
            {displayUsers.map(u => (
               <div key={u.id} className="border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                     <div className={`w-8 h-8 rounded-sm flex items-center justify-center ${u.role === 'admin' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 dark:bg-neutral-950 text-slate-500 dark:text-neutral-500'}`}>
                        {u.role === 'admin' ? <Shield size={16} /> : <UserIcon size={16} />}
                     </div>
                     <div className="flex flex-col">
                        <span className="font-bold tracking-tight text-sm flex items-center gap-2">
                          {u.username}
                          <span className={`text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${u.current_mode === 'demo' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 dark:bg-neutral-950 text-slate-600 dark:text-neutral-400'}`}>
                            {u.current_mode || 'backtest'}
                          </span>
                        </span>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">ID: {u.id} • Joined {safeFormatDate(u.created_at, 'MMM dd, yyyy', 'Unknown')}</span>
                     </div>
                  </div>
                  
                  <div className="flex flex-col sm:items-end w-full sm:w-auto">
                    {passwordChangeId === u.id ? (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input 
                          type="text"
                          placeholder="New Password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="border border-slate-300 dark:border-neutral-700 text-xs px-2 py-1.5 flex-1 w-full sm:w-32 focus:outline-none focus:border-black dark:border-neutral-500"
                        />
                        <button 
                          onClick={() => handleChangePassword(u.id)}
                          disabled={savingPassword}
                          className="bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button 
                          onClick={() => { setPasswordChangeId(null); setNewPassword(''); }}
                          className="text-slate-400 hover:text-slate-700 dark:text-neutral-400 text-[10px] uppercase font-bold tracking-widest px-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setPasswordChangeId(u.id); setNewPassword(''); }}
                        className="text-[10px] font-bold flex items-center gap-1.5 text-slate-500 dark:text-neutral-500 hover:text-black dark:hover:text-neutral-100 uppercase tracking-widest px-3 py-1 border border-slate-200 dark:border-neutral-800 hover:border-black dark:border-neutral-500 transition-colors rounded-sm"
                      >
                         <KeyRound size={12} />
                         Reset Password
                      </button>
                    )}
                  </div>
               </div>
            ))}
            {displayUsers.length === 0 && (
              <div className="border border-slate-200 dark:border-neutral-800 border-dashed text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center py-8">
                No users found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
