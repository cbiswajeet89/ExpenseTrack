/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Group, Expense, User, SplitMethod, ExpenseSplit, ExpenseItem, UserRole } from '../types.js';
import ConfirmDialog from './ConfirmDialog.js';
import { 
  Trash2, 
  Plus, 
  Send, 
  FileText, 
  UserPlus, 
  TrendingUp, 
  Coins, 
  Receipt, 
  Copy, 
  Check, 
  CheckCircle, 
  FileSpreadsheet, 
  RefreshCw,
  AlertTriangle,
  Pencil,
  UserMinus,
  Users,
  Search,
  Filter,
  ArrowRight,
  Info
} from 'lucide-react';
import EditExpenseModal from './EditExpenseModal.js';

interface GroupDetailProps {
  group: Group;
  expenses: Expense[];
  users: User[];
  currentUserId: string;
  currentUserRole: UserRole;
  onAddExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteExpense: (expenseId: string, amount: number) => Promise<void>;
  onUpdateExpense?: (expenseId: string, updatedExpense: Omit<Expense, 'id' | 'createdAt'>, oldAmount: number) => Promise<void>;
  onUpdateGroup?: (groupId: string, name: string, description: string, currency: string) => Promise<void>;
  onDeleteGroup?: (groupId: string) => Promise<void>;
  onRemoveMember?: (groupId: string, userId: string) => Promise<void>;
  categories?: string[];
}

