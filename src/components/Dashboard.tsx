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
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Minus,
  Maximize2,
  Flag,
  AlertTriangle,
  History,
  SlidersHorizontal,
  User2
} from 'lucide-react';
import { getExpensesForGroup } from '../lib/dbHelper.js';
import EditExpenseModal from './EditExpenseModal.js';
import FlagHistoryModal from './FlagHistoryModal.js';

interface DashboardProps {
  groups: Group[];
  expenses: Expense[]; // Active group expenses passed from App level
  users: User[];
  currentUserId: string;
  currencyRates: { [key: string]: number };
  onUpdateExpense?: (expenseId: string, updatedExpense: Omit<Expense, 'id' | 'createdAt'>, oldAmount: number) => Promise<void>;
  onDeleteExpense?: (expenseId: string, amount: number) => Promise<void>;
  categories?: string[];
}

export default function Dashboard({ 
  groups, 
  expenses, 
  users, 
  currentUserId, 
  currencyRates,
  onUpdateExpense,
  onDeleteExpense,
  categories: propCategories
}: DashboardProps) {
  // Currency switcher state
  const [selectedCurrency, setSelectedCurrency] = useState(() => localStorage.getItem('selectedCurrency') || 'INR');

  const handleCurrencyChange = (currCode: string) => {
    setSelectedCurrency(currCode);
    localStorage.setItem('selectedCurrency', currCode);
  };

  // Selected Group state for Dashboard scoping
  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(() => localStorage.getItem('isDashboardToolbarCollapsed') === 'true');

  const [minimizedCards, setMinimizedCards] = useState<{ [cardKey: string]: boolean }>(() => {
    try {
      const stored = localStorage.getItem('dashboardMinimizedCards');
      return stored ? JSON.parse(stored) : {
        settlements: true,
        balances: true,
        category_chart: true,
        trend_chart: true,
        recent_expenses: false
      };
    } catch {
      return {
        settlements: true,
        balances: true,
        category_chart: true,
        trend_chart: true,
        recent_expenses: false
      };
    }
  });

  const toggleCardMinimize = (cardKey: string) => {
    setMinimizedCards(prev => {
      const newVal = { ...prev, [cardKey]: !prev[cardKey] };
      localStorage.setItem('dashboardMinimizedCards', JSON.stringify(newVal));
      return newVal;
    });
  };

  const renderMinimizedCard = (cardKey: string, name: string, icon: React.ReactNode) => {
    return (
      <div 
        onClick={() => toggleCardMinimize(cardKey)}
        className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-3 px-4 rounded-xl shadow-xs flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850 hover:border-slate-250 dark:hover:border-slate-700 transition duration-150 group self-start w-full"
      >
        <div className="flex items-center gap-2">
          <div className="text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {icon}
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-slate-950 dark:group-hover:text-white transition-colors">
            {name}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleCardMinimize(cardKey);
          }}
          className="p-1 rounded-md hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition cursor-pointer"
          title="Maximize card"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const toggleToolbarCollapse = () => {
    setIsToolbarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('isDashboardToolbarCollapsed', String(next));
      return next;
    });
  };
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'me'>('me');
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

  // Flagging / Audit States
  const [activeFlagInputId, setActiveFlagInputId] = useState<string | null>(null);
  const [activeResolveInputId, setActiveResolveInputId] = useState<string | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [activeEditFlagInputId, setActiveEditFlagInputId] = useState<string | null>(null);
  const [flagReasonText, setFlagReasonText] = useState('');
  const [resolveCommentText, setResolveCommentText] = useState('');
  const [editFlagReasonText, setEditFlagReasonText] = useState('');
  const [historyModalExpense, setHistoryModalExpense] = useState<Expense | null>(null);

  const handleFlagExpense = async (expense: Expense) => {
    if (!flagReasonText.trim() || !onUpdateExpense) return;
    const currentUserObj = users.find(u => u.id === currentUserId);
    const currentUserName = currentUserObj?.name || 'Unknown User';
    
    const historyItem = {
      type: 'flag' as const,
      comment: flagReasonText.trim(),
      authorId: currentUserId,
      authorName: currentUserName,
      timestamp: new Date().toISOString()
    };
    
    const updatedHistory = [...(expense.flagHistory || []), historyItem];
    
    const { id, createdAt, ...payload } = {
      ...expense,
      isFlagged: true,
      flagReason: flagReasonText.trim(),
      flagHistory: updatedHistory
    };
    
    try {
      await onUpdateExpense(expense.id, payload as any, expense.amount);
      setFlagReasonText('');
      setActiveFlagInputId(null);
    } catch (err) {
      console.error('Error flagging expense:', err);
    }
  };

  const handleResolveFlag = async (expense: Expense) => {
    if (!resolveCommentText.trim() || !onUpdateExpense) return;
    const currentUserObj = users.find(u => u.id === currentUserId);
    const currentUserName = currentUserObj?.name || 'Unknown User';
    
    const historyItem = {
      type: 'resolve' as const,
      comment: resolveCommentText.trim(),
      authorId: currentUserId,
      authorName: currentUserName,
      timestamp: new Date().toISOString()
    };
    
    const updatedHistory = [...(expense.flagHistory || []), historyItem];
    
    const { id, createdAt, ...payload } = {
      ...expense,
      isFlagged: false,
      flagHistory: updatedHistory
    };
    delete (payload as any).flagReason;
    
    try {
      await onUpdateExpense(expense.id, payload as any, expense.amount);
      setResolveCommentText('');
      setActiveResolveInputId(null);
    } catch (err) {
      console.error('Error resolving flag:', err);
    }
  };

  const handleEditFlagReason = async (expense: Expense) => {
    if (!editFlagReasonText.trim() || !onUpdateExpense) return;
    const currentUserObj = users.find(u => u.id === currentUserId);
    const currentUserName = currentUserObj?.name || 'Unknown User';
    
    const historyItem = {
      type: 'flag' as const,
      comment: `Updated flag reason to: "${editFlagReasonText.trim()}"`,
      authorId: currentUserId,
      authorName: currentUserName,
      timestamp: new Date().toISOString()
    };
    
    const updatedHistory = [...(expense.flagHistory || []), historyItem];
    
    const { id, createdAt, ...payload } = {
      ...expense,
      isFlagged: true,
      flagReason: editFlagReasonText.trim(),
      flagHistory: updatedHistory
    };
    
    try {
      await onUpdateExpense(expense.id, payload as any, expense.amount);
      setEditFlagReasonText('');
      setActiveEditFlagInputId(null);
    } catch (err) {
      console.error('Error updating flag reason:', err);
    }
  };

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
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterCreatedBy, setFilterCreatedBy] = useState<string[]>([]);
  const [filterPaidBy, setFilterPaidBy] = useState<string[]>([]);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Reset filters when activeGroupId changes
  useEffect(() => {
    setSearchQuery('');
    setSelectedCategories([]);
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterCreatedBy([]);
    setFilterPaidBy([]);
    setIsFilterPanelOpen(false);
  }, [activeGroupId]);

  const categories = propCategories && propCategories.length > 0 ? propCategories : [
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
      // Sort by transaction creation time descending (newest first), falling back to date
      const sorted = list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime();
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime();
        return timeB - timeA;
      });
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

  // Filtered expenses based on search query, date range, categories, creators, and payers
  const filteredExpenses = useMemo(() => {
    return displayedExpenses.filter(exp => {
      // Date range match
      if (filterStartDate) {
        if (exp.date < filterStartDate) return false;
      }
      if (filterEndDate) {
        if (exp.date > filterEndDate) return false;
      }

      // Category match
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(exp.category);
      if (!matchesCategory) return false;

      // Created by match
      const matchesCreatedBy = filterCreatedBy.length === 0 || filterCreatedBy.includes(exp.createdBy || exp.paidBy);
      if (!matchesCreatedBy) return false;

      // Paid by match
      const matchesPaidBy = filterPaidBy.length === 0 || filterPaidBy.includes(exp.paidBy);
      if (!matchesPaidBy) return false;

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

      return matchesSearch;
    });
  }, [displayedExpenses, searchQuery, selectedCategories, filterStartDate, filterEndDate, filterCreatedBy, filterPaidBy, userMap]);

  // Sorting configurations
  const [sortField, setSortField] = useState<'date' | 'description' | 'category' | 'amount'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: 'date' | 'description' | 'category' | 'amount') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedExpenses = useMemo(() => {
    const list = [...filteredExpenses];
    return list.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === 'date') {
        valA = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime();
        valB = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime();
      } else if (sortField === 'description') {
        valA = a.description.toLowerCase();
        valB = b.description.toLowerCase();
      } else if (sortField === 'category') {
        valA = (a.category || '').toLowerCase();
        valB = (b.category || '').toLowerCase();
      } else if (sortField === 'amount') {
        valA = Number(a.amount);
        valB = Number(b.amount);
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredExpenses, sortField, sortDirection]);

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

  const groupMembers = useMemo(() => {
    if (!activeGroup) return [];
    return users.filter(u => activeGroup.members.includes(u.id));
  }, [users, activeGroup]);

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
      {isToolbarCollapsed ? (
        <div className="flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-850 px-4 py-3 rounded-2xl transition-all duration-350">
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-indigo-500 shrink-0" />
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Room:</span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-150 dark:border-slate-750 shadow-2xs">
                {activeGroup?.name || 'No Active Room'}
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider ml-1">Dashboard Currency:</span>
              <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-150 dark:border-slate-750 shadow-2xs flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                {selectedCurrency}
              </span>
            </div>
          </div>
          <button
            onClick={toggleToolbarCollapse}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-indigo-650 dark:text-indigo-400 hover:text-white hover:bg-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg transition-all cursor-pointer"
            title="Expand filter toolbar"
          >
            <span>Expand Toolbar</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-4 rounded-2xl relative transition-all duration-350">
          <div className="flex flex-col md:flex-row md:items-center gap-4 w-full md:w-auto">
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

          <button
            onClick={toggleToolbarCollapse}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:text-white hover:bg-slate-650 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg transition-all self-end md:self-auto cursor-pointer"
            title="Collapse toolbar"
          >
            <span>Collapse</span>
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">Total Balance</p>
            <h3 className={`text-xl font-extrabold ${personalBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {personalBalance >= 0 ? '+' : ''}{currencySymbols[selectedCurrency] || selectedCurrency}{personalBalance.toFixed(2)}
            </h3>
          </div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${personalBalance >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 dark:text-emerald-450' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-500 dark:text-rose-450'}`}>
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">You are owed</p>
            <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{currencySymbols[selectedCurrency] || selectedCurrency}{youAreOwed.toFixed(2)}</h3>
          </div>
          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">You owe</p>
            <h3 className="text-xl font-extrabold text-rose-500 dark:text-rose-400">{currencySymbols[selectedCurrency] || selectedCurrency}{youOwe.toFixed(2)}</h3>
          </div>
          <div className="w-10 h-10 bg-rose-50 dark:bg-rose-950/20 rounded-full flex items-center justify-center text-rose-500 dark:text-rose-400 shrink-0">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Settlements & Individual Balances Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-start">
        {minimizedCards['settlements'] ? (
          renderMinimizedCard('settlements', 'Optimized Settlement Matrix', <CheckCircle2 className="w-4.5 h-4.5 text-indigo-500" />)
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-850 p-4 sm:p-5 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                  🤝 Optimized Settlement Matrix
                </h3>
                <button
                  onClick={() => toggleCardMinimize('settlements')}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer shadow-xs"
                  title="Minimize card"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full font-mono">
                Greedy Routing
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
              Minimized debt clearance matrix calculated in **{selectedCurrency}** to solve all group splits.
            </p>

            {/* Settlement Sub-Filter Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[11px] font-semibold select-none border border-slate-200/40 dark:border-slate-700 mb-4">
              <button
                type="button"
                onClick={() => setSettlementFilter('me')}
                className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer ${
                  settlementFilter === 'me'
                    ? 'bg-white dark:bg-slate-700 text-indigo-650 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                My Dues Only
              </button>
              <button
                type="button"
                onClick={() => setSettlementFilter('all')}
                className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer ${
                  settlementFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-indigo-650 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                All Roommate Dues
              </button>
            </div>

            {(() => {
              const displayedSettlements = settlementFilter === 'me'
                ? balanceResolution.settlements.filter(s => s.fromId === currentUserId || s.toId === currentUserId)
                : balanceResolution.settlements;

              if (displayedSettlements.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-10 bg-gray-50 dark:bg-slate-850/50 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 dark:text-emerald-400 mb-2" />
                    <p className="text-xs font-medium text-gray-600 dark:text-slate-300">
                      {settlementFilter === 'me' ? 'No personal dues left!' : 'Perfect Equilibrium!'}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 text-center">
                      {settlementFilter === 'me' 
                        ? 'You are completely settled with all roommates in this group.' 
                        : 'All roommates are completely settled.'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {displayedSettlements.map((settle, i) => (
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
                        {settle.fromId === currentUserId ? (
                          <span className="font-semibold text-red-650 dark:text-red-400">You</span>
                        ) : (
                          <span className="font-semibold text-gray-800 dark:text-slate-200">{settle.fromName}</span>
                        )}
                        <span className="text-gray-400 dark:text-slate-500">pays</span>
                        {settle.toId === currentUserId ? (
                          <span className="font-semibold text-emerald-650 dark:text-emerald-400">You</span>
                        ) : (
                          <span className="font-semibold text-gray-800 dark:text-slate-200">{settle.toName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className={`font-semibold ${settle.fromId === currentUserId ? 'text-red-600 dark:text-red-400' : settle.toId === currentUserId ? 'text-emerald-650 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                          {currencySymbols[selectedCurrency] || selectedCurrency}{settle.amountSelected.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 uppercase">{selectedCurrency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Ledger Breakdown by User */}
        {minimizedCards['balances'] ? (
          renderMinimizedCard('balances', 'Splitwise Board Member Status', <TrendingUp className="w-4.5 h-4.5 text-indigo-500" />)
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-850 p-4 sm:p-5 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                👥 Splitwise Board Member Status
              </h3>
              <button
                onClick={() => toggleCardMinimize('balances')}
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer shadow-xs"
                title="Minimize card"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
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
        )}
      </div>

      {/* Analytics charts */}
      {activeExpenses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-start">
          {minimizedCards['category_chart'] ? (
            renderMinimizedCard('category_chart', 'Category Allocation Analytics', <TrendingUp className="w-4.5 h-4.5 text-indigo-500" />)
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-850 p-4 sm:p-5 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                  🍕 Allocation by Category ({selectedCurrency})
                </h3>
                <button
                  onClick={() => toggleCardMinimize('category_chart')}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer shadow-xs"
                  title="Minimize card"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">Consolidated expenditures dynamically converted on-the-fly.</p>
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
          )}

          {minimizedCards['trend_chart'] ? (
            renderMinimizedCard('trend_chart', 'Monthly Spending Velocity Analytics', <TrendingUp className="w-4.5 h-4.5 text-indigo-500" />)
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-850 p-4 sm:p-5 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                  📈 Monthly Spending Velocity ({selectedCurrency})
                </h3>
                <button
                  onClick={() => toggleCardMinimize('trend_chart')}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer shadow-xs"
                  title="Minimize card"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">A real-time visual tracking of shared pool volume.</p>
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
          )}
        </div>
      )}

      {/* DASHBOARD LOGGED EXPENSES TABLE VIEW (Requirement #3) */}
      {minimizedCards['recent_expenses'] ? (
        <div className="mt-8">
          {renderMinimizedCard('recent_expenses', 'Roommates Transaction Log Database', <Coins className="w-4.5 h-4.5 text-indigo-500" />)}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden mt-8">
          <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850/50">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-1.5">
                📜 Roommates Transaction Log Database ({activeGroup?.name || 'Group'})
              </h3>
              <button
                onClick={() => toggleCardMinimize('recent_expenses')}
                className="p-1 rounded-md hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer shadow-xs"
                title="Minimize card"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            </div>
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
            <button
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`p-1.5 rounded-lg border transition duration-150 flex items-center gap-1.5 text-[10px] font-bold cursor-pointer relative ${
                isFilterPanelOpen
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-55 dark:hover:bg-slate-850'
              }`}
              title="Toggle search and filters criteria"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
              {(selectedCategories.length > 0 || filterStartDate || filterEndDate || filterCreatedBy.length > 0 || filterPaidBy.length > 0 || searchQuery) && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ADVANCED COLLAPSIBLE FILTER CRITERIA */}
        {isFilterPanelOpen && (
          <div className="px-6 py-5 border-b border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between pb-3 border-b border-slate-150/60 dark:border-slate-850/60">
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-indigo-500" /> Advanced Filter Criteria
              </span>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategories([]);
                  setFilterStartDate('');
                  setFilterEndDate('');
                  setFilterCreatedBy([]);
                  setFilterPaidBy([]);
                }}
                className="text-[10px] font-bold text-rose-500 hover:text-rose-650 dark:hover:text-rose-450 hover:underline cursor-pointer flex items-center gap-1"
              >
                Clear All Criteria
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Text search + Date Range */}
              <div className="space-y-4">
                {/* Text Search */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-450 dark:text-slate-500 uppercase tracking-wide">
                    Description & Item Keyword Search
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-3.5 w-3.5 text-gray-400" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search description, items, or comments..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="block w-full pl-9 pr-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                {/* Date range picker */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-455 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-indigo-500" /> Transaction Date Range
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] text-slate-450 font-semibold block mb-0.5">Start Date</span>
                      <input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-200 dark:border-slate-850 rounded-xl bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-450 font-semibold block mb-0.5">End Date</span>
                      <input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-200 dark:border-slate-850 rounded-xl bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Category Multiselect */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-450 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  Category Filters (Multiselect)
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
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
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Created By & Paid By Multiselect in a grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-150/50 dark:border-slate-850/50">
              {/* Created By multiselect */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-450 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <User2 className="w-3 h-3 text-indigo-500" /> Created By (Multiselect)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {groupMembers.length === 0 ? (
                    <span className="text-[10px] text-slate-400">No group members available</span>
                  ) : (
                    groupMembers.map(member => {
                      const isSelected = filterCreatedBy.includes(member.id);
                      return (
                        <button
                          type="button"
                          key={member.id}
                          onClick={() => {
                            if (isSelected) {
                              setFilterCreatedBy(filterCreatedBy.filter(id => id !== member.id));
                            } else {
                              setFilterCreatedBy([...filterCreatedBy, member.id]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer select-none border flex items-center gap-1 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 text-white shadow-sm'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          {member.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Paid By multiselect */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-450 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Coins className="w-3 h-3 text-amber-500" /> Paid By (Multiselect)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {groupMembers.length === 0 ? (
                    <span className="text-[10px] text-slate-400">No group members available</span>
                  ) : (
                    groupMembers.map(member => {
                      const isSelected = filterPaidBy.includes(member.id);
                      return (
                        <button
                          type="button"
                          key={member.id}
                          onClick={() => {
                            if (isSelected) {
                              setFilterPaidBy(filterPaidBy.filter(id => id !== member.id));
                            } else {
                              setFilterPaidBy([...filterPaidBy, member.id]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer select-none border flex items-center gap-1 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 text-white shadow-sm'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          {member.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
                  <th onClick={() => handleSort('date')} className="px-4 py-2 cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    <span className="flex items-center gap-1">
                      Date {sortField === 'date' ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    </span>
                  </th>
                  <th onClick={() => handleSort('description')} className="px-4 py-2 cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    <span className="flex items-center gap-1">
                      Description {sortField === 'description' ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    </span>
                  </th>
                  <th onClick={() => handleSort('category')} className="px-4 py-2 cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    <span className="flex items-center gap-1">
                      Category {sortField === 'category' ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    </span>
                  </th>
                  <th className="px-4 py-2">Paid By</th>
                  <th className="px-4 py-2">Created By</th>
                  <th className="px-4 py-2 text-right">Original Cost</th>
                  <th onClick={() => handleSort('amount')} className="px-4 py-2 text-right cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    <span className="flex items-center justify-end gap-1">
                      Total ({selectedCurrency}) {sortField === 'amount' ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    </span>
                  </th>
                  <th className="px-4 py-2 text-right">My Share ({selectedCurrency})</th>
                  <th className="px-4 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900">
                {sortedExpenses.map((exp) => {
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
                      <td className="px-4 py-2.5 font-mono text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                          <span className={isDeleted ? 'line-through' : ''}>{exp.date}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-semibold ${isDeleted ? 'text-rose-800 dark:text-rose-400 line-through' : 'text-slate-800 dark:text-slate-300'}`}>
                            {exp.description}
                          </span>
                          {exp.isFlagged && (
                            <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 font-bold uppercase text-[8px] px-1.5 py-0.2 rounded tracking-wide flex items-center gap-0.5 animate-pulse shrink-0">
                              <Flag className="w-2.5 h-2.5 fill-current" /> Flagged
                            </span>
                          )}
                        </div>
                        {exp.discountType && exp.discountType !== 'none' && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                            🏷️ Discount Applied: {exp.discountType === 'percentage' ? `${exp.discountValue}%` : `${exp.currency} ${exp.discountValue}`} Off (Saved {exp.currency} {exp.discountedAmount?.toFixed(2)})
                          </div>
                        )}
                        <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 max-w-sm truncate" title={splitDetails}>
                          Splits: {splitDetails || 'None'}
                        </div>

                        {/* Flag Warning Statement */}
                        {exp.isFlagged && (
                          <div className="mt-2 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 p-2 rounded-xl text-[10px] text-amber-850 dark:text-amber-450 flex items-start gap-1.5 font-medium leading-relaxed max-w-md">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                            <div className="flex-1">
                              <span className="font-bold">FLAG REASON:</span> "{exp.flagReason}"
                            </div>
                            {exp.flagHistory && exp.flagHistory.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setHistoryModalExpense(exp)}
                                className="text-indigo-650 dark:text-indigo-400 hover:underline text-[10px] font-bold cursor-pointer shrink-0 ml-2 whitespace-nowrap"
                              >
                                View Flag Comments
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (activeEditFlagInputId === exp.id) {
                                  setActiveEditFlagInputId(null);
                                } else {
                                  setActiveEditFlagInputId(exp.id);
                                  setEditFlagReasonText(exp.flagReason || '');
                                  setActiveFlagInputId(null);
                                  setActiveResolveInputId(null);
                                }
                              }}
                              className="text-indigo-650 dark:text-indigo-400 hover:underline text-[10px] font-bold cursor-pointer shrink-0 ml-2 whitespace-nowrap"
                            >
                              Edit Reason
                            </button>
                          </div>
                        )}

                        {/* Inline Flag Comment Entry Input Collapsible */}
                        {activeFlagInputId === exp.id && (
                          <div className="mt-2.5 p-3 rounded-xl bg-amber-50/20 dark:bg-amber-950/5 border border-amber-200/50 dark:border-amber-900/30 space-y-2 max-w-md">
                            <label className="block text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                              Flag Transaction with Audit Comment
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                required
                                placeholder="State reason why this transaction is being flagged..."
                                value={flagReasonText}
                                onChange={(e) => setFlagReasonText(e.target.value)}
                                className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-850 dark:text-slate-200"
                              />
                              <button
                                type="button"
                                onClick={() => handleFlagExpense(exp)}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-3 rounded-lg flex items-center justify-center transition cursor-pointer whitespace-nowrap"
                              >
                                Submit Flag
                              </button>
                              <button
                                type="button"
                                onClick={() => { setActiveFlagInputId(null); setFlagReasonText(''); }}
                                className="text-gray-400 hover:text-gray-600 text-xs px-2 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Inline Resolve Comment Entry Input Collapsible */}
                        {activeResolveInputId === exp.id && (
                          <div className="mt-2.5 p-3 rounded-xl bg-emerald-50/20 dark:bg-emerald-950/5 border border-emerald-200/50 dark:border-emerald-900/30 space-y-2 max-w-md">
                            <label className="block text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                              Resolve Flag Action with Audit Comment
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                required
                                placeholder="Enter comment describing the resolution..."
                                value={resolveCommentText}
                                onChange={(e) => setResolveCommentText(e.target.value)}
                                className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-850 dark:text-slate-200"
                              />
                              <button
                                type="button"
                                onClick={() => handleResolveFlag(exp)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 rounded-lg flex items-center justify-center transition cursor-pointer whitespace-nowrap"
                              >
                                Resolve Flag
                              </button>
                              <button
                                type="button"
                                onClick={() => { setActiveResolveInputId(null); setResolveCommentText(''); }}
                                className="text-gray-400 hover:text-gray-600 text-xs px-2 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Inline Edit Flag Comment Entry Input Collapsible */}
                        {activeEditFlagInputId === exp.id && (
                          <div className="mt-2.5 p-3 rounded-xl bg-amber-50/20 dark:bg-amber-950/5 border border-amber-200/50 dark:border-amber-900/30 space-y-2 max-w-md">
                            <label className="block text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                              Edit Flag Reason with Audit Comment
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                required
                                placeholder="State updated reason why this transaction is being flagged..."
                                value={editFlagReasonText}
                                onChange={(e) => setEditFlagReasonText(e.target.value)}
                                className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-850 dark:text-slate-200"
                              />
                              <button
                                type="button"
                                onClick={() => handleEditFlagReason(exp)}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-3 rounded-lg flex items-center justify-center transition cursor-pointer whitespace-nowrap"
                              >
                                Save Updates
                              </button>
                              <button
                                type="button"
                                onClick={() => { setActiveEditFlagInputId(null); setEditFlagReasonText(''); }}
                                className="text-gray-400 hover:text-gray-600 text-xs px-2 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Interactive Collapsible Flag History logs (Audit Trail) */}
                        {activeHistoryId === exp.id && exp.flagHistory && exp.flagHistory.length > 0 && (
                          <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/55 dark:border-slate-850 space-y-2 max-w-md">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 flex items-center gap-1">
                              <History className="w-3 h-3 text-slate-400" /> Flag Audit History Ledger:
                            </span>
                            <div className="space-y-2 divide-y divide-slate-100 dark:divide-slate-850/60 max-h-40 overflow-y-auto pr-1">
                              {exp.flagHistory.map((h, iidx) => (
                                <div key={iidx} className="pt-2 first:pt-0 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                                  <div className="flex items-center justify-between text-[9px] text-slate-450 dark:text-slate-500 font-mono mb-0.5">
                                    <span className="font-semibold flex items-center gap-1">
                                      {h.type === 'flag' ? (
                                        <span className="text-amber-600 font-bold">⚠️ Flagged</span>
                                      ) : (
                                        <span className="text-emerald-600 font-bold">✅ Resolved</span>
                                      )}
                                      • {h.authorName || 'User'}
                                    </span>
                                    <span>{new Date(h.timestamp).toLocaleDateString()} {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <p className="italic bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-850">
                                    "{h.comment}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isDeleted ? 'bg-rose-100 text-rose-700' : 'bg-gray-150 dark:bg-slate-800 text-gray-650 dark:text-slate-300'
                        }`}>
                          {exp.category || 'Other'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-850 flex items-center justify-center font-bold text-[9px] text-slate-650 dark:text-slate-350 uppercase">
                            {payer?.name?.substring(0, 2) || '??'}
                          </div>
                          <span className={`text-slate-750 dark:text-slate-300 ${isDeleted ? 'line-through' : ''}`}>
                            {payer?.name || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-850 flex items-center justify-center font-bold text-[9px] text-slate-650 dark:text-slate-350 uppercase">
                            {creator?.name?.substring(0, 2) || '??'}
                          </div>
                          <span className={`text-slate-750 dark:text-slate-300 ${isDeleted ? 'line-through' : ''}`}>
                            {creator?.name || 'System'}
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap ${isDeleted ? 'text-slate-400 line-through' : 'text-slate-500 dark:text-slate-400'}`}>
                        {originalCost}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono font-bold whitespace-nowrap ${isDeleted ? 'text-rose-800/80 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
                        {currencySymbols[selectedCurrency] || selectedCurrency}{totalConverted.toFixed(2)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono font-bold whitespace-nowrap ${isDeleted ? 'text-slate-400 line-through' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        {myShareAmount > 0 
                          ? `${currencySymbols[selectedCurrency] || selectedCurrency}${myShareAmount.toFixed(2)}`
                          : '-'
                        }
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
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
                              {/* Interactive Flag/Unflag Button */}
                              {onUpdateExpense && (
                                <>
                                  {exp.isFlagged ? (
                                    <button
                                      onClick={() => {
                                        if (activeResolveInputId === exp.id) {
                                          setActiveResolveInputId(null);
                                        } else {
                                          setActiveResolveInputId(exp.id);
                                          setResolveCommentText('');
                                          setActiveFlagInputId(null);
                                          setActiveEditFlagInputId(null);
                                        }
                                      }}
                                      title="Resolve flag / Unflag transaction"
                                      className="p-1 text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 rounded transition cursor-pointer"
                                    >
                                      <Flag className="w-4 h-4 fill-current text-amber-500 animate-pulse" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        if (activeFlagInputId === exp.id) {
                                          setActiveFlagInputId(null);
                                        } else {
                                          setActiveFlagInputId(exp.id);
                                          setFlagReasonText('');
                                          setActiveResolveInputId(null);
                                          setActiveEditFlagInputId(null);
                                        }
                                      }}
                                      title="Flag transaction with query"
                                      className="p-1 text-slate-400 hover:text-amber-500 dark:text-slate-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                                    >
                                      <Flag className="w-4 h-4" />
                                    </button>
                                  )}

                                  {/* Flag history audit trail toggle */}
                                  {exp.flagHistory && exp.flagHistory.length > 0 && (
                                    <button
                                      onClick={() => {
                                        setHistoryModalExpense(exp);
                                      }}
                                      title="View flag and resolution audit trails"
                                      className="p-1 rounded transition cursor-pointer text-slate-400 hover:text-indigo-650 dark:text-slate-500 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                      <History className="w-4 h-4" />
                                    </button>
                                  )}
                                </>
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
    )}

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

      {historyModalExpense && (
        <FlagHistoryModal
          expense={historyModalExpense}
          onClose={() => setHistoryModalExpense(null)}
        />
      )}
    </div>
  );
}
