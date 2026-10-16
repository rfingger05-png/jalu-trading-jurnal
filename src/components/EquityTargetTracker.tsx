import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import { formatCurrency } from '../utils';
import { 
  Target, 
  Trophy, 
  Plus, 
  Edit2, 
  X, 
  AlertCircle
} from 'lucide-react';

export interface EquityTarget {
  id: string;
  userId: number | string;
  accountMode: string;
  name: string;
  startingEquity: number;
  targetEquity: number;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  completedAt?: string | null;
  highWaterMark?: number;
}

interface EquityTargetTrackerProps {
  currentEquity: number;
  startingBalance: number;
  user?: User | null;
}

export default function EquityTargetTracker({
  currentEquity,
  startingBalance,
  user
}: EquityTargetTrackerProps) {
  const userId = user?.id || 'guest';
  const accountMode = user?.current_mode || 'live';
  const storageKey = `jurnalku_equity_targets_${userId}_${accountMode}`;

  const [targets, setTargets] = useState<EquityTarget[]>([]);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState<EquityTarget | null>(null);

  // Modal form states
  const [formName, setFormName] = useState('');
  const [formStarting, setFormStarting] = useState<number>(startingBalance || 10000);
  const [formTarget, setFormTarget] = useState<number>((startingBalance || 10000) * 1.2);
  const [formError, setFormError] = useState<string | null>(null);

  // 1. Load targets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: EquityTarget[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTargets(parsed);
          const active = parsed.find(t => t.status === 'active') || parsed[0];
          setActiveTargetId(active.id);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved equity targets:', e);
    }

    // Default initialization if none exists
    const defaultStart = startingBalance > 0 ? startingBalance : 10000;
    const defaultTarget = defaultStart * 1.2; // 20% growth default

    const defaultGoal: EquityTarget = {
      id: `target-${Date.now()}`,
      userId,
      accountMode,
      name: 'Account Growth Phase 1',
      startingEquity: defaultStart,
      targetEquity: defaultTarget,
      status: 'active',
      createdAt: new Date().toISOString(),
      highWaterMark: defaultStart
    };

    setTargets([defaultGoal]);
    setActiveTargetId(defaultGoal.id);
    localStorage.setItem(storageKey, JSON.stringify([defaultGoal]));
  }, [storageKey, startingBalance, userId, accountMode]);

  // Save targets to storage
  const saveTargets = (newTargets: EquityTarget[]) => {
    setTargets(newTargets);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newTargets));
    } catch (e) {
      console.error('Error saving equity targets:', e);
    }
  };

  // Find currently active target
  const activeTarget = useMemo(() => {
    return targets.find(t => t.id === activeTargetId && t.status !== 'archived') 
      || targets.find(t => t.status === 'active')
      || targets[0] 
      || null;
  }, [targets, activeTargetId]);

  // Update target progress & check target completion
  useEffect(() => {
    if (!activeTarget) return;

    let modified = false;
    const updatedTargets = targets.map(t => {
      if (t.id !== activeTarget.id) return t;

      const newHighWaterMark = Math.max(t.highWaterMark || t.startingEquity, currentEquity);
      let status = t.status;
      let completedAt = t.completedAt;

      // Check if target equity reached
      if (currentEquity >= t.targetEquity && status === 'active') {
        status = 'completed';
        completedAt = new Date().toISOString();
        modified = true;
      }

      if (newHighWaterMark !== t.highWaterMark || status !== t.status) {
        modified = true;
        return {
          ...t,
          status,
          completedAt,
          highWaterMark: newHighWaterMark
        };
      }
      return t;
    });

    if (modified) {
      saveTargets(updatedTargets);
    }
  }, [currentEquity, activeTarget]);

  // Computations for active target
  const calculations = useMemo(() => {
    if (!activeTarget) {
      return {
        targetProfit: 0,
        actualProgress: 0,
        clampedProgress: 0,
        remainingAmount: 0,
        requiredGain: 0,
        isCompleted: false
      };
    }

    const { startingEquity, targetEquity } = activeTarget;
    const targetProfit = targetEquity - startingEquity;

    // Prevent division by zero
    let actualProgress = 0;
    if (targetProfit !== 0) {
      actualProgress = ((currentEquity - startingEquity) / targetProfit) * 100;
    }

    // Visual bar clamp between 0% and 100%
    const clampedProgress = Math.min(100, Math.max(0, actualProgress));

    // Remaining amount to reach goal
    const remainingAmount = Math.max(0, targetEquity - currentEquity);

    // Required gain % from CURRENT equity to target
    let requiredGain = 0;
    if (currentEquity > 0) {
      requiredGain = Math.max(0, ((targetEquity / currentEquity) - 1) * 100);
    }

    const isCompleted = currentEquity >= targetEquity || activeTarget.status === 'completed';

    return {
      targetProfit,
      actualProgress,
      clampedProgress,
      remainingAmount,
      requiredGain,
      isCompleted
    };
  }, [activeTarget, currentEquity]);

  // Handle open modal for create
  const handleOpenCreate = () => {
    setEditingTarget(null);
    setFormName(`Target #${targets.length + 1}`);
    setFormStarting(currentEquity > 0 ? currentEquity : startingBalance || 10000);
    setFormTarget((currentEquity > 0 ? currentEquity : startingBalance || 10000) * 1.20);
    setFormError(null);
    setShowManageModal(true);
  };

  // Handle open modal for edit
  const handleOpenEdit = (t: EquityTarget) => {
    setEditingTarget(t);
    setFormName(t.name);
    setFormStarting(t.startingEquity);
    setFormTarget(t.targetEquity);
    setFormError(null);
    setShowManageModal(true);
  };

  // Handle save target
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Nama target wajib diisi.');
      return;
    }
    if (formStarting <= 0) {
      setFormError('Starting Equity harus lebih besar dari 0.');
      return;
    }
    if (formTarget <= formStarting) {
      setFormError('Target Equity harus lebih besar dari Starting Equity.');
      return;
    }

    if (editingTarget) {
      // Update existing
      const updated = targets.map(t => {
        if (t.id !== editingTarget.id) return t;

        return {
          ...t,
          name: formName.trim(),
          startingEquity: formStarting,
          targetEquity: formTarget
        };
      });

      saveTargets(updated);
    } else {
      // Create new
      const newTarget: EquityTarget = {
        id: `target-${Date.now()}`,
        userId,
        accountMode,
        name: formName.trim(),
        startingEquity: formStarting,
        targetEquity: formTarget,
        status: 'active',
        createdAt: new Date().toISOString(),
        highWaterMark: currentEquity
      };

      // Set others to non-active if making this one active
      const updated = targets.map(t => ({ ...t, status: t.status === 'active' ? 'completed' : t.status } as EquityTarget));
      saveTargets([...updated, newTarget]);
      setActiveTargetId(newTarget.id);
    }

    setShowManageModal(false);
  };

  // Change active target
  const handleSetActive = (id: string) => {
    const updated = targets.map(t => ({
      ...t,
      status: t.id === id ? ('active' as const) : (t.status === 'active' ? ('completed' as const) : t.status)
    }));
    saveTargets(updated);
    setActiveTargetId(id);
  };

  // Delete target
  const handleDelete = (id: string) => {
    if (targets.length <= 1) {
      alert('Minimal harus ada 1 target.');
      return;
    }
    const updated = targets.filter(t => t.id !== id);
    saveTargets(updated);
    if (activeTargetId === id) {
      const nextActive = updated.find(t => t.status !== 'archived');
      setActiveTargetId(nextActive ? nextActive.id : updated[0]?.id || null);
    }
  };

  if (!activeTarget) return null;

  return (
    <div className="bg-[#1A1A1A] rounded-xl border border-[#2D2D2D] p-5 space-y-4 shadow-xs">
      
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2D2D2D]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#252525] border border-[#333333] text-[#00E676] flex items-center justify-center shrink-0">
            <Target size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-white uppercase tracking-tight flex items-center gap-2 font-mono">
                <span>{activeTarget.name}</span>
              </h2>
              {calculations.isCompleted ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30 font-semibold flex items-center gap-1">
                  <Trophy size={10} /> TARGET REACHED
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#262626] text-white border border-[#3D3D3D] font-semibold">
                  ACTIVE GOAL
                </span>
              )}
            </div>
            <p className="text-xs text-[#A3A3A3] mt-0.5 font-mono">
              Target: <strong className="text-white">{formatCurrency(activeTarget.targetEquity, user?.currency)}</strong>
              {' '}(Profit Goal: <span className="text-[#00E676] font-semibold">+{formatCurrency(calculations.targetProfit, user?.currency)}</span>)
            </p>
          </div>
        </div>

        {/* Target Switcher & Manage Buttons */}
        <div className="flex items-center gap-2">
          {targets.filter(t => t.status !== 'archived').length > 1 && (
            <select
              value={activeTarget.id}
              onChange={e => handleSetActive(e.target.value)}
              className="bg-[#121212] border border-[#2D2D2D] text-xs font-mono text-white rounded px-2.5 py-1.5 outline-none cursor-pointer hover:border-[#3D3D3D]"
            >
              {targets.filter(t => t.status !== 'archived').map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.status === 'completed' ? '✓ Reached' : 'Active'})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => handleOpenEdit(activeTarget)}
            className="px-2.5 py-1.5 text-xs font-mono text-[#A3A3A3] hover:text-white bg-[#121212] border border-[#2D2D2D] rounded hover:border-[#3D3D3D] transition-colors flex items-center gap-1 cursor-pointer"
            title="Edit Target"
          >
            <Edit2 size={12} />
            <span className="hidden sm:inline">Edit</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="px-2.5 py-1.5 text-xs font-mono text-[#00E676] hover:text-[#00E676] bg-[#00E676]/10 border border-[#00E676]/30 rounded hover:bg-[#00E676]/20 transition-colors flex items-center gap-1 cursor-pointer"
            title="Tambah Target Baru"
          >
            <Plus size={12} />
            <span className="hidden sm:inline">New Target</span>
          </button>
        </div>
      </div>

      {/* 2. Visual Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-[#A3A3A3] flex items-center gap-1.5">
            <span>Baseline: <strong className="text-white">{formatCurrency(activeTarget.startingEquity, user?.currency)}</strong></span>
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[#A3A3A3]">Progress:</span>
            <span className={`font-extrabold tabular-nums ${calculations.actualProgress >= 100 ? 'text-[#00E676]' : calculations.actualProgress > 0 ? 'text-[#00E676]' : 'text-[#FF3333]'}`}>
              {calculations.actualProgress > 0 ? '+' : ''}{calculations.actualProgress.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Progress Track */}
        <div className="relative w-full h-3 bg-[#121212] rounded-full overflow-hidden border border-[#2D2D2D]">
          <div 
            className={`h-full transition-all duration-500 rounded-full ${
              calculations.isCompleted 
                ? 'bg-[#00E676] shadow-[0_0_12px_rgba(0,230,118,0.4)]' 
                : calculations.actualProgress > 0 
                  ? 'bg-gradient-to-r from-[#00E676]/80 to-[#00E676]' 
                  : 'bg-[#FF3333]/60'
            }`}
            style={{ width: `${calculations.clampedProgress}%` }}
          />
        </div>
      </div>

      {/* 3. Four Core Analytical Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#262626]">
        {/* Metric 1: Current Equity */}
        <div className="bg-[#121212] p-3 rounded-lg border border-[#262626]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] block">
            Current Equity
          </span>
          <div className="text-base font-extrabold font-mono text-white tabular-nums mt-0.5">
            {formatCurrency(currentEquity, user?.currency)}
          </div>
          <span className="text-[10px] font-mono text-[#737373]">Live account balance</span>
        </div>

        {/* Metric 2: Progress to Goal */}
        <div className="bg-[#121212] p-3 rounded-lg border border-[#262626]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] block">
            Progress to Goal
          </span>
          <div className={`text-base font-extrabold font-mono tabular-nums mt-0.5 ${
            calculations.actualProgress >= 0 ? 'text-[#00E676]' : 'text-[#FF3333]'
          }`}>
            {calculations.actualProgress > 0 ? '+' : ''}{calculations.actualProgress.toFixed(1)}%
          </div>
          <span className="text-[10px] font-mono text-[#737373]">
            {calculations.isCompleted ? 'Target Achieved' : `From ${formatCurrency(activeTarget.startingEquity, user?.currency)}`}
          </span>
        </div>

        {/* Metric 3: Remaining to Goal */}
        <div className="bg-[#121212] p-3 rounded-lg border border-[#262626]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] block">
            Remaining to Goal
          </span>
          <div className="text-base font-extrabold font-mono text-amber-300 tabular-nums mt-0.5">
            {calculations.remainingAmount > 0 ? formatCurrency(calculations.remainingAmount, user?.currency) : '$0.00'}
          </div>
          <span className="text-[10px] font-mono text-[#737373]">
            {calculations.remainingAmount > 0 ? 'Amount remaining' : 'Target reached'}
          </span>
        </div>

        {/* Metric 4: Required Return */}
        <div className="bg-[#121212] p-3 rounded-lg border border-[#262626]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] block">
            Required Return
          </span>
          <div className="text-base font-extrabold font-mono text-cyan-400 tabular-nums mt-0.5">
            {calculations.requiredGain > 0 ? `+${calculations.requiredGain.toFixed(2)}%` : '0.00%'}
          </div>
          <span className="text-[10px] font-mono text-[#737373]">Needed from current</span>
        </div>
      </div>

      {/* Target Management & Edit Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] w-full max-w-lg rounded-xl shadow-2xl p-6 text-white space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D2D2D]">
              <div className="flex items-center gap-2">
                <Target size={18} className="text-[#00E676]" />
                <h3 className="font-extrabold text-sm tracking-tight text-white uppercase font-mono">
                  {editingTarget ? 'Edit Equity Target' : 'Create New Equity Target'}
                </h3>
              </div>
              <button 
                onClick={() => setShowManageModal(false)}
                className="text-[#A3A3A3] hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-[#FF3333]/15 border border-[#FF3333]/40 text-[#FF3333] text-xs flex items-center gap-2 font-mono">
                <AlertCircle size={14} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveForm} className="space-y-4 text-xs font-mono">
              <div className="space-y-1">
                <label className="text-[11px] uppercase text-[#A3A3A3] font-semibold">
                  Target Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Account Phase 1 (+8%)"
                  className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md p-2.5 text-xs text-white outline-none focus:border-[#00E676]"
                  required
                />

                {/* Quick preset phase buttons */}
                <div className="flex items-center gap-2 pt-1.5 flex-wrap">
                  <span className="text-[10px] text-[#737373]">Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const start = formStarting || startingBalance || 10000;
                      setFormName('Phase 1 Evaluation (+8%)');
                      setFormTarget(Number((start * 1.08).toFixed(2)));
                    }}
                    className="px-2 py-1 rounded bg-[#121212] border border-[#2D2D2D] text-[10px] text-[#00E676] hover:border-[#00E676] cursor-pointer"
                  >
                    Phase 1 (8%)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const start = formStarting || startingBalance || 10000;
                      setFormName('Phase 2 Evaluation (+5%)');
                      setFormTarget(Number((start * 1.05).toFixed(2)));
                    }}
                    className="px-2 py-1 rounded bg-[#121212] border border-[#2D2D2D] text-[10px] text-cyan-400 hover:border-cyan-400 cursor-pointer"
                  >
                    Phase 2 (5%)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const start = formStarting || startingBalance || 10000;
                      setFormName('Growth Scaling (+20%)');
                      setFormTarget(Number((start * 1.20).toFixed(2)));
                    }}
                    className="px-2 py-1 rounded bg-[#121212] border border-[#2D2D2D] text-[10px] text-amber-300 hover:border-amber-400 cursor-pointer"
                  >
                    Scaling (+20%)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase text-[#A3A3A3] font-semibold">
                    Starting Equity
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formStarting}
                    onChange={e => setFormStarting(Number(e.target.value))}
                    className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md p-2.5 text-xs text-white outline-none focus:border-[#00E676]"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] uppercase text-[#A3A3A3] font-semibold">
                    Target Equity Goal
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formTarget}
                    onChange={e => setFormTarget(Number(e.target.value))}
                    className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md p-2.5 text-xs text-white outline-none focus:border-[#00E676]"
                    required
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#121212] border border-[#262626] text-[11px] text-[#A3A3A3] flex items-center justify-between">
                <span>Profit Target:</span>
                <span className="font-bold text-[#00E676]">
                  +{formatCurrency(Math.max(0, formTarget - formStarting), user?.currency)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#2D2D2D]">
                {editingTarget ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Yakin ingin menghapus target "${editingTarget.name}"?`)) {
                        handleDelete(editingTarget.id);
                        setShowManageModal(false);
                      }
                    }}
                    className="text-[#FF3333] hover:underline cursor-pointer text-xs"
                  >
                    Delete Target
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManageModal(false)}
                    className="px-3 py-1.5 rounded-md bg-[#121212] border border-[#2D2D2D] text-[#A3A3A3] hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-md bg-[#00E676] hover:bg-[#00E676]/90 text-black font-bold uppercase tracking-wider cursor-pointer shadow-xs"
                  >
                    Save Target
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
