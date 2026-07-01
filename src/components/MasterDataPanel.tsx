/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onSnapshot, collection } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { 
  MasterCategory, 
  MasterExchangeRate, 
  addMasterCategory, 
  updateMasterCategory, 
  deleteMasterCategory,
  updateMasterExchangeRate,
  deleteMasterExchangeRate
} from '../lib/dbHelper.js';
import { Tags, Coins, Plus, Trash2, Edit3, Check, X, Database, Sparkles, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface MasterDataPanelProps {
  jwtToken: string;
  onRatesUpdated?: () => void;
}

export default function MasterDataPanel({ jwtToken, onRatesUpdated }: MasterDataPanelProps) {
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [exchangeRates, setExchangeRates] = useState<MasterExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);

  // Category Form States
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editingCatDesc, setEditingCatDesc] = useState('');

  // Currency Rate Form States
  const [newCurrCode, setNewCurrCode] = useState('');
  const [newCurrRate, setNewCurrRate] = useState('');
  const [editingCurrId, setEditingCurrId] = useState<string | null>(null);
  const [editingCurrRate, setEditingCurrRate] = useState('');

  const [activeSubTab, setActiveSubTab] = useState<'categories' | 'currencies'>('categories');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Sorting configurations for categories
  const [catSortField, setCatSortField] = useState<'name' | 'description'>('name');
  const [catSortDirection, setCatSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleCatSort = (field: 'name' | 'description') => {
    if (catSortField === field) {
      setCatSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setCatSortField(field);
      setCatSortDirection('asc');
    }
  };

  const sortedCategories = [...categories].sort((a, b) => {
    let valA = '';
    let valB = '';

    if (catSortField === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (catSortField === 'description') {
      valA = (a.description || '').toLowerCase();
      valB = (b.description || '').toLowerCase();
    }

    if (valA < valB) return catSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return catSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Sorting configurations for currencies
  const [currSortField, setCurrSortField] = useState<'code' | 'rate'>('code');
  const [currSortDirection, setCurrSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleCurrSort = (field: 'code' | 'rate') => {
    if (currSortField === field) {
      setCurrSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setCurrSortField(field);
      setCurrSortDirection('asc');
    }
  };

  const sortedExchangeRates = [...exchangeRates].sort((a, b) => {
    let valA: any;
    let valB: any;

    if (currSortField === 'code') {
      valA = a.code.toLowerCase();
      valB = b.code.toLowerCase();
    } else if (currSortField === 'rate') {
      valA = Number(a.rate);
      valB = Number(b.rate);
    }

    if (valA < valB) return currSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return currSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  useEffect(() => {
    // 1. Listen to Categories in Real-Time
    const unsubscribeCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const list: MasterCategory[] = [];
      snapshot.forEach(d => {
        list.push({ id: d.id, ...d.data() } as MasterCategory);
      });
      // Sort alphabetically
      list.sort((a, b) => a.name.localeCompare(b.name));
      setCategories(list);
    }, (err) => {
      console.error('Error syncing master categories:', err);
    });

    // 2. Listen to Exchange Rates in Real-Time
    const unsubscribeRates = onSnapshot(collection(db, 'exchangeRates'), (snapshot) => {
      const list: MasterExchangeRate[] = [];
      snapshot.forEach(d => {
        list.push({ id: d.id, ...d.data() } as MasterExchangeRate);
      });
      // Sort by USD first, then code alphabetically
      list.sort((a, b) => {
        if (a.code === 'USD') return -1;
        if (b.code === 'USD') return 1;
        return a.code.localeCompare(b.code);
      });
      setExchangeRates(list);
      setLoading(false);
    }, (err) => {
      console.error('Error syncing master exchange rates:', err);
    });

    return () => {
      unsubscribeCats();
      unsubscribeRates();
    };
  }, []);

  const triggerMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // ---------------- CATEGORY CRUD HANDLERS ----------------
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      await addMasterCategory(newCatName, newCatDesc);
      setNewCatName('');
      setNewCatDesc('');
      triggerMessage(`Category "${newCatName}" added successfully!`);
    } catch (err: any) {
      triggerMessage(err.message || 'Failed to add category', 'error');
    }
  };

  const handleStartEditCategory = (cat: MasterCategory) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
    setEditingCatDesc(cat.description || '');
  };

  const handleSaveCategory = async (id: string) => {
    if (!editingCatName.trim()) return;
    try {
      await updateMasterCategory(id, editingCatName, editingCatDesc);
      setEditingCatId(null);
      triggerMessage('Category updated successfully!');
    } catch (err: any) {
      triggerMessage(err.message || 'Failed to update category', 'error');
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the category "${name}"? Existing expenses using this category will remain, but users won't be able to select it anymore.`)) {
      return;
    }
    try {
      await deleteMasterCategory(id);
      triggerMessage(`Category "${name}" removed successfully!`);
    } catch (err: any) {
      triggerMessage(err.message || 'Failed to delete category', 'error');
    }
  };

  // ---------------- CURRENCY CRUD HANDLERS ----------------
  const handleAddCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = newCurrCode.toUpperCase().trim();
    const rateVal = parseFloat(newCurrRate);

    if (!code || isNaN(rateVal) || rateVal <= 0) {
      triggerMessage('Please provide a valid currency code and a positive numeric rate.', 'error');
      return;
    }

    try {
      // Direct PUT to Server API (ensures backend exchange rates map is also synced)
      const res = await fetch(`/api/rates/${code}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ rate: rateVal })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save currency');
      }

      await updateMasterExchangeRate(code, rateVal);
      setNewCurrCode('');
      setNewCurrRate('');
      triggerMessage(`Currency "${code}" added at rate ${rateVal}!`);
      if (onRatesUpdated) onRatesUpdated();
    } catch (err: any) {
      triggerMessage(err.message || 'Failed to add currency rate', 'error');
    }
  };

  const handleSaveCurrency = async (code: string) => {
    const rateVal = parseFloat(editingCurrRate);
    if (isNaN(rateVal) || rateVal <= 0) {
      triggerMessage('Please enter a positive numeric rate value.', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/rates/${code}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ rate: rateVal })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to update rate on server');
      }

      await updateMasterExchangeRate(code, rateVal);
      setEditingCurrId(null);
      triggerMessage(`Currency "${code}" updated to ${rateVal}!`);
      if (onRatesUpdated) onRatesUpdated();
    } catch (err: any) {
      triggerMessage(err.message || 'Failed to update currency rate', 'error');
    }
  };

  const handleDeleteCurrency = async (code: string) => {
    if (code === 'USD') {
      triggerMessage('Failing Safety Constraint: USD is the primary system base currency and cannot be deleted.', 'error');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the currency "${code}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/rates/${code}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Server rejected deletion');
      }

      await deleteMasterExchangeRate(code);
      triggerMessage(`Currency "${code}" deleted successfully.`);
      if (onRatesUpdated) onRatesUpdated();
    } catch (err: any) {
      triggerMessage(err.message || 'Failed to delete currency rate', 'error');
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
        Loading Master Collections...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* HEADER SECTION */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Master Data Terminal</h3>
            <span className="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
              v1.2 Secure
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs">
            Configure system-wide dictionary options, expense categories, and conversion rates for split computations.
          </p>
        </div>

        {/* SUB TAB CONTROL */}
        <div className="inline-flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs shrink-0 self-start md:self-auto">
          <button
            onClick={() => setActiveSubTab('categories')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium transition-all ${
              activeSubTab === 'categories'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <Tags className="w-3.5 h-3.5" />
            <span>Expense Categories</span>
          </button>
          <button
            onClick={() => setActiveSubTab('currencies')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium transition-all ${
              activeSubTab === 'currencies'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Currency Exchange Rates</span>
          </button>
        </div>
      </div>

      {/* STATUS NOTIFICATION MESSAGE */}
      {message && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2 border animate-fade-in ${
          message.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400' 
            : 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/30 text-red-800 dark:text-red-400'
        }`}>
          <Sparkles className="w-4.5 h-4.5 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* TAB CONTENT: CATEGORIES */}
      {activeSubTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* CATEGORY ADD FORM */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-xs h-fit">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-500" />
              <span>Create New Category</span>
            </h4>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Office Supplies"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Description / Notes
                </label>
                <textarea
                  placeholder="Explain what types of transactions fit here..."
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-xs transition shadow-sm"
              >
                Save Category
              </button>
            </form>
          </div>

          {/* CATEGORY LISTING TABLE */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Tags className="w-4 h-4 text-indigo-500" />
                <span>Active Categories Dictionary ({categories.length})</span>
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                    <th onClick={() => handleCatSort('name')} className="py-3 px-2 cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                      <span className="flex items-center gap-1">
                        Name {catSortField === 'name' ? (catSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                      </span>
                    </th>
                    <th onClick={() => handleCatSort('description')} className="py-3 px-2 cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                      <span className="flex items-center gap-1">
                        Description {catSortField === 'description' ? (catSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                      </span>
                    </th>
                    <th className="py-3 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedCategories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
                      <td className="py-3 px-2 font-semibold text-slate-800 dark:text-white">
                        {editingCatId === cat.id ? (
                          <input
                            type="text"
                            value={editingCatName}
                            onChange={(e) => setEditingCatName(e.target.value)}
                            className="px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-normal w-full"
                          />
                        ) : (
                          <span>{cat.name}</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-slate-500 dark:text-slate-400">
                        {editingCatId === cat.id ? (
                          <input
                            type="text"
                            value={editingCatDesc}
                            onChange={(e) => setEditingCatDesc(e.target.value)}
                            className="px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-normal w-full"
                          />
                        ) : (
                          <span>{cat.description || <em className="text-slate-350 dark:text-slate-600 text-[11px]">No notes added</em>}</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {editingCatId === cat.id ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveCategory(cat.id)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition"
                              title="Confirm Edit"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingCatId(null)}
                              className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                              title="Cancel Edit"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleStartEditCategory(cat)}
                              className="p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition"
                              title="Modify Name/Description"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat.id, cat.name)}
                              className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition"
                              title="Delete Category"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400 font-mono text-xs">
                        No custom categories registered yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: CURRENCIES */}
      {activeSubTab === 'currencies' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* CURRENCY ADD FORM */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-xs h-fit">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-500" />
              <span>Register New Currency</span>
            </h4>
            <form onSubmit={handleAddCurrency} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Currency Code (3 Letters)
                </label>
                <input
                  type="text"
                  required
                  maxLength={3}
                  placeholder="e.g. SGD"
                  value={newCurrCode}
                  onChange={(e) => setNewCurrCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 uppercase font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Rate relative to USD (1 USD = X Currency)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  placeholder="e.g. 1.345"
                  value={newCurrRate}
                  onChange={(e) => setNewCurrRate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-xs transition shadow-sm"
              >
                Register Currency
              </button>
            </form>
          </div>

          {/* CURRENCY LISTING TABLE */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-indigo-500" />
              <span>Conversion Rates Table ({exchangeRates.length})</span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                    <th onClick={() => handleCurrSort('code')} className="py-3 px-2 cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                      <span className="flex items-center gap-1">
                        Currency Code {currSortField === 'code' ? (currSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                      </span>
                    </th>
                    <th onClick={() => handleCurrSort('rate')} className="py-3 px-2 font-mono cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                      <span className="flex items-center gap-1">
                        Rate (1 USD = ?) {currSortField === 'rate' ? (currSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                      </span>
                    </th>
                    <th className="py-3 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                  {sortedExchangeRates.map((curr) => (
                    <tr key={curr.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
                      <td className="py-3 px-2 font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-extrabold uppercase">
                          {curr.code}
                        </span>
                        {curr.code === 'USD' && (
                          <span className="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.2 rounded text-[9px] font-bold">
                            Base System Unit
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-slate-650 dark:text-slate-300">
                        {editingCurrId === curr.id ? (
                          <input
                            type="number"
                            step="0.0001"
                            value={editingCurrRate}
                            onChange={(e) => setEditingCurrRate(e.target.value)}
                            className="px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-32 font-mono"
                          />
                        ) : (
                          <span>{Number(curr.rate).toFixed(4)}</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {curr.code === 'USD' ? (
                          <span className="text-[10px] text-slate-350 dark:text-slate-600 italic">Locked</span>
                        ) : editingCurrId === curr.id ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveCurrency(curr.code)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition"
                              title="Save Rate"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingCurrId(null)}
                              className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => { setEditingCurrId(curr.id); setEditingCurrRate(String(curr.rate)); }}
                              className="p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition"
                              title="Edit Rate"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCurrency(curr.code)}
                              className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition"
                              title="Delete Currency"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
