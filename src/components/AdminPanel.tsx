import React, { useState, useEffect } from 'react';
import { InviteCode, User } from '../types';
import { Shield, KeyRound, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminPanel() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Password change state
  const [passwordChangeId, setPasswordChangeId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const fetchInvites = async () => {
    try {
      const res = await fetch('/api/admin/invites?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      }
    } catch (e) { console.error(e); }
  };
  
  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchInvites();
    fetchUsers();
  }, []);

  const generateInvite = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/admin/invites', { method: 'POST' });
      if (resp.ok) await fetchInvites();
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  
  const handleChangePassword = async (userId: number) => {
    if (!newPassword || newPassword.length < 4) return alert('Password must be at least 4 characters');
    setSavingPassword(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      if (res.ok) {
        alert('Password updated successfully');
        setPasswordChangeId(null);
        setNewPassword('');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update password');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
      <div className="p-4 border-b border-slate-100 dark:border-neutral-800 flex justify-between items-center shrink-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Admin Command Center</h3>
      </div>
      
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-neutral-950/50 p-6 flex flex-col gap-10">
        {/* Invites Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400">Active Invite Codes</h4>
            <button 
              onClick={generateInvite}
              disabled={loading}
              className="text-[9px] font-bold bg-black dark:bg-neutral-200 text-white dark:text-neutral-900 px-3 py-1 hover:bg-slate-800 transition-all uppercase disabled:opacity-50"
            >
              {loading ? '..."' : 'Generate Invite'}
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
            {users.map(u => (
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
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">ID: {u.id} • Joined {u.created_at ? format(new Date(!isNaN(new Date(u.created_at).getTime()) ? u.created_at : (!isNaN(new Date(u.created_at.replace(/\./g, '-').replace(' ', 'T') + 'Z').getTime()) ? u.created_at.replace(/\./g, '-').replace(' ', 'T') + 'Z' : new Date())), 'MMM dd, yyyy') : 'Unknown'}</span>
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
            {users.length === 0 && (
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
