/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Group } from '../types.js';
import { Plus, Users, Landmark, FileText, ChevronRight } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog.js';

interface GroupsListProps {
  groups: Group[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
  onCreateGroup: (name: string, description: string, currency: string) => Promise<void>;
}

export default function GroupsList({ groups, selectedGroupId, onSelectGroup, onCreateGroup }: GroupsListProps) {
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

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Landmark className="w-5 h-5 text-slate-500" /> Active Groups
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-md shadow-indigo-100"
        >
          <Plus className="w-4 h-4" /> New Group
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Room or Group Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ski Trip 2026, Apartment 3B"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description / Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide a short synopsis..."
              className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 h-16"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Default Split Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 text-xs pt-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3.5 py-1.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              {loading ? 'Instantiating...' : 'Create Room'}
            </button>
          </div>
        </form>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-10 bg-white border border-slate-100 rounded-2xl shadow-sm">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">No shared split rooms yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold mt-2 inline-flex items-center gap-0.5"
          >
            Create your first room <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.map((group) => {
            const isSelected = selectedGroupId === group.id;
            return (
              <button
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                className={`w-full text-left p-4 rounded-2xl border transition relative flex items-center justify-between group ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/10 shadow-sm'
                    : 'border-slate-100 bg-white hover:bg-slate-50/50'
                }`}
              >
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 group-hover:text-indigo-650 transition">
                    <Users className="w-3.5 h-3.5 text-slate-400" /> {group.name}
                  </h4>
                  {group.description && (
                    <p className="text-[10px] text-slate-400 line-clamp-1 max-w-[160px]">{group.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] uppercase font-bold text-slate-400 font-mono tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">
                      {group.currency}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {group.members?.length || 0} members
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-800 font-mono">
                    {group.currency} {(group.totalExpense || 0).toFixed(2)}
                  </span>
                  <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wide">Total Pool</p>
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
