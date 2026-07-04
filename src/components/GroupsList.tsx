/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Group } from '../types.js';
import { Plus, Users, Landmark, ChevronRight } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog.js';

interface GroupsListProps {
  groups: Group[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
  onCreateGroup: (name: string, description: string, currency: string) => Promise<void>;
  layout?: 'horizontal' | 'vertical';
}

export default function GroupsList({ 
  groups, 
  selectedGroupId, 
  onSelectGroup, 
  onCreateGroup,
  layout = 'vertical'
}: GroupsListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const currencies = [
    { code: 'USD', name: 'US Dollar ($)' },
    { code: 'EUR', name: 'Euro (€)' },
    { code: 'INR', name: 'Indian Rupee (₹)' },
    { code: 'GBP', name: 'British Pound (£)' },
    { code: 'CAD', name: 'Canadian Dollar (CA$)' },
    { code: 'AUD', name: 'Australian Dollar (A$)' },
    { code: 'JPY', name: 'Japanese Yen (¥)' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Create Shared Room',
      message: `Are you sure you want to create a new shared room named "${name}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setLoading(true);
        try {
          await onCreateGroup(name, description, currency);
          setName('');
          setDescription('');
          setCurrency('USD');
          setShowCreate(false);
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const isHorizontal = layout === 'horizontal';

  return (
    <div className={`${isHorizontal ? 'space-y-4' : 'space-y-6'} font-sans`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
          <Landmark className="w-4 h-4 text-slate-400 dark:text-slate-500" /> 
          {isHorizontal ? 'Available Rooms' : 'Active Groups'}
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-md shadow-indigo-100 dark:shadow-none cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> New Group
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Room or Group Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ski Trip 2026, Apartment 3B"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Description / Notes</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide a short synopsis..."
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Default Split Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-55 dark:hover:bg-slate-800 transition bg-white dark:bg-slate-900 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Instantiating...' : 'Create Room'}
            </button>
          </div>
        </form>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-8 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl shadow-sm">
          <Users className="w-8 h-8 text-slate-300 dark:text-slate-650 mx-auto mb-2" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No shared split rooms yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold mt-2 inline-flex items-center gap-0.5 cursor-pointer"
          >
            Create your first room <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className={isHorizontal 
          ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5" 
          : "space-y-2.5"
        }>
          {groups.map((group) => {
            const isSelected = selectedGroupId === group.id;
            return (
              <button
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                className={`w-full text-left rounded-2xl border transition relative flex items-center justify-between group cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-xs'
                    : 'border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-55 dark:hover:bg-slate-850/60'
                } ${isHorizontal ? 'p-3.5' : 'p-4'}`}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-850 dark:text-slate-100 flex items-center gap-1.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition truncate">
                    <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" /> 
                    <span className="truncate">{group.name}</span>
                  </h4>
                  {group.description && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-450 line-clamp-1 truncate pr-2">
                      {group.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 font-mono tracking-wider bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/30 dark:border-slate-700/40">
                      {group.currency}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-450 font-medium">
                      {group.members?.length || 0} members
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-250 font-mono">
                    {group.currency} {(group.totalExpense || 0).toFixed(2)}
                  </span>
                  <p className="text-[9px] text-slate-400 dark:text-slate-450 mt-0.5 uppercase tracking-wide">Total Pool</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {confirmDialog && confirmDialog.isOpen && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
