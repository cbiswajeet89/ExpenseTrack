/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Expense, User, SplitMethod, ExpenseSplit, ExpenseItem } from '../types.js';
import { X, Coins, Receipt, Trash2, Plus, Pencil } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog.js';

interface EditExpenseModalProps {
  expense: Expense;
  users: User[];
  groupMembers: string[]; // User IDs in the active group
  currency: string;
  onClose: () => void;
  onSave: (expenseId: string, updatedExpense: Omit<Expense, 'id' | 'createdAt'>, oldAmount: number) => Promise<void>;
  categories?: string[];
}

export default function EditExpenseModal({
  expense,
  users,
  groupMembers,
  currency,
  onClose,
  onSave,
  categories: propCategories
}: EditExpenseModalProps) {
  // Filter users to only include group members
  const activeGroupUsers = users.filter(u => groupMembers.includes(u.id));

  // Form States
  const [desc, setDesc] = useState(expense.description);
  const [amount, setAmount] = useState(String(expense.amount));
  const [category, setCategory] = useState(expense.category || 'Food & Groceries');
  const [date, setDate] = useState(expense.date);
  const [paidBy, setPaidBy] = useState(expense.paidBy);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(expense.splitMethod || 'equal');

  // Exact amounts & Shares states
  const [exactAmounts, setExactAmounts] = useState<{ [userId: string]: string }>({});
  const [shares, setShares] = useState<{ [userId: string]: string }>({});

  // Sub-items list
  const [items, setItems] = useState<Array<{
    id: string;
    description: string;
    amount: string;
    discountType?: 'none' | 'percentage' | 'amount';
    discountValue?: number;
    discountedAmount?: number;
    finalAmount?: number;
    splitMethod?: SplitMethod;
    splits?: ExpenseSplit[];
    splitMembers?: string[];
    splitExacts?: { [userId: string]: string };
    splitShares?: { [userId: string]: string };
  }>>(
    expense.items?.map(it => ({
      id: it.id,
      description: it.description,
      amount: String(it.amount),
      discountType: (it as any).discountType || 'none',
      discountValue: (it as any).discountValue !== undefined ? (it as any).discountValue : undefined,
      discountedAmount: (it as any).discountedAmount !== undefined ? (it as any).discountedAmount : undefined,
      finalAmount: (it as any).finalAmount !== undefined ? (it as any).finalAmount : undefined,
      splitMethod: (it as any).splitMethod || 'equal',
      splits: (it as any).splits || [],
      splitMembers: (it as any).splitMembers || (it as any).splits?.map((s: any) => s.userId) || groupMembers,
      splitExacts: (it as any).splitExacts || ((it as any).splitMethod === 'exact' ? (it as any).splits?.reduce((acc: any, s: any) => ({ ...acc, [s.userId]: String(s.amount) }), {}) : {}),
      splitShares: (it as any).splitShares || ((it as any).splitMethod === 'shares' ? (it as any).splits?.reduce((acc: any, s: any) => ({ ...acc, [s.userId]: String(s.share || 1) }), {}) : {})
    })) || []
  );

  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [newItemDiscountType, setNewItemDiscountType] = useState<'none' | 'percentage' | 'amount'>('none');
  const [newItemDiscountValue, setNewItemDiscountValue] = useState('');

  // Sub-item Splits & Editing States
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newItemSplitMethod, setNewItemSplitMethod] = useState<'equal' | 'exact' | 'shares'>('equal');
  const [newItemSplitMembers, setNewItemSplitMembers] = useState<string[]>(groupMembers);
  const [newItemSplitExacts, setNewItemSplitExacts] = useState<{ [userId: string]: string }>({});
  const [newItemSplitShares, setNewItemSplitShares] = useState<{ [userId: string]: string }>({});

  const handleEditItem = (id: string) => {
    const item = items.find(it => it.id === id);
    if (!item) return;

    setEditingItemId(item.id);
    setNewItemDesc(item.description);
    setNewItemAmount(String(item.amount));
    setNewItemDiscountType(item.discountType || 'none');
    setNewItemDiscountValue(item.discountValue !== undefined && item.discountValue !== 0 ? String(item.discountValue) : '');
    setNewItemSplitMethod(item.splitMethod || 'equal');
    setNewItemSplitMembers(item.splitMembers || groupMembers);
    setNewItemSplitExacts(item.splitExacts || {});
    setNewItemSplitShares(item.splitShares || {});
  };

  const handleCancelEditItem = () => {
    setEditingItemId(null);
    setNewItemDesc('');
    setNewItemAmount('');
    setNewItemDiscountType('none');
    setNewItemDiscountValue('');
    setNewItemSplitMethod('equal');
    setNewItemSplitMembers(groupMembers);
    setNewItemSplitExacts({});
    setNewItemSplitShares({});
  };

  // Overall Discount States
  const [overallDiscountType, setOverallDiscountType] = useState<'none' | 'percentage' | 'amount'>(expense.discountType || 'none');
  const [overallDiscountValue, setOverallDiscountValue] = useState(expense.discountValue !== undefined ? String(expense.discountValue) : '');

  // Aggregated splits from sub-items
  const aggregatedSplits = useMemo(() => {
    const sums: { [userId: string]: number } = {};
    activeGroupUsers.forEach(u => {
      sums[u.id] = 0;
    });

    if (items.length === 0) return sums;

    items.forEach(it => {
      const itemSplits = it.splits || [];
      if (itemSplits.length > 0) {
        itemSplits.forEach(s => {
          if (sums[s.userId] !== undefined) {
            sums[s.userId] += s.amount;
          } else {
            sums[s.userId] = s.amount;
          }
        });
      } else {
        const itemFinalAmt = it.discountType && it.discountType !== 'none' ? (it.finalAmount || 0) : (parseFloat(it.amount) || 0);
        const splitAmt = Number((itemFinalAmt / activeGroupUsers.length).toFixed(2));
        let distributed = 0;
        activeGroupUsers.forEach((u, index) => {
          const isLast = index === activeGroupUsers.length - 1;
          const actualAmt = isLast ? Number((itemFinalAmt - distributed).toFixed(2)) : splitAmt;
          distributed += actualAmt;
          sums[u.id] += actualAmt;
        });
      }
    });

    return sums;
  }, [items, activeGroupUsers]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Categories
  const categories = propCategories && propCategories.length > 0 ? propCategories : [
    'Food & Groceries',
    'Utilities & Bills',
    'Rent & Lodging',
    'Household',
    'Entertainment & Leisure',
    'Travel & Transport',
    'Other'
  ];

  // Initialize splits inputs on load
  useEffect(() => {
    if (expense.splitMethod === 'exact') {
      const exacts: { [userId: string]: string } = {};
      expense.splits.forEach(s => {
        exacts[s.userId] = String(s.amount);
      });
      setExactAmounts(exacts);
    } else if (expense.splitMethod === 'shares') {
      const shs: { [userId: string]: string } = {};
      expense.splits.forEach(s => {
        shs[s.userId] = String(s.share || 1);
      });
      setShares(shs);
    }
  }, [expense]);

  const handleAddItem = () => {
    if (!newItemDesc.trim() || !newItemAmount) return;
    const baseAmt = parseFloat(newItemAmount);
    if (isNaN(baseAmt) || baseAmt <= 0) return;

    let discAmt = 0;
    const discVal = parseFloat(newItemDiscountValue) || 0;
    if (newItemDiscountType === 'percentage') {
      discAmt = (discVal / 100) * baseAmt;
    } else if (newItemDiscountType === 'amount') {
      discAmt = discVal;
    }

    const calculatedFinal = Math.max(0, baseAmt - discAmt);

    // Calculate individual item splits
    const subSplits: ExpenseSplit[] = [];
    const membersToSplit = newItemSplitMembers.length > 0 ? newItemSplitMembers : groupMembers;

    if (newItemSplitMethod === 'equal') {
      const splitAmt = Number((calculatedFinal / membersToSplit.length).toFixed(2));
      let distributed = 0;
      membersToSplit.forEach((userId, index) => {
        const isLast = index === membersToSplit.length - 1;
        const actualAmt = isLast ? Number((calculatedFinal - distributed).toFixed(2)) : splitAmt;
        distributed += actualAmt;
        subSplits.push({ userId, amount: actualAmt });
      });
    } else if (newItemSplitMethod === 'exact') {
      membersToSplit.forEach(userId => {
        const val = parseFloat(newItemSplitExacts[userId]) || 0;
        subSplits.push({ userId, amount: Number(val.toFixed(2)) });
      });
    } else if (newItemSplitMethod === 'shares') {
      let totalShares = 0;
      membersToSplit.forEach(userId => {
        const val = parseInt(newItemSplitShares[userId]) || 1;
        totalShares += val;
      });

      let distributed = 0;
      membersToSplit.forEach((userId, index) => {
        const userShare = parseInt(newItemSplitShares[userId]) || 1;
        const isLast = index === membersToSplit.length - 1;
        const actualAmt = isLast
          ? Number((calculatedFinal - distributed).toFixed(2))
          : Number(((userShare / totalShares) * calculatedFinal).toFixed(2));
        distributed += actualAmt;
        subSplits.push({ userId, amount: actualAmt, share: userShare });
      });
    }

    let updatedItems;
    if (editingItemId) {
      updatedItems = items.map(it => {
        if (it.id === editingItemId) {
          return {
            id: it.id,
            description: newItemDesc.trim(),
            amount: String(baseAmt),
            discountType: newItemDiscountType,
            discountValue: newItemDiscountType !== 'none' ? discVal : undefined,
            discountedAmount: newItemDiscountType !== 'none' ? Number(discAmt.toFixed(2)) : undefined,
            finalAmount: newItemDiscountType !== 'none' ? Number(calculatedFinal.toFixed(2)) : Number(baseAmt.toFixed(2)),
            splitMethod: newItemSplitMethod,
            splits: subSplits,
            splitMembers: newItemSplitMembers,
            splitExacts: newItemSplitExacts,
            splitShares: newItemSplitShares
          };
        }
        return it;
      });
      setEditingItemId(null);
    } else {
      const id = `it_${Math.random().toString(36).substr(2, 9)}`;
      const newItem = {
        id,
        description: newItemDesc.trim(),
        amount: String(baseAmt),
        discountType: newItemDiscountType,
        discountValue: newItemDiscountType !== 'none' ? discVal : undefined,
        discountedAmount: newItemDiscountType !== 'none' ? Number(discAmt.toFixed(2)) : undefined,
        finalAmount: newItemDiscountType !== 'none' ? Number(calculatedFinal.toFixed(2)) : Number(baseAmt.toFixed(2)),
        splitMethod: newItemSplitMethod,
        splits: subSplits,
        splitMembers: newItemSplitMembers,
        splitExacts: newItemSplitExacts,
        splitShares: newItemSplitShares
      };
      updatedItems = [...items, newItem];
    }

    setItems(updatedItems);

    // Recalculate total amount
    const sum = updatedItems.reduce((acc, curr) => {
      const finalVal = curr.discountType && curr.discountType !== 'none' ? (curr.finalAmount || 0) : (parseFloat(curr.amount) || 0);
      return acc + finalVal;
    }, 0);
    setAmount(sum.toFixed(2));

    // Nullify overall discount
    setOverallDiscountType('none');
    setOverallDiscountValue('');

    setNewItemDesc('');
    setNewItemAmount('');
    setNewItemDiscountType('none');
    setNewItemDiscountValue('');
    setNewItemSplitMethod('equal');
    setNewItemSplitMembers(groupMembers);
    setNewItemSplitExacts({});
    setNewItemSplitShares({});
  };

  const handleRemoveItem = (id: string) => {
    const updatedItems = items.filter(it => it.id !== id);
    setItems(updatedItems);
    const sum = updatedItems.reduce((acc, curr) => {
      const finalVal = curr.discountType && curr.discountType !== 'none' ? (curr.finalAmount || 0) : (parseFloat(curr.amount) || 0);
      return acc + finalVal;
    }, 0);
    setAmount(sum.toFixed(2));
    if (editingItemId === id) {
      setEditingItemId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmountInput = parseFloat(amount);
    if (!desc.trim() || isNaN(finalAmountInput) || finalAmountInput <= 0) return;

    setSaving(true);
    try {
      let overallDiscAmt = 0;
      const overallDiscVal = parseFloat(overallDiscountValue) || 0;
      if (overallDiscountType === 'percentage') {
        overallDiscAmt = (overallDiscVal / 100) * finalAmountInput;
      } else if (overallDiscountType === 'amount') {
        overallDiscAmt = overallDiscVal;
      }

      const finalAmountAfterOverallDiscount = Math.max(0, finalAmountInput - overallDiscAmt);

      // Build the splits depending on chosen method, or aggregate from sub-items if present
      const splits: ExpenseSplit[] = [];

      if (items.length > 0) {
        const userSums: { [userId: string]: number } = {};
        activeGroupUsers.forEach(u => {
          userSums[u.id] = 0;
        });

        items.forEach(it => {
          const itemSplits = it.splits || [];
          if (itemSplits.length > 0) {
            itemSplits.forEach(s => {
              if (userSums[s.userId] !== undefined) {
                userSums[s.userId] += s.amount;
              } else {
                userSums[s.userId] = s.amount;
              }
            });
          } else {
            // Fallback: split equally among all activeGroupUsers
            const itemFinalAmt = it.discountType && it.discountType !== 'none' ? (it.finalAmount || 0) : (parseFloat(it.amount) || 0);
            const splitAmt = Number((itemFinalAmt / activeGroupUsers.length).toFixed(2));
            let distributed = 0;
            activeGroupUsers.forEach((u, index) => {
              const isLast = index === activeGroupUsers.length - 1;
              const actualAmt = isLast ? Number((itemFinalAmt - distributed).toFixed(2)) : splitAmt;
              distributed += actualAmt;
              userSums[u.id] += actualAmt;
            });
          }
        });

        activeGroupUsers.forEach(u => {
          splits.push({
            userId: u.id,
            amount: Number(userSums[u.id].toFixed(2))
          });
        });
      } else {
        if (splitMethod === 'equal') {
          const splitAmt = Number((finalAmountAfterOverallDiscount / activeGroupUsers.length).toFixed(2));
          let distributed = 0;
          activeGroupUsers.forEach((u, index) => {
            const isLast = index === activeGroupUsers.length - 1;
            const actualAmt = isLast ? Number((finalAmountAfterOverallDiscount - distributed).toFixed(2)) : splitAmt;
            distributed += actualAmt;
            splits.push({ userId: u.id, amount: actualAmt });
          });
        } else if (splitMethod === 'exact') {
          let sumExact = 0;
          activeGroupUsers.forEach(u => {
            const val = parseFloat(exactAmounts[u.id]) || 0;
            sumExact += val;
            splits.push({ userId: u.id, amount: Number(val.toFixed(2)) });
          });

          if (Math.abs(sumExact - finalAmountAfterOverallDiscount) > 0.05) {
            setError(`Exact splits must sum to the final discounted total amount of ${finalAmountAfterOverallDiscount.toFixed(2)}. Current sum is ${sumExact.toFixed(2)}.`);
            setSaving(false);
            return;
          }
        } else if (splitMethod === 'shares') {
          let totalShares = 0;
          activeGroupUsers.forEach(u => {
            const val = parseInt(shares[u.id]) || 1;
            totalShares += val;
          });

          let distributed = 0;
          activeGroupUsers.forEach((u, index) => {
            const userShare = parseInt(shares[u.id]) || 1;
            const isLast = index === activeGroupUsers.length - 1;
            const actualAmt = isLast
              ? Number((finalAmountAfterOverallDiscount - distributed).toFixed(2))
              : Number(((userShare / totalShares) * finalAmountAfterOverallDiscount).toFixed(2));
            distributed += actualAmt;
            splits.push({ userId: u.id, amount: actualAmt, share: userShare });
          });
        }
      }

      const updatedPayload: Omit<Expense, 'id' | 'createdAt'> = {
        groupId: expense.groupId,
        description: desc,
        amount: finalAmountAfterOverallDiscount,
        originalAmount: finalAmountInput,
        discountType: overallDiscountType,
        discountValue: overallDiscountType !== 'none' ? overallDiscVal : undefined,
        discountedAmount: overallDiscountType !== 'none' ? Number(overallDiscAmt.toFixed(2)) : undefined,
        currency: expense.currency,
        date,
        paidBy,
        splitMethod: items.length > 0 ? 'exact' : splitMethod,
        splits,
        items: items.map(it => ({
          id: it.id,
          description: it.description,
          amount: parseFloat(it.amount),
          discountType: it.discountType !== 'none' ? it.discountType : undefined,
          discountValue: it.discountType !== 'none' ? it.discountValue : undefined,
          discountedAmount: it.discountType !== 'none' ? it.discountedAmount : undefined,
          finalAmount: it.discountType !== 'none' ? it.finalAmount : parseFloat(it.amount),
          splitMethod: it.splitMethod || 'equal',
          splits: it.splits || []
        })),
        category,
        isFlagged: expense.isFlagged,
        flagReason: expense.flagReason,
        flagHistory: expense.flagHistory
      };

      setSaving(false);
      setError(null);

      setConfirmDialog({
        isOpen: true,
        title: 'Update Expense',
        message: 'Are you sure you want to update this expense with the new details?',
        onConfirm: async () => {
          setConfirmDialog(null);
          setSaving(true);
          try {
            await onSave(expense.id, updatedPayload, expense.amount);
            onClose();
          } catch (err: any) {
            setError(`Failed to save edits: ${err.message}`);
          } finally {
            setSaving(false);
          }
        }
      });
    } catch (err: any) {
      setError(`Failed to save edits: ${err.message}`);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/40">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Modify Transaction Details</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Edit this logged expense and update group splits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content/Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 p-3 rounded-xl font-medium text-xs">
              ⚠️ {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">Expense Description</label>
              <input
                type="text"
                required
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1 flex justify-between items-center">
                <span>Base Total ({currency})</span>
                {items.length > 0 && (
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium italic">
                    Calculated from sub-items
                  </span>
                )}
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={items.length > 0}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${items.length > 0 ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-white dark:bg-slate-950 dark:text-slate-100'}`}
                title={items.length > 0 ? 'Amount is calculated from sub-items' : ''}
              />
            </div>
          </div>

          {/* Overall Discount Section */}
          <div className="border border-indigo-100 dark:border-indigo-950/40 bg-indigo-50/20 dark:bg-indigo-950/5 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between bg-slate-50/40 dark:bg-slate-900/40 p-1 rounded-lg">
              <span className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300">Apply Group-level / Overall Discount</span>
              <div className="flex gap-1.5">
                {(['none', 'percentage', 'amount'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setOverallDiscountType(t);
                      if (t === 'none') setOverallDiscountValue('');
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition cursor-pointer ${
                      overallDiscountType === t
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t === 'none' ? 'No Discount' : t === 'percentage' ? 'Percentage %' : 'Fixed Amount'}
                  </button>
                ))}
              </div>
            </div>

            {overallDiscountType !== 'none' && (
              <div className="flex items-center gap-2 pt-1.5 border-t border-indigo-100/50 dark:border-indigo-900/40">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Discount Value:</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder={overallDiscountType === 'percentage' ? 'e.g. 10%' : 'e.g. 15.00'}
                  value={overallDiscountValue}
                  onChange={(e) => setOverallDiscountValue(e.target.value)}
                  className="w-28 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-slate-100 font-mono text-[10px]"
                />
                <div className="ml-auto font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                  Calculated Total: {currency}{' '}
                  {(() => {
                    const baseAmt = parseFloat(amount) || 0;
                    const discVal = parseFloat(overallDiscountValue) || 0;
                    let discAmt = 0;
                    if (overallDiscountType === 'percentage') {
                      discAmt = (discVal / 100) * baseAmt;
                    } else if (overallDiscountType === 'amount') {
                      discAmt = discVal;
                    }
                    return Math.max(0, baseAmt - discAmt).toFixed(2);
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Itemized detail */}
          <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Receipt className="w-4 h-4 text-slate-500 dark:text-slate-400" /> Itemized Expense Details (Optional)
            </label>
            <p className="text-[10px] text-slate-400 dark:text-slate-550">
              Editing sub-items dynamically updates the main split sum above.
            </p>

            {items.length > 0 && (
              <div className="space-y-1.5">
                {items.map((it) => {
                  const hasItemDisc = it.discountType && it.discountType !== 'none' && parseFloat(String(it.discountValue || '0')) > 0;
                  return (
                    <div key={it.id} className="flex flex-col text-[11px] bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-800 p-3 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{it.description}</span>
                          {hasItemDisc && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                              Discount: {it.discountType === 'percentage' ? `${it.discountValue}%` : `${currency} ${Number(it.discountValue).toFixed(2)}`} (-{currency} {Number(it.discountedAmount).toFixed(2)})
                            </span>
                          )}
                          {it.splits && it.splits.length > 0 && (
                            <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium flex flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
                              <strong className="uppercase text-[8px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-1 py-0.2 rounded-sm">{it.splitMethod || 'equal'}</strong>
                              {it.splits.map(s => {
                                const uName = activeGroupUsers.find(u => u.id === s.userId)?.name || 'Unknown';
                                return `${uName}: ${currency}${s.amount.toFixed(2)}`;
                              }).join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            {hasItemDisc ? (
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="line-through text-slate-400 dark:text-slate-500">{currency} {Number(it.amount).toFixed(2)}</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{currency} {Number(it.finalAmount).toFixed(2)}</span>
                              </div>
                            ) : (
                              <span className="font-mono font-bold text-slate-850 dark:text-slate-200">{currency} {Number(it.amount).toFixed(2)}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEditItem(it.id)}
                            className="text-indigo-500 hover:text-indigo-600 p-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            title="Edit this sub-item"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(it.id)}
                            className="text-red-500 hover:text-red-600 p-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            title="Remove this sub-item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-3 bg-slate-100/30 dark:bg-slate-950/20 p-3.5 rounded-xl border border-slate-150 dark:border-slate-800">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {editingItemId ? '⚡ Editing Sub-item' : '📝 Add New Sub-item'}
                </span>
                {editingItemId && (
                  <button
                    type="button"
                    onClick={handleCancelEditItem}
                    className="text-[10px] text-rose-500 hover:underline cursor-pointer font-bold"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  placeholder="Sub-item name (e.g., Apple Juice)"
                  className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 dark:text-slate-100 text-xs"
                />
                <input
                  type="number"
                  step="0.01"
                  value={newItemAmount}
                  onChange={(e) => setNewItemAmount(e.target.value)}
                  placeholder="Price"
                  className="w-24 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 dark:text-slate-100 font-mono text-xs"
                />
              </div>

              <div className="flex items-center gap-2 bg-slate-100/50 dark:bg-slate-950/40 p-2 rounded-xl flex-wrap">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Item Discount:</span>
                <select
                  value={newItemDiscountType}
                  onChange={(e) => {
                    setNewItemDiscountType(e.target.value as any);
                    if (e.target.value === 'none') setNewItemDiscountValue('');
                  }}
                  className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-slate-100 text-[10px] cursor-pointer"
                >
                  <option value="none">No Discount</option>
                  <option value="percentage">Percentage (%)</option>
                  <option value="amount">Fixed Amount</option>
                </select>
                {newItemDiscountType !== 'none' && (
                  <input
                    type="number"
                    step="0.01"
                    placeholder={newItemDiscountType === 'percentage' ? 'e.g. 15%' : 'e.g. 5.00'}
                    value={newItemDiscountValue}
                    onChange={(e) => setNewItemDiscountValue(e.target.value)}
                    className="w-20 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-slate-100 font-mono text-[10px]"
                  />
                )}
              </div>

              {/* Splits configuration */}
              <div className="space-y-2 border-t border-dashed border-slate-200 dark:border-slate-800 pt-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Split item among:
                  </span>
                  <select
                    value={newItemSplitMethod}
                    onChange={(e) => {
                      setNewItemSplitMethod(e.target.value as any);
                    }}
                    className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 dark:text-slate-100 text-[10px] cursor-pointer"
                  >
                    <option value="equal">Split Equally</option>
                    <option value="exact">Exact Amounts</option>
                    <option value="shares">By Shares</option>
                  </select>
                </div>

                <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-950 p-2.5 rounded-xl border border-slate-150 dark:border-slate-800">
                  {activeGroupUsers.map(u => {
                    const isIncluded = newItemSplitMembers.includes(u.id);
                    return (
                      <div key={u.id} className="flex items-center gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-800">
                        <input
                          type="checkbox"
                          checked={isIncluded}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewItemSplitMembers([...newItemSplitMembers, u.id]);
                            } else {
                              setNewItemSplitMembers(newItemSplitMembers.filter(id => id !== u.id));
                            }
                          }}
                          className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="font-medium text-slate-700 dark:text-slate-300">{u.name}</span>
                        {isIncluded && newItemSplitMethod === 'exact' && (
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={newItemSplitExacts[u.id] || ''}
                            onChange={(e) => {
                              setNewItemSplitExacts({ ...newItemSplitExacts, [u.id]: e.target.value });
                            }}
                            className="w-16 px-1 py-0.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 font-mono text-[10px] text-right rounded"
                          />
                        )}
                        {isIncluded && newItemSplitMethod === 'shares' && (
                          <input
                            type="number"
                            min="1"
                            placeholder="1"
                            value={newItemSplitShares[u.id] || ''}
                            onChange={(e) => {
                              setNewItemSplitShares({ ...newItemSplitShares, [u.id]: e.target.value });
                            }}
                            className="w-10 px-1 py-0.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 font-mono text-[10px] text-center rounded"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center pt-1.5">
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium font-mono">
                    {(() => {
                      const amt = parseFloat(newItemAmount) || 0;
                      let dAmt = 0;
                      const dVal = parseFloat(newItemDiscountValue) || 0;
                      if (newItemDiscountType === 'percentage') {
                        dAmt = (dVal / 100) * amt;
                      } else if (newItemDiscountType === 'amount') {
                        dAmt = dVal;
                      }
                      const final = Math.max(0, amt - dAmt);
                      if (final > 0) {
                        return (
                          <span>
                            Final Item: {currency} {final.toFixed(2)}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-1.5 rounded-xl transition shadow-md shadow-indigo-100 cursor-pointer"
                  >
                    {editingItemId ? 'Update Item' : 'Add Item'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">Paid By</label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/20"
              >
                {activeGroupUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1 flex justify-between items-center">
                <span>Split Method</span>
                {items.length > 0 && (
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium italic">
                    Aggregated from items
                  </span>
                )}
              </label>
              <select
                value={items.length > 0 ? 'exact' : splitMethod}
                onChange={(e) => setSplitMethod(e.target.value as SplitMethod)}
                disabled={items.length > 0}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/20 ${items.length > 0 ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : ''}`}
              >
                {items.length > 0 ? (
                  <option value="exact">Aggregated from Sub-items</option>
                ) : (
                  <>
                    <option value="equal">Equal Split</option>
                    <option value="exact">Exact Amounts</option>
                    <option value="shares">Shares Proportional</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/20"
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">Transaction Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 bg-white dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          {/* Exact allocations or Shares splits custom input list */}
          {items.length > 0 ? (
            <div className="border border-indigo-50 dark:border-indigo-950 bg-indigo-50/10 dark:bg-indigo-950/10 rounded-xl p-4 space-y-3">
              <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex justify-between items-center">
                <span>Calculated Roommate Splits (Read-only):</span>
                <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-400 px-2 py-0.5 rounded-md uppercase font-bold font-mono">
                  Sub-items Aggregated
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeGroupUsers.map(u => {
                  const amtVal = aggregatedSplits[u.id] || 0;
                  return (
                    <div key={u.id} className="flex items-center justify-between text-xs bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 px-3 py-2 rounded-xl">
                      <span className="font-medium text-gray-700 dark:text-slate-300">{u.name}</span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {currency} {amtVal.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {splitMethod === 'exact' && (
                <div className="border border-indigo-50 dark:border-indigo-950 bg-indigo-50/10 dark:bg-indigo-950/10 rounded-xl p-4 space-y-2.5">
                  <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300">Exact Amounts for each roommate:</label>
                  {activeGroupUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{u.name}</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-slate-400 dark:text-slate-500">{currency}</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={exactAmounts[u.id] || ''}
                          onChange={(e) => setExactAmounts({ ...exactAmounts, [u.id]: e.target.value })}
                          className="w-24 px-2 py-1 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 rounded-lg text-right text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {splitMethod === 'shares' && (
                <div className="border border-indigo-50 dark:border-indigo-950 bg-indigo-50/10 dark:bg-indigo-950/10 rounded-xl p-4 space-y-2.5">
                  <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300">Specify Shares count (e.g. 1, 2, 3):</label>
                  {activeGroupUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{u.name}</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={shares[u.id] || ''}
                        onChange={(e) => setShares({ ...shares, [u.id]: e.target.value })}
                        className="w-16 px-2 py-1 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 rounded-lg text-center font-mono text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Modal Footer actions */}
          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition font-medium bg-white dark:bg-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition shadow-md shadow-indigo-100 dark:shadow-none disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

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