export default function GroupDetail({ 
  group, 
  expenses, 
  users, 
  currentUserId, 
  currentUserRole,
  onAddExpense, 
  onDeleteExpense,
  onUpdateExpense,
  onUpdateGroup,
  onDeleteGroup,
  onRemoveMember,
  categories: propCategories
}: GroupDetailProps) {
  // Member records mapped
  const groupUsers = useMemo(() => {
    return users.filter(u => group.members.includes(u.id));
  }, [users, group.members]);

  const [showDeleted, setShowDeleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [ledgerView, setLedgerView] = useState<'balances' | 'simplified'>('balances');
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'me'>('me');

  const activeExpenses = useMemo(() => {
    return expenses.filter(e => !e.isDeleted);
  }, [expenses]);

  const deletedExpenses = useMemo(() => {
    return expenses.filter(e => e.isDeleted);
  }, [expenses]);

  const displayedExpenses = useMemo(() => {
    if (showDeleted) return expenses;
    return activeExpenses;
  }, [activeExpenses, expenses, showDeleted]);

  // Filtered expenses for search & category filters
  const filteredExpenses = useMemo(() => {
    return displayedExpenses.filter(exp => {
      if (exp.groupId !== group.id) return false;

      // Search match
      const queryText = searchQuery.toLowerCase().trim();
      const payerName = users.find(u => u.id === exp.paidBy)?.name || '';
      
      const matchesSearch = !queryText || 
        exp.description.toLowerCase().includes(queryText) ||
        (exp.category && exp.category.toLowerCase().includes(queryText)) ||
        payerName.toLowerCase().includes(queryText) ||
        (exp.items && exp.items.some(it => it.description.toLowerCase().includes(queryText)));

      // Category match
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(exp.category);

      return matchesSearch && matchesCategory;
    });
  }, [displayedExpenses, searchQuery, selectedCategories, group.id, users]);

  // Calculate member balances for this group
  const memberBalances = useMemo(() => {
    const balances: { [userId: string]: number } = {};
    
    // Initialize members with 0
    group.members.forEach(mId => {
      balances[mId] = 0;
    });

    // Sum all active expenses and subtract splits
    activeExpenses.forEach(exp => {
      if (exp.groupId !== group.id) return;

      // PaidBy gets the credit
      if (balances[exp.paidBy] !== undefined) {
        balances[exp.paidBy] += Number(exp.amount);
      }

      // Splits get the debit
      if (exp.splits) {
        exp.splits.forEach(split => {
          if (balances[split.userId] !== undefined) {
            balances[split.userId] -= Number(split.amount);
          }
        });
      }
    });

    return balances;
  }, [activeExpenses, group.members, group.id]);

  // Optimize settlement routes for simplified repayments (normalize)
  const simplifiedDebts = useMemo(() => {
    const debtors: Array<{ id: string; name: string; amount: number }> = [];
    const creditors: Array<{ id: string; name: string; amount: number }> = [];

    Object.entries(memberBalances).forEach(([userId, balVal]) => {
      const bal = balVal as number;
      const u = users.find(user => user.id === userId);
      if (!u) return;

      if (Math.abs(bal) < 0.01) return;

      if (bal < 0) {
        debtors.push({ id: userId, name: u.name, amount: Math.abs(bal) });
      } else if (bal > 0) {
        creditors.push({ id: userId, name: u.name, amount: bal });
      }
    });

    const settlements: Array<{
      fromId: string;
      fromName: string;
      toId: string;
      toName: string;
      amount: number;
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
        amount: settleAmount
      });

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (debtor.amount < 0.01) dList.shift();
      if (creditor.amount < 0.01) cList.shift();
    }

    return settlements;
  }, [memberBalances, users]);

  // Check if current user is admin of the group or global admin
  const isGroupAdmin = useMemo(() => {
    return group.memberRoles?.[currentUserId] === 'admin' || currentUserRole === 'admin';
  }, [group.memberRoles, currentUserId, currentUserRole]);

  // Group editing state
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState(group.name);
  const [editGroupDesc, setEditGroupDesc] = useState(group.description || '');
  const [editGroupCurrency, setEditGroupCurrency] = useState(group.currency);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  } | null>(null);

  // Sync group edit form when group changes
  React.useEffect(() => {
    setEditGroupName(group.name);
    setEditGroupDesc(group.description || '');
    setEditGroupCurrency(group.currency);
    setGroupError(null);
  }, [group]);

  const handleSettleDebt = async (debt: { fromId: string; fromName: string; toId: string; toName: string; amount: number }) => {
    const desc = `Settlement: ${debt.fromName} paid ${debt.toName}`;
    const splits = group.members.map(mId => ({
      userId: mId,
      amount: mId === debt.toId ? Number(debt.amount.toFixed(2)) : 0
    }));

    const payload: Omit<Expense, 'id' | 'createdAt'> = {
      groupId: group.id,
      description: desc,
      amount: Number(debt.amount.toFixed(2)),
      currency: group.currency,
      date: new Date().toISOString().split('T')[0],
      paidBy: debt.fromId,
      splitMethod: 'exact',
      splits,
      items: [],
      category: 'Settlement'
    };

    setConfirmDialog({
      isOpen: true,
      title: 'Record Settlement Payment',
      message: `Log a settlement payment of ${group.currency} ${debt.amount.toFixed(2)} from ${debt.fromName} to ${debt.toName}? This will adjust their roommate balances to settled.`,
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await onAddExpense(payload);
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  const handleSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(settleAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid positive settlement amount.');
      return;
    }

    if (settlePayerId === settleRecipientId) {
      alert('Payer and Recipient cannot be the same person.');
      return;
    }

    const payerUser = groupUsers.find(u => u.id === settlePayerId);
    const recipientUser = groupUsers.find(u => u.id === settleRecipientId);
    if (!payerUser || !recipientUser) return;

    const desc = `Settlement: ${payerUser.name} paid ${recipientUser.name}`;
    const splits = group.members.map(mId => ({
      userId: mId,
      amount: mId === settleRecipientId ? Number(amt.toFixed(2)) : 0
    }));

    const payload: Omit<Expense, 'id' | 'createdAt'> = {
      groupId: group.id,
      description: desc,
      amount: Number(amt.toFixed(2)),
      currency: group.currency,
      date: settleDate,
      paidBy: settlePayerId,
      splitMethod: 'exact',
      splits,
      items: [],
      category: 'Settlement'
    };

    setConfirmDialog({
      isOpen: true,
      title: 'Record Settlement Payment',
      message: `Are you sure you want to log a settlement of ${group.currency} ${amt.toFixed(2)} from ${payerUser.name} to ${recipientUser.name}?`,
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await onAddExpense(payload);
          setSettleAmount('');
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  const handleGroupUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGroupName.trim()) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Update Group Details',
      message: 'Are you sure you want to update group details? This will modify the room name, description, and currency.',
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog(null);
        setGroupError(null);
        try {
          if (onUpdateGroup) {
            await onUpdateGroup(group.id, editGroupName, editGroupDesc, editGroupCurrency);
            setIsEditingGroup(false);
          }
        } catch (err: any) {
          setGroupError(err.message || 'Failed to update group');
        }
      }
    });
  };

  // Editing state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Form States - Expense
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food & Groceries');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');

  // Form States - Settlement Tab
  const [formTab, setFormTab] = useState<'expense' | 'settlement'>('expense');
  const [settlePayerId, setSettlePayerId] = useState(currentUserId);
  const [settleRecipientId, setSettleRecipientId] = useState(() => {
    const other = group.members.find(id => id !== currentUserId);
    return other || '';
  });
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Splits Inputs (userId -> amount / shares)
  const [exactAmounts, setExactAmounts] = useState<{ [userId: string]: string }>({});
  const [shares, setShares] = useState<{ [userId: string]: string }>({});

  // Sub-items list (itemized ledger)
  const [items, setItems] = useState<Array<{ id: string; description: string; amount: string }>>([]);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  // Form States - Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('member');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Automated Monthly Report States
  const [reportMarkdown, setReportMarkdown] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('2026-06');

  const categories = propCategories && propCategories.length > 0 ? propCategories : [
    'Food & Groceries',
    'Utilities & Bills',
    'Rent & Lodging',
    'Household',
    'Entertainment & Leisure',
    'Travel & Transport',
    'Other'
  ];

  // Helper to append itemized sub-items to calculation
  const handleAddItem = () => {
    if (!newItemDesc.trim() || !newItemAmount) return;
    const id = `it_${Math.random().toString(36).substr(2, 9)}`;
    const updatedItems = [...items, { id, description: newItemDesc, amount: newItemAmount }];
    setItems(updatedItems);
    
    // Automatically recalculate total amount based on itemized entries
    const sum = updatedItems.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    setAmount(sum.toFixed(2));
    
    setNewItemDesc('');
    setNewItemAmount('');
  };

  const handleRemoveItem = (id: string) => {
    const updatedItems = items.filter(it => it.id !== id);
    setItems(updatedItems);
    const sum = updatedItems.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    setAmount(sum.toFixed(2));
  };

  // Submit Expense split logging
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmount = parseFloat(amount);
    if (!desc.trim() || isNaN(finalAmount) || finalAmount <= 0) return;

    // Build the splits depending on chosen method
    const splits: ExpenseSplit[] = [];

    if (splitMethod === 'equal') {
      const splitAmt = Number((finalAmount / groupUsers.length).toFixed(2));
      let distributed = 0;
      groupUsers.forEach((u, index) => {
        const isLast = index === groupUsers.length - 1;
        const actualAmt = isLast ? Number((finalAmount - distributed).toFixed(2)) : splitAmt;
        distributed += actualAmt;
        splits.push({ userId: u.id, amount: actualAmt });
      });
    } else if (splitMethod === 'exact') {
      let sumExact = 0;
      groupUsers.forEach(u => {
        const val = parseFloat(exactAmounts[u.id]) || 0;
        sumExact += val;
        splits.push({ userId: u.id, amount: Number(val.toFixed(2)) });
      });

      if (Math.abs(sumExact - finalAmount) > 0.05) {
        alert(`Exact splits must sum to the total amount of ${finalAmount}. Current sum is ${sumExact}.`);
        return;
      }
    } else if (splitMethod === 'shares') {
      let totalShares = 0;
      groupUsers.forEach(u => {
        const val = parseInt(shares[u.id]) || 1;
        totalShares += val;
      });

      let distributed = 0;
      groupUsers.forEach((u, index) => {
        const userShare = parseInt(shares[u.id]) || 1;
        const isLast = index === groupUsers.length - 1;
        const actualAmt = isLast 
          ? Number((finalAmount - distributed).toFixed(2)) 
          : Number(((userShare / totalShares) * finalAmount).toFixed(2));
        distributed += actualAmt;
        splits.push({ userId: u.id, amount: actualAmt, share: userShare });
      });
    }

    const payload: Omit<Expense, 'id' | 'createdAt'> = {
      groupId: group.id,
      description: desc,
      amount: finalAmount,
      currency: group.currency,
      date,
      paidBy,
      splitMethod,
      splits,
      items: items.map(it => ({ id: it.id, description: it.description, amount: parseFloat(it.amount) })),
      category
    };

    setConfirmDialog({
      isOpen: true,
      title: 'Log Split Expense',
      message: `Are you sure you want to log this expense of ${group.currency} ${finalAmount.toFixed(2)} for "${desc}"?`,
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await onAddExpense(payload);
          // Reset Form states
          setDesc('');
          setAmount('');
          setItems([]);
          setExactAmounts({});
          setShares({});
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  // Generate Email invitation simulate link
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviteLoading(true);
    setInviteLink('');
    try {
      const res = await fetch('/api/invite/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          groupName: group.name,
          email: inviteEmail,
          role: inviteRole
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInviteLink(data.inviteLink);
        setInviteEmail('');
      } else {
        alert(data.error || 'Failed to send invite');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Trigger automated monthly reports API
  const handleGenerateReport = async () => {
    setReportLoading(true);
    setReportMarkdown('');
    try {
      const res = await fetch('/api/reports/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupName: group.name,
          expenses: expenses,
          currency: group.currency,
          month: selectedMonth
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReportMarkdown(data.reportMarkdown);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 font-sans">
      
      {/* LEFT & CENTER COLUMN: Expense ledger list and addition forms */}
      <div className="lg:col-span-2 space-y-8">
        
        {/* Active group header info */}
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md uppercase font-mono tracking-wider">
                Room Workspace
              </span>
              <div className="flex items-center gap-2 mt-2">
                <h2 className="text-xl font-semibold text-gray-900">{group.name}</h2>
                {isGroupAdmin && (
                  <button
                    onClick={() => setIsEditingGroup(true)}
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded transition"
                    title="Edit group details"
                  >
                    <Pencil className="w-4.5 h-4.5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{group.description || 'Shared expense split ledger room'}</p>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold font-mono text-gray-900">
                {group.currency} {(group.totalExpense || 0).toFixed(2)}
              </span>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Accumulated Balance</p>
            </div>
          </div>

          <div className="border-t border-gray-50 mt-4 pt-4 flex flex-wrap gap-2 items-center text-xs text-gray-500">
            <span className="font-semibold">Roommates:</span>
            {groupUsers.map(gu => (
              <span key={gu.id} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                {gu.name} ({group.memberRoles[gu.id]})
              </span>
            ))}
          </div>
        </div>

        {/* LOG AN EXPENSE FORM WITH TABS */}
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight flex items-center gap-2 mb-4">
            <Coins className="w-5 h-5 text-gray-500" /> Log Split Transaction
          </h3>

          {/* Form Tabs */}
          <div className="flex border-b border-gray-100 mb-5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFormTab('expense')}
              className={`flex-1 py-2.5 text-center border-b-2 transition cursor-pointer ${
                formTab === 'expense'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Log Shared Expense
            </button>
            <button
              type="button"
              onClick={() => setFormTab('settlement')}
              className={`flex-1 py-2.5 text-center border-b-2 transition cursor-pointer ${
                formTab === 'settlement'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Record Settlement Payment
            </button>
          </div>

          {formTab === 'expense' ? (
            <form onSubmit={handleExpenseSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Expense Description</label>
                  <input
                    type="text"
                    required
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="e.g. Electricity Bill, Coffee & Donuts"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Amount ({group.currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Itemized expense list section */}
              <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
                <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                  <Receipt className="w-4 h-4 text-gray-500" /> Itemized Expense Details (Optional)
                </label>
                <p className="text-[10px] text-gray-400 mb-3">
                  Logging sub-items automatically calculates the main split sum above.
                </p>

                {items.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between text-xs bg-white border border-gray-100 px-3 py-1.5 rounded-xl">
                        <span className="font-medium text-gray-700">{it.description}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold text-gray-900">{group.currency} {it.amount}</span>
                          <button type="button" onClick={() => handleRemoveItem(it.id)} className="text-red-500 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newItemDesc}
                    onChange={(e) => setNewItemDesc(e.target.value)}
                    placeholder="Sub-item name"
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={newItemAmount}
                    onChange={(e) => setNewItemAmount(e.target.value)}
                    placeholder="Price"
                    className="w-24 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3 rounded-xl flex items-center justify-center transition shadow-md shadow-indigo-100"
                  >
                    Add Item
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Paid By</label>
                  <select
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {groupUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Split Method</label>
                  <select
                    value={splitMethod}
                    onChange={(e) => setSplitMethod(e.target.value as SplitMethod)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="equal">Equal Split</option>
                    <option value="exact">Exact Amounts</option>
                    <option value="shares">Shares Proportional</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Split Allocations Custom Options depending on selectedMethod */}
              {splitMethod === 'exact' && (
                <div className="border border-indigo-50 bg-indigo-50/10 rounded-2xl p-4 space-y-3.5">
                  <label className="block text-xs font-semibold text-indigo-700">Enter Exact Amounts for each member:</label>
                  {groupUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">{u.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-gray-400">{group.currency}</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={exactAmounts[u.id] || ''}
                          onChange={(e) => setExactAmounts({ ...exactAmounts, [u.id]: e.target.value })}
                          className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-right text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {splitMethod === 'shares' && (
                <div className="border border-indigo-50 bg-indigo-50/10 rounded-2xl p-4 space-y-3.5">
                  <label className="block text-xs font-semibold text-indigo-700">Specify Shares counts (e.g. 1, 2):</label>
                  {groupUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">{u.name}</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={shares[u.id] || ''}
                        onChange={(e) => setShares({ ...shares, [u.id]: e.target.value })}
                        className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-center text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-md shadow-indigo-100 cursor-pointer"
              >
                Add Expense Logs to Pool
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              {/* Personal Dues Quick Summary & Autofill */}
              {(() => {
                const myOwes = simplifiedDebts.filter(d => d.fromId === currentUserId);
                const owesMe = simplifiedDebts.filter(d => d.toId === currentUserId);
                
                if (myOwes.length === 0 && owesMe.length === 0) return null;

                return (
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 text-xs space-y-2.5">
                    <span className="font-bold text-slate-700 tracking-tight block">💡 Your Pending Dues (Quick Fill)</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* I owe */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">Whom You Owe:</span>
                        {myOwes.length === 0 ? (
                          <p className="text-[11px] text-gray-500 font-medium">You don't owe anyone! 🎉</p>
                        ) : (
                          <div className="space-y-1.5">
                            {myOwes.map((debt, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setSettlePayerId(currentUserId);
                                  setSettleRecipientId(debt.toId);
                                  setSettleAmount(debt.amount.toFixed(2));
                                }}
                                className="w-full text-left p-2.5 bg-white border border-rose-100 hover:border-rose-300 hover:bg-rose-50/10 rounded-xl transition-all flex items-center justify-between cursor-pointer group"
                              >
                                <div className="flex flex-col truncate max-w-[120px]">
                                  <span className="font-semibold text-gray-800">To {debt.toName}</span>
                                  <span className="text-[9px] text-gray-400 group-hover:text-indigo-600 font-medium">Click to Autofill</span>
                                </div>
                                <span className="font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md text-[11px]">
                                  {group.currency} {debt.amount.toFixed(2)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Owes me */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Who Owes You:</span>
                        {owesMe.length === 0 ? (
                          <p className="text-[11px] text-gray-500 font-medium">No one owes you.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {owesMe.map((debt, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setSettlePayerId(debt.fromId);
                                  setSettleRecipientId(currentUserId);
                                  setSettleAmount(debt.amount.toFixed(2));
                                }}
                                className="w-full text-left p-2.5 bg-white border border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/10 rounded-xl transition-all flex items-center justify-between cursor-pointer group"
                              >
                                <div className="flex flex-col truncate max-w-[120px]">
                                  <span className="font-semibold text-gray-800">{debt.fromName}</span>
                                  <span className="text-[9px] text-gray-400 group-hover:text-indigo-600 font-medium">Click to Autofill</span>
                                </div>
                                <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                                  {group.currency} {debt.amount.toFixed(2)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <form onSubmit={handleSettlementSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Debtor (Who Paid)</label>
                  <select
                    value={settlePayerId}
                    onChange={(e) => setSettlePayerId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {groupUsers.map(gu => (
                      <option key={gu.id} value={gu.id}>{gu.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Creditor (Who Received)</label>
                  <select
                    value={settleRecipientId}
                    onChange={(e) => setSettleRecipientId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {groupUsers.map(gu => (
                      <option key={gu.id} value={gu.id}>{gu.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Settlement Amount ({group.currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-md shadow-emerald-100 cursor-pointer"
              >
                Log Settlement Payment
              </button>
            </form>
            </div>
          )}
        </div>

        {/* ITEMIZED LOGGED EXPENSES LIST */}
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 border-b border-slate-50 pb-4">
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight">🧾 Shared Expense Log</h3>
            {deletedExpenses.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer text-xs select-none bg-slate-100/70 hover:bg-slate-100 px-3 py-1.5 rounded-full font-medium text-slate-650 transition-colors">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Include Deleted ({deletedExpenses.length} for Audit Trail)</span>
              </label>
            )}
          </div>
          
          {/* SEARCH & CATEGORY FILTERS */}
          <div className="space-y-3.5 mb-6 bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-2xl border border-slate-100/80 dark:border-slate-800/40">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400 dark:text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="Search description, items, or payers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-xs placeholder-gray-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
          
          {displayedExpenses.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">
              {showDeleted ? "No transactions logged in this group yet." : "No active transactions logged. Check \"Include Deleted\" for audit logs if any exist."}
            </p>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-medium bg-slate-50 rounded-2xl flex flex-col items-center justify-center gap-1.5 border border-dashed border-slate-150">
              <Info className="w-5 h-5 text-slate-300" />
              No transactions match your search query or category filter.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredExpenses.map((exp) => {
                const payingUser = users.find(u => u.id === exp.paidBy);
                const creatorUser = users.find(u => u.id === (exp.createdBy || exp.paidBy));
                const isDeleted = !!exp.isDeleted;
                const showDelete = !isDeleted && (currentUserRole === 'admin' || currentUserRole === 'manager' || exp.paidBy === currentUserId);

                return (
                  <div 
                    key={exp.id} 
                    className={`py-4 flex justify-between items-center text-xs group transition-all duration-150 ${
                      isDeleted ? 'bg-rose-50/45 border-l-4 border-rose-500 px-3 my-1.5 rounded-xl opacity-85' : ''
                    }`}
                  >
                    <div className="space-y-1">
                      <h4 className={`font-semibold ${isDeleted ? 'text-rose-800 dark:text-rose-400 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                        {exp.description}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                        <span className={`px-1.5 py-0.5 rounded uppercase font-bold tracking-wide font-mono text-[9px] ${
                          isDeleted ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {exp.category}
                        </span>
                        <span>• Paid by <strong>{payingUser?.name || 'Unknown'}</strong></span>
                        <span>• Created by <strong>{creatorUser?.name || 'System'}</strong></span>
                        <span>• {exp.date}</span>
                        {isDeleted && (
                          <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider bg-rose-100/50 px-2 py-0.5 rounded-full">
                            Deleted (Audit trail preserved)
                          </span>
                        )}
                      </div>

                      {/* Display sub-items if present */}
                      {exp.items && exp.items.length > 0 && (
                        <div className={`mt-1.5 p-2 rounded-lg space-y-1 text-[10px] ${
                          isDeleted ? 'bg-rose-100/20' : 'bg-gray-50/50'
                        }`}>
                          <span className={`font-semibold block uppercase tracking-wider text-[8px] ${
                            isDeleted ? 'text-rose-500' : 'text-gray-500'
                          }`}>
                            Itemized breakdown:
                          </span>
                          {exp.items.map((it, idx) => (
                            <div key={idx} className={`flex justify-between ${isDeleted ? 'text-rose-700/70 line-through' : 'text-gray-500'}`}>
                              <span>- {it.description}</span>
                              <span className="font-mono">{group.currency} {it.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className={`font-bold font-mono ${isDeleted ? 'text-rose-800 line-through' : 'text-gray-900'}`}>
                          {exp.currency} {Number(exp.amount).toFixed(2)}
                        </span>
                        <p className="text-[9px] text-gray-400 font-medium uppercase mt-0.5">
                          {exp.splitMethod === 'equal' ? 'Split Equally' : exp.splitMethod === 'exact' ? 'Exact Allocation' : 'Proportional Shares'}
                        </p>
                      </div>

                      {!isDeleted && showDelete && onUpdateExpense && (
                        <button
                          type="button"
                          onClick={() => setEditingExpense(exp)}
                          title="Modify transaction details"
                          className="text-gray-400 hover:text-indigo-650 transition opacity-0 group-hover:opacity-100 mr-1 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {!isDeleted && showDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDialog({
                              isOpen: true,
                              title: 'Delete Expense',
                              message: `Are you sure you want to delete this expense of ${exp.currency} ${Number(exp.amount).toFixed(2)} for "${exp.description}"? This will move it to the audit log trail and adjust group total calculations.`,
                              type: 'danger',
                              onConfirm: () => {
                                setConfirmDialog(null);
                                onDeleteExpense(exp.id, exp.amount);
                              }
                            });
                          }}
                          className="text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* RIGHT COLUMN: Invitations & Automated Monthly Reports */}
      <div className="space-y-8">
        
        {/* ROOMMATES & BALANCES LIST */}
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 tracking-tight flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-gray-500" /> Roommates Ledger
            </h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold">
              {groupUsers.length} members
            </span>
          </div>

          {/* TABS SELECTOR FOR BALANCES VS SIMPLIFIED */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold select-none border border-slate-200/40">
            <button
              type="button"
              onClick={() => setLedgerView('balances')}
              className={`flex-1 py-1.5 rounded-lg text-center transition cursor-pointer ${
                ledgerView === 'balances' 
                  ? 'bg-white text-indigo-600 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Balances
            </button>
            <button
              type="button"
              onClick={() => setLedgerView('simplified')}
              className={`flex-1 py-1.5 rounded-lg text-center transition cursor-pointer ${
                ledgerView === 'simplified' 
                  ? 'bg-white text-indigo-600 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Simplified (Normalize)
            </button>
          </div>

          {ledgerView === 'balances' ? (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto pr-1">
              {groupUsers.map(gu => {
                const bal = memberBalances[gu.id] || 0;
                const hasDues = Math.abs(bal) >= 0.01;
                const isSelf = gu.id === currentUserId;
                const isTargetAdmin = group.memberRoles[gu.id] === 'admin';
                
                // Determine balance color & sign
                let balText = 'Settled';
                let balColor = 'text-gray-400 bg-gray-50';
                if (bal > 0.01) {
                  balText = `Owed: +${group.currency} ${bal.toFixed(2)}`;
                  balColor = 'text-emerald-750 bg-emerald-50';
                } else if (bal < -0.01) {
                  balText = `Owes: -${group.currency} ${Math.abs(bal).toFixed(2)}`;
                  balColor = 'text-rose-700 bg-rose-50';
                }

                return (
                  <div key={gu.id} className="py-2.5 flex items-center justify-between text-xs group/member">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-800">{gu.name}</span>
                        {isSelf && (
                          <span className="text-[8px] bg-indigo-50 text-indigo-600 px-1 rounded uppercase font-bold font-mono">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                        <span className="capitalize font-medium">{group.memberRoles[gu.id]}</span>
                        <span>•</span>
                        <span className={`px-1.5 py-0.5 rounded font-mono font-bold ${balColor}`}>
                          {balText}
                        </span>
                      </div>
                    </div>

                    {/* Remove Button for admins */}
                    {isGroupAdmin && onRemoveMember && (!isTargetAdmin || currentUserRole === 'admin') && (
                      <button
                        type="button"
                        disabled={isSelf && isTargetAdmin}
                        onClick={() => {
                          if (hasDues) {
                            setConfirmDialog({
                              isOpen: true,
                              title: '❌ Cannot Remove Roommate',
                              message: `You cannot remove ${gu.name} because they have outstanding dues of ${group.currency} ${Math.abs(bal).toFixed(2)}. All balances must be settled (balance = 0) before a member can be removed from this room ledger.`,
                              type: 'danger',
                              onConfirm: () => setConfirmDialog(null)
                            });
                          } else {
                            setConfirmDialog({
                              isOpen: true,
                              title: '👤 Remove Roommate',
                              message: `Are you sure you want to remove ${gu.name} from "${group.name}"? They will no longer be part of this expense sharing room.`,
                              type: 'warning',
                              onConfirm: async () => {
                                setConfirmDialog(null);
                                try {
                                  await onRemoveMember(group.id, gu.id);
                                } catch (err: any) {
                                  alert(err.message || 'Failed to remove member');
                                }
                              }
                            });
                          }
                        }}
                        title={isSelf && isTargetAdmin ? "You cannot remove yourself" : `Remove ${gu.name} from group`}
                        className={`p-1.5 rounded-lg transition-all duration-200 border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 dark:text-rose-400 hover:text-rose-600 cursor-pointer opacity-0 group-hover/member:opacity-100 ${
                          isSelf && isTargetAdmin ? 'hidden' : ''
                        }`}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto pr-1 space-y-3">
              {simplifiedDebts.length === 0 ? (
                <div className="py-8 text-center text-xs text-emerald-600 font-semibold bg-emerald-50/15 border border-emerald-100/30 rounded-xl flex flex-col items-center justify-center gap-1">
                  <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                  All balances are settled!
                </div>
              ) : (
                <>
                  {/* Settlement Sub-Filter Tabs */}
                  <div className="flex bg-slate-100 p-1 rounded-xl text-[11px] font-semibold select-none border border-slate-200/40 mb-3">
                    <button
                      type="button"
                      onClick={() => setSettlementFilter('me')}
                      className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer ${
                        settlementFilter === 'me'
                          ? 'bg-white text-indigo-650 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      My Dues Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettlementFilter('all')}
                      className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer ${
                        settlementFilter === 'all'
                          ? 'bg-white text-indigo-650 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      All Roommate Dues
                    </button>
                  </div>

                  {settlementFilter === 'me' ? (
                    <div className="space-y-4">
                      {/* Section: Whom I owe */}
                      {(() => {
                        const toPay = simplifiedDebts.filter(d => d.fromId === currentUserId);
                        const toReceive = simplifiedDebts.filter(d => d.toId === currentUserId);

                        if (toPay.length === 0 && toReceive.length === 0) {
                          return (
                            <div className="py-8 text-center text-xs text-emerald-600 font-semibold bg-emerald-50/15 border border-emerald-100/30 rounded-xl flex flex-col items-center justify-center gap-1">
                              <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                              You are completely settled in this group!
                            </div>
                          );
                        }

                        return (
                          <>
                            {toPay.length > 0 && (
                              <div className="space-y-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block mb-1">
                                  💸 Whom You Owe
                                </span>
                                <div className="space-y-2">
                                  {toPay.map((debt, idx) => (
                                    <div key={idx} className="p-3 border border-red-100 bg-red-50/20 rounded-xl space-y-2.5 flex flex-col">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-gray-800">
                                          You owe <span className="text-red-600 font-bold">{debt.toName}</span>
                                        </span>
                                        <span className="font-mono font-bold text-red-700 bg-white border border-red-100 px-2 py-0.5 rounded-lg shadow-2xs">
                                          {group.currency} {debt.amount.toFixed(2)}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleSettleDebt(debt)}
                                        className="w-full py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                                      >
                                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                                        Pay & Settle Debt
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {toReceive.length > 0 && (
                              <div className="space-y-2 pt-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block mb-1">
                                  💰 Who Owes You
                                </span>
                                <div className="space-y-2">
                                  {toReceive.map((debt, idx) => (
                                    <div key={idx} className="p-3 border border-emerald-100 bg-emerald-50/20 rounded-xl space-y-2.5 flex flex-col">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-gray-800">
                                          <span className="text-emerald-700 font-bold">{debt.fromName}</span> owes you
                                        </span>
                                        <span className="font-mono font-bold text-emerald-700 bg-white border border-emerald-100 px-2 py-0.5 rounded-lg shadow-2xs">
                                          {group.currency} {debt.amount.toFixed(2)}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleSettleDebt(debt)}
                                        className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                                      >
                                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                                        Record Repayment Received
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {simplifiedDebts.map((debt, idx) => (
                        <div key={idx} className="p-3 border border-slate-100 bg-slate-50/30 rounded-xl space-y-2 flex flex-col">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-medium">Repayment #{idx + 1}</span>
                            <span className="font-mono font-bold text-slate-800 bg-white border border-slate-100 px-2 py-0.5 rounded-lg shadow-2xs">
                              {group.currency} {debt.amount.toFixed(2)}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between gap-1 text-xs pb-1 border-b border-slate-100">
                            <div className="flex flex-col">
                              <span className="text-[9px] uppercase font-bold tracking-wider text-rose-500">Pays</span>
                              <span className="font-bold text-gray-850 truncate max-w-[100px]">{debt.fromName}</span>
                            </div>
                            
                            <ArrowRight className="w-4 h-4 text-indigo-500 shrink-0" />
                            
                            <div className="flex flex-col text-right">
                              <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-500">Receives</span>
                              <span className="font-bold text-gray-850 truncate max-w-[100px]">{debt.toName}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSettleDebt(debt)}
                            className="w-full py-1 px-2 mt-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            Record Settlement
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* INVITE NEW MEMBERS VIA SECURE EMAIL LINK */}
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 tracking-tight flex items-center gap-2 mb-1.5">
            <UserPlus className="w-4.5 h-4.5 text-gray-500" /> Invite Roomies / Splitters
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Simulate role-assigned email invitation links to instantly add other splitters.
          </p>

          <form onSubmit={handleInviteSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Email Address</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="roommate@example.com"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Assigned Group Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="member">Group Member (Splitter)</option>
                <option value="manager">Billing Manager (Add / Edit Auditor)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={inviteLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-xl text-xs transition shadow-md shadow-indigo-100"
            >
              {inviteLoading ? 'Generating Token...' : 'Generate Invite Link'}
            </button>
          </form>

          {inviteLink && (
            <div className="mt-4 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-indigo-800 block uppercase tracking-wider">
                ✉️ Invitation Link Generated!
              </span>
              <p className="text-[10px] text-gray-500">
                You can copy the simulation link below and load it in a browser or paste it into the search tab to simulate a joining roommate accepting the role.
              </p>
              <div className="flex gap-1">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="flex-1 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-mono text-gray-600 focus:outline-none"
                />
                <button
                  onClick={copyInvite}
                  className="p-1.5 bg-gray-800 text-white hover:bg-gray-900 rounded-lg transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* AUTOMATED MONTHLY REPORTS MODULE */}
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 tracking-tight flex items-center gap-2 mb-1.5">
            <FileSpreadsheet className="w-4.5 h-4.5 text-gray-500" /> Automated Billing Reports
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Audits group splits, categories, and itemized logs for your current billing month.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Select Cycle</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="2026-06">June 2026</option>
                  <option value="2026-05">May 2026</option>
                  <option value="2026-04">April 2026</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={reportLoading || expenses.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 px-3 rounded-xl text-xs transition disabled:opacity-50"
                >
                  {reportLoading ? 'Analyzing...' : 'Generate Report'}
                </button>
              </div>
            </div>

            {reportMarkdown && (
              <div className="border border-indigo-100 rounded-2xl p-4 bg-indigo-50/10 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                    📊 Secure PDF / Audited Log:
                  </span>
                  <button 
                    onClick={() => {
                      const element = document.createElement("a");
                      const file = new Blob([reportMarkdown], {type: 'text/plain'});
                      element.href = URL.createObjectURL(file);
                      element.download = `Splitwise_Report_${group.name.replace(/\s+/g, '_')}.md`;
                      document.body.appendChild(element);
                      element.click();
                      document.body.removeChild(element);
                    }}
                    className="text-[10px] text-indigo-600 font-bold hover:underline"
                  >
                    Download .md
                  </button>
                </div>
                
                <div className="max-h-60 overflow-y-auto text-[11px] font-mono leading-relaxed bg-white border border-gray-100 p-3 rounded-xl text-gray-700 whitespace-pre-wrap">
                  {reportMarkdown}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          users={users}
          groupMembers={group.members}
          currency={group.currency}
          onClose={() => setEditingExpense(null)}
          onSave={onUpdateExpense!}
          categories={categories}
        />
      )}

      {isEditingGroup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col my-8">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-850 flex items-center justify-between bg-slate-50 dark:bg-slate-850/50">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Edit Group Details</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Modify workspace room details</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditingGroup(false)}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGroupUpdateSubmit} className="p-6 space-y-4">
              {groupError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400 p-2.5 rounded-xl font-semibold mb-2 text-xs">
                  ⚠️ {groupError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Group Name</label>
                <input
                  type="text"
                  required
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Description</label>
                <textarea
                  value={editGroupDesc}
                  onChange={(e) => setEditGroupDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Base Currency</label>
                <select
                  value={editGroupCurrency}
                  onChange={(e) => setEditGroupCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD (CA$)</option>
                  <option value="AUD">AUD (A$)</option>
                  <option value="JPY">JPY (¥)</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                {isGroupAdmin && onDeleteGroup && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: '⚠️ Permanent Group Deletion',
                        message: `Are you sure you want to permanently delete "${group.name}"? This action CANNOT be undone and will cascade delete all ${expenses.filter(e => e.groupId === group.id).length} transactions in this group ledger.`,
                        type: 'danger',
                        onConfirm: async () => {
                          setConfirmDialog(null);
                          try {
                            await onDeleteGroup(group.id);
                            setIsEditingGroup(false);
                          } catch (err: any) {
                            setGroupError(err.message || 'Failed to delete group');
                          }
                        }
                      });
                    }}
                    className="inline-flex items-center gap-1 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:text-rose-500 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Group
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsEditingGroup(false)}
                    className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
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
