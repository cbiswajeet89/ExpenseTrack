/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Group, Expense, User, ExpenseSplit } from '../types.js';
import ConfirmDialog from './ConfirmDialog.js';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  ArrowDownRight, 
  ArrowUpRight, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Pencil, 
  Trash2, 
  Coins, 
  Filter, 
  Info,
  Calendar,
  Search
} from 'lucide-react';
import { getExpensesForGroup } from '../lib/dbHelper.js';
import EditExpenseModal from './EditExpenseModal.js';

interface DashboardProps {
  groups: Group[];
  expenses: Expense[]; // Active group expenses passed from App level
  users: User[];
  currentUserId: string;
  currencyRates: { [key: string]: number };
  onUpdateExpense?: (expenseId: string, updatedExpense: Omit<Expense, 'id' | 'createdAt'>, oldAmount: number) => Promise<void>;
  onDeleteExpense?: (expenseId: string, amount: number) => Promise<void>;
}

export default function Dashboard({ 
  groups, 
  expenses, 
  users, 
  currentUserId, 
  currencyRates,
  onUpdateExpense,
  onDeleteExpense
}: DashboardProps) {
  // Currency switcher state
  const [selectedCurrency, setSelectedCurrency] = useState(() => localStorage.getItem('selectedCurrency') || 'INR');

  const handleCurrencyChange = (currCode: string) => {
    setSelectedCurrency(currCode);
    localStorage.setItem('selectedCurrency', currCode);
  };

  // Selected Group state for Dashboard scoping
  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const [dashboardExpenses, setDashboardExpenses] = useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  } | null>(null);

  // Initialize group selection
  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      // Find default group to pre-select
      const preseeded = groups.find(g => g.id === 'grp_apartment_3b');
      setActiveGroupId(preseeded ? preseeded.id : groups[0].id);
    }
  }, [groups, activeGroupId]);

  const [showDeleted, setShowDeleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const categories = [
    'Food & Groceries',
    'Utilities & Bills',
    'Rent & Lodging',
    'Household',
    'Entertainment & Leisure',
    'Travel & Transport',
    'Other'
  ];

  // Sync group expenses in real-time when activeGroupId changes
  useEffect(() => {
    if (!activeGroupId) {
      setDashboardExpenses([]);
      return;
    }

    setLoadingExpenses(true);

    const expensesQuery = query(
      collection(db, 'expenses'),
      where('groupId', '==', activeGroupId)
    );

    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const list: Expense[] = [];
      snapshot.forEach(d => {
        list.push(d.data() as Expense);
      });
      // Sort by date descending
      const sorted = list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setDashboardExpenses(sorted);
      setLoadingExpenses(false);
    }, (error) => {
      console.error('[Dashboard] Real-time sync error for dashboard expenses:', error);
      setLoadingExpenses(false);
    });

    return () => {
      unsubscribeExpenses();
    };
  }, [activeGroupId]);

  const activeExpenses = useMemo(() => {
    return dashboardExpenses.filter(e => !e.isDeleted);
  }, [dashboardExpenses]);

  const deletedExpenses = useMemo(() => {
    return dashboardExpenses.filter(e => e.isDeleted);
  }, [dashboardExpenses]);

  const displayedExpenses = useMemo(() => {
    if (showDeleted) return dashboardExpenses;
    return activeExpenses;
  }, [activeExpenses, dashboardExpenses, showDeleted]);

  // Map of userId to User object for easy lookup
  const userMap = useMemo(() => {
    return new Map<string, User>(users.map(u => [u.id, u]));
  }, [users]);

  // Filtered expenses based on search query & category filter
  const filteredExpenses = useMemo(() => {
    return displayedExpenses.filter(exp => {
      // Search match
      const queryText = searchQuery.toLowerCase().trim();
      const payerName = userMap.get(exp.paidBy)?.name || '';
      const creatorName = userMap.get(exp.createdBy || exp.paidBy)?.name || '';
      
      const matchesSearch = !queryText || 
        exp.description.toLowerCase().includes(queryText) ||
        (exp.category && exp.category.toLowerCase().includes(queryText)) ||
        payerName.toLowerCase().includes(queryText) ||
        creatorName.toLowerCase().includes(queryText) ||
        (exp.items && exp.items.some(it => it.description.toLowerCase().includes(queryText)));

      // Category match
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(exp.category);

      return matchesSearch && matchesCategory;
    });
  }, [displayedExpenses, searchQuery, selectedCategories, userMap]);

  // Currency Symbols configuration
  const currencySymbols: { [key: string]: string } = {
    USD: '$',
    EUR: '€',
    INR: '₹',
    GBP: '£',
    CAD: 'CA$',
    AUD: 'A$',
    JPY: '¥'
  };

  // Convert from any currency to the selected dashboard currency on the fly
  const convertToSelected = (amount: number, fromCurrency: string) => {
    const amountUSD = amount / (currencyRates[fromCurrency] || 1);
    return amountUSD * (currencyRates[selectedCurrency] || 1);
  };

  // Get active group metadata
  const activeGroup = useMemo(() => {
    return groups.find(g => g.id === activeGroupId) || null;
  }, [groups, activeGroupId]);

  // Resolve all balances and optimize settlement routes in selected currency
  const balanceResolution = useMemo(() => {
    const balances: { [userId: string]: number } = {};

    // Initialize only group members with 0
    if (activeGroup) {
      activeGroup.members.forEach(mId => {
        balances[mId] = 0;
      });
    } else {
      users.forEach(u => {
        balances[u.id] = 0;
      });
    }

    // Sum all active expenses and subtract splits
    activeExpenses.forEach(exp => {
      // Amount in selected currency
      const amountSelected = convertToSelected(exp.amount, exp.currency);

      // PaidBy gets the credit
      if (balances[exp.paidBy] !== undefined) {
        balances[exp.paidBy] += amountSelected;
      }

      // Splits get the debit
      if (exp.splits) {
        exp.splits.forEach(split => {
          const splitAmountSelected = convertToSelected(split.amount, exp.currency);
          if (balances[split.userId] !== undefined) {
            balances[split.userId] -= splitAmountSelected;
          }
        });
      }
    });

    // Create debtors and creditors arrays
    const debtors: Array<{ id: string; name: string; amount: number }> = [];
    const creditors: Array<{ id: string; name: string; amount: number }> = [];

    Object.entries(balances).forEach(([userId, bal]) => {
      const u = userMap.get(userId);
      if (!u) return;
      
      if (Math.abs(bal) < 0.01) {
        balances[userId] = 0;
        return;
      }

      if (bal < 0) {
        debtors.push({ id: userId, name: u.name, amount: Math.abs(bal) });
      } else if (bal > 0) {
        creditors.push({ id: userId, name: u.name, amount: bal });
      }
    });

    // Greedy settlement optimization
    const settlements: Array<{
      fromId: string;
      fromName: string;
      toId: string;
      toName: string;
      amountSelected: number;
    }> = [];

    const dList = debtors.map(d => ({ ...d }));
    const cList = creditors.map(c => ({ ...c }));

    let safetyVal = 0;
    while (dList.length > 0 && cList.length > 0 && safetyVal < 500) {
      safetyVal++;
      dList.sort((a, b) => b.amount - a.amount);
      cList.sort((a, b) => b.amount - a.amount);

      const debtor = dList[0];
      const creditor = cList[0];

      const settleAmount = Math.min(debtor.amount, creditor.amount);

      settlements.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amountSelected: settleAmount
      });

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (debtor.amount < 0.01) dList.shift();
      if (creditor.amount < 0.01) cList.shift();
    }

    return {
      balances,
      settlements
    };
  }, [activeExpenses, activeGroup, users, userMap, selectedCurrency, currencyRates]);

  // Aggregate Category breakdown data in selected currency for pie chart
  const categoryData = useMemo(() => {
    const dataMap: { [cat: string]: number } = {};

    activeExpenses.forEach(exp => {
      const amountSelected = convertToSelected(exp.amount, exp.currency);
      const cat = exp.category || 'Other';
      dataMap[cat] = (dataMap[cat] || 0) + amountSelected;
    });

    const colors = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6'];
    return Object.entries(dataMap).map(([name, value], idx) => ({
      name,
      value: Math.round(value),
      color: colors[idx % colors.length]
    }));
  }, [activeExpenses, selectedCurrency, currencyRates]);

  // Aggregate monthly spending trends in selected currency for bar chart
  const trendData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dataMap: { [month: string]: number } = {};

    months.forEach(m => {
      dataMap[m] = 0;
    });

    activeExpenses.forEach(exp => {
      const date = new Date(exp.date);
      const m = months[date.getMonth()];
      const amountSelected = convertToSelected(exp.amount, exp.currency);
      if (dataMap[m] !== undefined) {
        dataMap[m] += amountSelected;
      }
    });

    return months.map(m => ({
      month: m,
      Amount: Math.round(dataMap[m])
    }));
  }, [activeExpenses, selectedCurrency, currencyRates]);

  // User financial summaries converted to selected currency
  const personalBalance = balanceResolution.balances[currentUserId] || 0;

  const { youAreOwed, youOwe } = useMemo(() => {
    let owedToYou = 0;
    let owedByYou = 0;

    activeExpenses.forEach(exp => {
      if (exp.paidBy === currentUserId) {
        if (exp.splits) {
          exp.splits.forEach(split => {
            if (split.userId !== currentUserId) {
              owedToYou += convertToSelected(split.amount, exp.currency);
            }
          });
        }
      } else {
        if (exp.splits) {
          const mySplit = exp.splits.find(s => s.userId === currentUserId);
          if (mySplit) {
            owedByYou += convertToSelected(mySplit.amount, exp.currency);
          }
        }
      }
    });

    return {
      youAreOwed: owedToYou,
      youOwe: owedByYou
    };
  }, [activeExpenses, currentUserId, selectedCurrency, currencyRates]);

  const handleSaveEditedExpense = async (expenseId: string, updatedPayload: Omit<Expense, 'id' | 'createdAt'>, oldAmount: number) => {
    if (onUpdateExpense) {
      await onUpdateExpense(expenseId, updatedPayload, oldAmount);
      // Refresh the group list
      const logs = await getExpensesForGroup(activeGroupId);
      setDashboardExpenses(logs);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* TOOLBAR CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Select Shared Room:</span>
          <select
            value={activeGroupId}
            onChange={(e) => setActiveGroupId(e.target.value)}
            className="px-3 py-1.5 border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-850 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.currency})</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-pulse" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Convert Workspace to:</span>
          <div className="flex bg-slate-200/50 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-150 dark:border-slate-750 gap-0.5">
            {Object.keys(currencyRates).map((currCode) => (
              <button
                key={currCode}
                onClick={() => handleCurrencyChange(currCode)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase transition cursor-pointer ${
                  selectedCurrency === currCode
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs border border-indigo-100/50 dark:border-indigo-900/30'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {currCode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">Total Balance</p>
            <h3 className={`text-2xl font-extrabold ${personalBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {personalBalance >= 0 ? '+' : ''}{currencySymbols[selectedCurrency] || selectedCurrency}{personalBalance.toFixed(2)}
            </h3>
          </div>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${personalBalance >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 dark:text-emerald-450' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-500 dark:text-rose-450'}`}>
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">You are owed</p>
            <h3 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{currencySymbols[selectedCurrency] || selectedCurrency}{youAreOwed.toFixed(2)}</h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">You owe</p>
            <h3 className="text-2xl font-extrabold text-rose-500 dark:text-rose-400">{currencySymbols[selectedCurrency] || selectedCurrency}{youOwe.toFixed(2)}</h3>
          </div>
          <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/20 rounded-full flex items-center justify-center text-rose-500 dark:text-rose-400 shrink-0">
            <ArrowDownRight className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Settlements & Individual Balances Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-850 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              🤝 Optimized Settlement Matrix
            </h3>
            <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full font-mono">
              Greedy Routing
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-6">
            Minimized debt clearance matrix calculated in **{selectedCurrency}** to solve all group splits.
          </p>

          {balanceResolution.settlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 bg-gray-50 dark:bg-slate-850/50 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 dark:text-emerald-400 mb-2" />
              <p className="text-xs font-medium text-gray-600 dark:text-slate-300">Perfect Equilibrium!</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">All roommates are completely settled.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {balanceResolution.settlements.map((settle, i) => (
                <div 
                  key={i} 
                  className={`flex items-center justify-between p-3.5 border rounded-xl text-xs transition ${
                    settle.fromId === currentUserId 
                      ? 'border-red-100 dark:border-red-950/25 bg-red-50/20 dark:bg-red-950/10' 
                      : settle.toId === currentUserId 
                      ? 'border-emerald-100 dark:border-emerald-950/25 bg-emerald-50/20 dark:bg-emerald-950/10' 
                      : 'border-gray-100 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-850/20'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-gray-800 dark:text-slate-200">{settle.fromName}</span>
                    <span className="text-gray-400 dark:text-slate-500">pays</span>
                    <span className="font-semibold text-gray-800 dark:text-slate-200">{settle.toName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="font-semibold text-gray-900 dark:text-white">{currencySymbols[selectedCurrency] || selectedCurrency}{settle.amountSelected.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 uppercase">{selectedCurrency}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ledger Breakdown by User */}
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-850 p-6 rounded-2xl shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100 tracking-tight mb-2">👥 Splitwise Board Member Status</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-6">
            Individual roommate balances calculated in **{selectedCurrency}**. Positive represents money owed to them.
          </p>

          <div className="space-y-4">
            {activeGroup?.members.map((memberId) => {
              const user = userMap.get(memberId);
              if (!user) return null;
              const bal = balanceResolution.balances[user.id] || 0;
              return (
                <div key={user.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center font-bold text-gray-650 dark:text-slate-300 text-xs uppercase">
                      {user.name.substr(0, 2)}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-gray-850 dark:text-slate-200">{user.name} {user.id === currentUserId && '(You)'}</h4>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-mono tracking-wider">{user.role}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-mono font-semibold ${bal > 0 ? 'text-emerald-600 dark:text-emerald-400' : bal < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-gray-400 dark:text-slate-500'}`}>
                    {bal > 0 ? '+' : ''}{currencySymbols[selectedCurrency] || selectedCurrency}{bal.toFixed(2)} {selectedCurrency}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Analytics charts */}
      {activeExpenses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-850 p-6 rounded-2xl shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100 tracking-tight mb-1">🍕 Allocation by Category ({selectedCurrency})</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-6">Consolidated expenditures dynamically converted on-the-fly.</p>
            <div className="h-64">
              {categoryData.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-slate-500 flex items-center justify-center h-full">No category data recorded.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {categoryData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', borderColor: 'var(--tooltip-border, #e5e7eb)', borderRadius: '12px', fontSize: '11px', color: 'var(--tooltip-text, #1e293b)' }}
                      formatter={(value) => [`${currencySymbols[selectedCurrency] || selectedCurrency}${value}`, 'Amount']} 
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-850 p-6 rounded-2xl shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100 tracking-tight mb-1">📈 Monthly Spending Velocity ({selectedCurrency})</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-6">A real-time visual tracking of shared pool volume.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--stroke-grid, #f3f4f6)" />
                  <XAxis dataKey="month" stroke="#9ca3af" fontSize={11} tickLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', borderColor: 'var(--tooltip-border, #e5e7eb)', borderRadius: '12px', fontSize: '11px', color: 'var(--tooltip-text, #1e293b)' }}
                    formatter={(value) => [`${currencySymbols[selectedCurrency] || selectedCurrency}${value}`, 'Total spent']} 
                  />
                  <Bar dataKey="Amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD LOGGED EXPENSES TABLE VIEW (Requirement #3) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850/50">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-1.5">
            📜 Roommates Transaction Log Database ({activeGroup?.name || 'Group'})
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            {deletedExpenses.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer text-[11px] select-none bg-slate-150/70 hover:bg-slate-150 px-2.5 py-1 rounded-full font-semibold text-slate-650 dark:text-slate-350 transition-colors">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3 cursor-pointer"
                />
                <span>Include Deleted ({deletedExpenses.length} for Audit Trail)</span>
              </label>
            )}
            <span className="text-[10px] font-semibold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950/40 px-2.5 py-1 rounded-full">
              {filteredExpenses.length !== displayedExpenses.length 
                ? `${filteredExpenses.length} of ${displayedExpenses.length} Matched` 
                : `${displayedExpenses.length} Transactions`
              }
            </span>
          </div>
        </div>

        {/* SEARCH & CATEGORY FILTERS */}
        <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-800 space-y-3.5 bg-white dark:bg-slate-900">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400 dark:text-slate-500" />
            </span>
            <input
              type="text"
              placeholder="Search description, items, or payers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-indigo-500" /> Categories Filter (Multiselect)
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategories([])}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer select-none border ${
                  selectedCategories.length === 0
                    ? 'bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All
              </button>
              {categories.map(cat => {
                const isSelected = selectedCategories.includes(cat);
                return (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedCategories(selectedCategories.filter(c => c !== cat));
                      } else {
                        setSelectedCategories([...selectedCategories, cat]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer select-none border ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loadingExpenses ? (
            <div className="p-12 text-center text-xs text-slate-400 font-medium flex flex-col items-center justify-center gap-2 bg-slate-50 dark:bg-slate-900">
              <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></span>
              Synchronizing with Firestore ledger...
            </div>
          ) : displayedExpenses.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 font-medium flex flex-col items-center justify-center gap-1 bg-slate-50 dark:bg-slate-900">
              <Info className="w-5 h-5 text-slate-300 dark:text-slate-600" />
              {showDeleted ? "No expenses logged for this group yet." : "No active expenses logged. Toggle \"Include Deleted\" to view soft-deleted entries."}
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 font-medium flex flex-col items-center justify-center gap-1.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-850">
              <Info className="w-5 h-5 text-slate-350 dark:text-slate-600" />
              No transactions match your search query or category filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-150/80 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Paid By</th>
                  <th className="px-6 py-3">Created By</th>
                  <th className="px-6 py-3 text-right">Original Cost</th>
                  <th className="px-6 py-3 text-right">Total ({selectedCurrency})</th>
                  <th className="px-6 py-3 text-right">My Share ({selectedCurrency})</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900">
                {filteredExpenses.map((exp) => {
                  const payer = userMap.get(exp.paidBy);
                  const creator = userMap.get(exp.createdBy || exp.paidBy);
                  const isDeleted = !!exp.isDeleted;
                  const originalCost = `${exp.currency} ${Number(exp.amount).toFixed(2)}`;
                  const totalConverted = convertToSelected(exp.amount, exp.currency);

                  // Find current user's split share
                  const mySplit = exp.splits?.find(s => s.userId === currentUserId);
                  const myShareAmount = mySplit ? convertToSelected(mySplit.amount, exp.currency) : 0;

                  // Split details list
                  const splitDetails = exp.splits?.map(s => {
                     const u = userMap.get(s.userId);
                     const amtConverted = convertToSelected(s.amount, exp.currency);
                     return `${u?.name || 'User'}: ${currencySymbols[selectedCurrency] || selectedCurrency}${amtConverted.toFixed(2)}`;
                  }).join(', ');

                  // Allowed to edit / delete if they paid or they are an admin
                  const isAdmin = users.find(u => u.id === currentUserId)?.role === 'admin';
                  const canManage = !isDeleted && (exp.paidBy === currentUserId || isAdmin);

                  return (
                    <tr 
                      key={exp.id} 
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-850/30 transition group border-b border-slate-100 dark:border-slate-850/60 ${
                        isDeleted ? 'bg-rose-50/45 dark:bg-rose-950/10 text-slate-500' : ''
                      }`}
                    >
                      <td className="px-6 py-4 font-mono text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                          <span className={isDeleted ? 'line-through' : ''}>{exp.date}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`font-semibold ${isDeleted ? 'text-rose-800 dark:text-rose-400 line-through' : 'text-slate-800 dark:text-slate-300'}`}>
                          {exp.description}
                        </div>
                        <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 max-w-sm truncate" title={splitDetails}>
                          Splits: {splitDetails || 'None'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isDeleted ? 'bg-rose-100 text-rose-700' : 'bg-gray-150 dark:bg-slate-800 text-gray-650 dark:text-slate-300'
                        }`}>
                          {exp.category || 'Other'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-850 flex items-center justify-center font-bold text-[9px] text-slate-650 dark:text-slate-350 uppercase">
                            {payer?.name?.substring(0, 2) || '??'}
                          </div>
                          <span className={`text-slate-750 dark:text-slate-300 ${isDeleted ? 'line-through' : ''}`}>
                            {payer?.name || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-850 flex items-center justify-center font-bold text-[9px] text-slate-650 dark:text-slate-350 uppercase">
                            {creator?.name?.substring(0, 2) || '??'}
                          </div>
                          <span className={`text-slate-750 dark:text-slate-300 ${isDeleted ? 'line-through' : ''}`}>
                            {creator?.name || 'System'}
                          </span>
                        </div>
                      </td>
                      <td className={`px-6 py-4 text-right font-mono font-semibold whitespace-nowrap ${isDeleted ? 'text-slate-400 line-through' : 'text-slate-500 dark:text-slate-400'}`}>
                        {originalCost}
                      </td>
                      <td className={`px-6 py-4 text-right font-mono font-bold whitespace-nowrap ${isDeleted ? 'text-rose-800/80 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
                        {currencySymbols[selectedCurrency] || selectedCurrency}{totalConverted.toFixed(2)}
                      </td>
                      <td className={`px-6 py-4 text-right font-mono font-bold whitespace-nowrap ${isDeleted ? 'text-slate-400 line-through' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        {myShareAmount > 0 
                          ? `${currencySymbols[selectedCurrency] || selectedCurrency}${myShareAmount.toFixed(2)}`
                          : '-'
                        }
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {isDeleted ? (
                            <span className="text-[9px] font-bold text-rose-650 bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Deleted
                            </span>
                          ) : (
                            <>
                              {canManage && onUpdateExpense && (
                                <button
                                  onClick={() => setEditingExpense(exp)}
                                  title="Modify transaction details"
                                  className="p-1 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              )}
                              {canManage && onDeleteExpense && (
                                <button
                                  onClick={() => {
                                    setConfirmDialog({
                                      isOpen: true,
                                      title: 'Delete Expense',
                                      message: `Are you sure you want to delete the expense "${exp.description}"? This will move it to the audit log trail and adjust roommate balances.`,
                                      type: 'danger',
                                      onConfirm: async () => {
                                        setConfirmDialog(null);
                                        await onDeleteExpense(exp.id, exp.amount);
                                      }
                                    });
                                  }}
                                  title="Delete transaction"
                                  className="p-1 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* RENDER EDIT TRANSACTION MODAL */}
      {editingExpense && activeGroup && (
        <EditExpenseModal
          expense={editingExpense}
          users={users}
          groupMembers={activeGroup.members}
          currency={activeGroup.currency}
          onClose={() => setEditingExpense(null)}
          onSave={handleSaveEditedExpense}
        />
      )}

      {confirmDialog && confirmDialog.isOpen && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
