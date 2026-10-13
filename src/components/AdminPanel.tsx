import React, { useState, useEffect } from 'react';
import { InviteCode, User } from '../types';
import { Shield, KeyRound, User as UserIcon, Bot, CheckCircle2, AlertTriangle, RefreshCw, Send, Globe, Radio, Trash2, Copy, Check, Plus, Ticket } from 'lucide-react';
import { authFetch, safeFormatDate } from '../utils';

export default function AdminPanel() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  
  // Password change state
  const [passwordChangeId, setPasswordChangeId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // User deletion state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

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

  const generateInvite = async (customCode?: string) => {
    setLoading(true);
    setFeedbackMsg(null);
    try {
      const resp = await authFetch('/api/admin/invites', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCode: customCode || undefined })
      });
      if (resp.ok) {
        const data = await resp.json();
        setFeedbackMsg({ 
          text: `✅ Kode khusus "${data.code}" berhasil diterbitkan! Calon pengguna sekarang dapat mendaftar dengan kode ini.`, 
          type: 'success' 
        });
        setCustomCodeInput('');
        await fetchInvites();
      } else {
        const err = await resp.json();
        setFeedbackMsg({ text: err.error || 'Gagal menerbitkan kode khusus.', type: 'error' });
      }
    } catch (e: any) { 
      console.error(e); 
      setFeedbackMsg({ text: e?.message || 'Terjadi kesalahan sistem.', type: 'error' });
    } finally { 
      setLoading(false); 
    }
  };

  const handleDeleteInvite = async (code: string) => {
    setDeletingCode(code);
    setFeedbackMsg(null);
    try {
      const resp = await authFetch(`/api/admin/invites/${encodeURIComponent(code)}`, {
        method: 'DELETE'
      });
      if (resp.ok) {
        setFeedbackMsg({ text: `Kode khusus "${code}" berhasil dihapus.`, type: 'success' });
        await fetchInvites();
      } else {
        const err = await resp.json();
        setFeedbackMsg({ text: err.error || 'Gagal menghapus kode khusus.', type: 'error' });
      }
    } catch (e: any) {
      console.error(e);
      setFeedbackMsg({ text: e?.message || 'Gagal menghapus kode.', type: 'error' });
    } finally {
      setDeletingCode(null);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
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

  const handleDeleteUser = async (targetUser: User) => {
    setDeletingUserId(targetUser.id);
    setFeedbackMsg(null);
    try {
      const res = await authFetch(`/api/admin/users/${targetUser.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setFeedbackMsg({ text: `✅ Akun "${targetUser.username}" berhasil dihapus secara permanen.`, type: 'success' });
        setConfirmDeleteId(null);
        await fetchUsers();
        await fetchInvites();
      } else {
        const err = await res.json();
        setFeedbackMsg({ text: err.error || 'Gagal menghapus user.', type: 'error' });
      }
    } catch (e: any) {
      console.error(e);
      setFeedbackMsg({ text: e?.message || 'Terjadi kesalahan sistem.', type: 'error' });
    } finally {
      setDeletingUserId(null);
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

        {/* Invites Section - KODE KHUSUS PENDAFTARAN DARI ADMIN */}
        <div className="border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm rounded-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-neutral-800">
            <div>
              <div className="flex items-center gap-2">
                <Ticket className="text-amber-500" size={18} />
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-neutral-200">
                  Kode Khusus Pendaftaran (Anti-Spam Akun)
                </h4>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
                Calon member wajib memiliki kode dari Admin untuk mendaftar. 1 kode hanya berlaku untuk 1 akun agar user tidak dapat spam generate akun berulang kali.
              </p>
            </div>

            {/* Form Buat Kode */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Kode kustom (opsional)"
                value={customCodeInput}
                onChange={e => setCustomCodeInput(e.target.value.toUpperCase())}
                className="border border-slate-300 dark:border-neutral-700 text-xs px-2.5 py-1.5 focus:outline-none focus:border-amber-500 rounded-sm bg-slate-50 dark:bg-neutral-950 uppercase font-mono tracking-wider w-44"
              />
              <button 
                onClick={() => generateInvite(customCodeInput)}
                disabled={loading}
                className="flex items-center gap-1.5 text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-sm transition-all uppercase disabled:opacity-50 cursor-pointer shadow-sm"
              >
                <Plus size={12} />
                {loading ? 'Membuat...' : customCodeInput ? 'Buat Kode Kustom' : 'Generate Kode Otomatis'}
              </button>
            </div>
          </div>

          {/* List of Invite Codes */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-5">
            {invites.map(invite => (
              <div 
                key={invite.code} 
                className={`p-3.5 border rounded-sm shadow-sm flex flex-col justify-between gap-3 transition-all ${
                  invite.is_used 
                    ? 'bg-slate-50/80 dark:bg-neutral-950/60 border-slate-200 dark:border-neutral-800 opacity-70' 
                    : 'bg-white dark:bg-neutral-900 border-amber-500/30 dark:border-amber-500/20 shadow-amber-500/5'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="font-mono text-base font-bold tracking-widest text-slate-900 dark:text-white select-all">
                      {invite.code}
                    </span>
                    <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                      Dibuat: {safeFormatDate(invite.created_at, 'dd MMM yyyy, HH:mm', 'Baru saja')}
                    </div>
                  </div>
                  <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    invite.is_used 
                      ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50' 
                      : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                  }`}>
                    {invite.is_used ? 'Sudah Dipakai' : 'Tersedia'}
                  </span>
                </div>

                {invite.is_used ? (
                  <div className="text-[10px] text-slate-500 dark:text-neutral-400 font-semibold border-t border-slate-100 dark:border-neutral-800 pt-2 flex items-center justify-between">
                    <span>Digunakan oleh: <b className="text-slate-800 dark:text-neutral-200 font-mono">{invite.used_by || (invite as any).used_by_username || '-'}</b></span>
                    <button
                      onClick={() => handleDeleteInvite(invite.code)}
                      disabled={deletingCode === invite.code}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      title="Hapus riwayat kode"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-slate-100 dark:border-neutral-800 pt-2 flex items-center justify-between gap-2">
                    <button
                      onClick={() => copyCode(invite.code)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider py-1 px-2 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 transition-all cursor-pointer"
                    >
                      {copiedCode === invite.code ? (
                        <>
                          <Check size={12} className="text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400">Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Salin Kode</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteInvite(invite.code)}
                      disabled={deletingCode === invite.code}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      title="Hapus kode ini"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {invites.length === 0 && (
              <div className="col-span-full border border-slate-200 dark:border-neutral-800 border-dashed text-xs text-slate-400 text-center py-8 rounded-sm">
                Belum ada kode khusus. Klik <b>"Generate Kode Otomatis"</b> atau masukkan kode kustom di atas untuk dibagikan ke calon user.
              </div>
            )}
          </div>
        </div>

        {/* Users Section - MANAJEMEN PENGGUNA & HAPUS AKUN BIASA */}
        <div className="border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm rounded-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-neutral-800 mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-neutral-200">
                Manajemen Akun Pengguna & Hapus Akun Biasa
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">
                Admin dapat mereset password atau menghapus akun biasa yang melanggar/spam secara permanen.
              </p>
            </div>
            <div className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">
              Total Pengguna: {displayUsers.length}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {displayUsers.map(u => (
               <div key={u.id} className="border border-slate-200 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-950/40 p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 rounded-sm">
                  <div className="flex items-center gap-3">
                     <div className={`w-9 h-9 rounded-sm flex items-center justify-center ${u.role === 'admin' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900' : 'bg-slate-200 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'}`}>
                        {u.role === 'admin' ? <Shield size={18} /> : <UserIcon size={18} />}
                     </div>
                     <div className="flex flex-col">
                        <span className="font-bold tracking-tight text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                          {u.username}
                          <span className={`text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm font-semibold ${u.current_mode === 'demo' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400' : 'bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300'}`}>
                            {u.current_mode || 'backtest'}
                          </span>
                          {u.role === 'admin' && (
                            <span className="text-[8px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-sm border border-blue-200 dark:border-blue-900">
                              Admin
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">ID: {u.id} • Bergabung: {safeFormatDate(u.created_at, 'dd MMM yyyy', 'Baru')}</span>
                     </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end w-full sm:w-auto">
                    {passwordChangeId === u.id ? (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input 
                          type="text"
                          placeholder="Password Baru"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="border border-slate-300 dark:border-neutral-700 text-xs px-2 py-1.5 flex-1 w-full sm:w-36 focus:outline-none focus:border-black dark:border-neutral-500 rounded-sm bg-white dark:bg-neutral-950"
                        />
                        <button 
                          onClick={() => handleChangePassword(u.id)}
                          disabled={savingPassword}
                          className="bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50 rounded-sm cursor-pointer"
                        >
                          Simpan
                        </button>
                        <button 
                          onClick={() => { setPasswordChangeId(null); setNewPassword(''); }}
                          className="text-slate-400 hover:text-slate-700 dark:text-neutral-400 text-[10px] uppercase font-bold tracking-widest px-2 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setPasswordChangeId(u.id); setConfirmDeleteId(null); setNewPassword(''); }}
                        className="text-[10px] font-bold flex items-center gap-1.5 text-slate-600 dark:text-neutral-400 hover:text-black dark:hover:text-white uppercase tracking-widest px-3 py-1.5 border border-slate-200 dark:border-neutral-800 hover:border-slate-400 dark:hover:border-neutral-600 transition-colors rounded-sm cursor-pointer bg-white dark:bg-neutral-900"
                      >
                         <KeyRound size={12} />
                         Reset Password
                      </button>
                    )}

                    {u.role === 'admin' ? (
                      <span className="text-[9px] text-slate-400 italic px-2">
                        Akun Terlindungi
                      </span>
                    ) : confirmDeleteId === u.id ? (
                      <div className="flex items-center gap-2 p-1.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-900 rounded-sm shadow-sm">
                        <span className="text-[10px] text-rose-700 dark:text-rose-300 font-bold px-1">
                          Hapus akun "{u.username}" beserta seluruh datanya?
                        </span>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          disabled={deletingUserId === u.id}
                          className="bg-rose-600 hover:bg-rose-700 text-white text-[9px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-sm disabled:opacity-50 cursor-pointer shadow-sm"
                        >
                          {deletingUserId === u.id ? 'Menghapus...' : 'Ya, Hapus Permanen'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-slate-500 hover:text-slate-700 dark:text-neutral-400 text-[9px] uppercase font-bold tracking-wider px-1.5 py-1 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setConfirmDeleteId(u.id); setPasswordChangeId(null); }}
                        className="text-[10px] font-bold flex items-center gap-1.5 text-rose-600 dark:text-rose-400 hover:text-white hover:bg-rose-600 uppercase tracking-widest px-3 py-1.5 border border-rose-200 dark:border-rose-900/60 hover:border-rose-600 transition-all rounded-sm cursor-pointer shadow-sm bg-white dark:bg-neutral-900"
                        title="Hapus akun biasa beserta seluruh datanya"
                      >
                        <Trash2 size={12} />
                        Hapus Akun Biasa
                      </button>
                    )}
                  </div>
               </div>
            ))}
            {displayUsers.length === 0 && (
              <div className="border border-slate-200 dark:border-neutral-800 border-dashed text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center py-8">
                Tidak ada akun pengguna ditemukan.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
