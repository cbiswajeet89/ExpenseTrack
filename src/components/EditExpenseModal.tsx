/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Expense, User, SplitMethod, ExpenseSplit, ExpenseItem } from '../types.js';
import { X, Coins, Receipt, Trash2, Plus } from 'lucide-react';
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
  }>>(
    expense.items?.map(it => ({
      id: it.id,
      description: it.description,
      amount: String(it.amount),
      discountType: (it as any).discountType || 'none',
      discountValue: (it as any).discountValue !== undefined ? (it as any).discountValue : undefined,
      discountedAmount: (it as any).discountedAmount !== undefined ? (it as any).discountedAmount : undefined,
      finalAmount: (it as any).finalAmount !== undefined ? (it as any).finalAmount : undefined
    })) || []
  );

  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [newItemDiscountType, setNewItemDiscountType] = useState<'none' | 'percentage' | 'amount'>('none');
  const [newItemDiscountValue, setNewItemDiscountValue] = useState('');

  // Overall Discount States
  const [overallDiscountType, setOverallDiscountType] = useState<'none' | 'percentage' | 'amount'>(expense.discountType || 'none');
  const [overallDiscountValue, setOverallDiscountValue] = useState(expense.discountValue !== undefined ? String(expense.discountValue) : '');

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

    const id = `it_${Math.random().toString(36).substr(2, 9)}`;
    const newItem = {
      id,
      description: newItemDesc,
      amount: String(baseAmt),
      discountType: newItemDiscountType,
      discountValue: newItemDiscountType !== 'none' ? discVal : undefined,
      discountedAmount: newItemDiscountType !== 'none' ? Number(discAmt.toFixed(2)) : undefined,
      finalAmount: newItemDiscountType !== 'none' ? Number(calculatedFinal.toFixed(2)) : Number(baseAmt.toFixed(2))
    };

    const updatedItems = [...items, newItem];
    setItems(updatedItems);

    // Automatically recalculate total amount based on final itemized entries
    const sum = updatedItems.reduce((acc, curr) => {
      const finalVal = curr.discountType && curr.discountType !== 'none' ? (curr.finalAmount || 0) : (parseFloat(curr.amount) || 0);
      return acc + finalVal;
    }, 0);
    setAmount(sum.toFixed(2));

    setNewItemDesc('');
    setNewItemAmount('');
    setNewItemDiscountType('none');
    setNewItemDiscountValue('');
  };

  const handleRemoveItem = (id: string) => {
    const updatedItems = items.filter(it => it.id !== id);
    setItems(updatedItems);
    const sum = updatedItems.reduce((acc, curr) => {
      const finalVal = curr.discountType && curr.discountType !== 'none' ? (curr.finalAmount || 0) : (parseFloat(curr.amount) || 0);
      return acc + finalVal;
    }, 0);
    setAmount(sum.toFixed(2));
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

      const splits: ExpenseSplit[] = [];

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
        splitMethod,
        splits,
        items: items.map(it => ({
          id: it.id,
          description: it.description,
          amount: parseFloat(it.amount),
          discountType: it.discountType !== 'none' ? it.discountType : undefined,
          discountValue: it.discountType !== 'none' ? it.discountValue : undefined,
          discountedAmount: it.discountType !== 'none' ? it.discountedAmount : undefined,
          finalAmount: it.discountType !== 'none' ? it.finalAmount : parseFloat(it.amount)
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
      <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-indigo-600 animate-pulse" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">Modify Transaction Details</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Edit this logged expense and update group splits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content/Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl font-medium text-xs">
              ⚠️ {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Expense Description</label>
              <input
                type="text"
                required
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Base Total ({currency})</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
              />
            </div>
          </div>

          {/* Overall Discount Section */}
          <div className="border border-indigo-100 bg-indigo-50/20 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between bg-slate-50/40 p-1 rounded-lg">
              <span className="text-[11px] font-semibold text-indigo-800">Apply Group-level / Overall Discount</span>
              <div className="flex gap-1.5">
                {(['none', 'percentage', 'amount'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setOverallDiscountType(t);
                      if (t === 'none') setOverallDiscountValue('');
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition ${
                      overallDiscountType === t
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t === 'none' ? 'No Discount' : t === 'percentage' ? 'Percentage %' : 'Fixed Amount'}
                  </button>
                ))}
              </div>
            </div>

            {overallDiscountType !== 'none' && (
              <div className="flex items-center gap-2 pt-1.5 border-t border-indigo-100/50">
                <span className="text-[10px] text-slate-500">Discount Value:</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder={overallDiscountType === 'percentage' ? 'e.g. 10%' : 'e.g. 15.00'}
                  value={overallDiscountValue}
                  onChange={(e) => setOverallDiscountValue(e.target.value)}
                  className="w-28 px-2 py-1 border border-slate-200 rounded-lg bg-white font-mono text-[10px]"
                />
                <div className="ml-auto font-mono text-[10px] text-emerald-600 font-bold">
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
          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1">
              <Receipt className="w-4 h-4 text-slate-500" /> Itemized Expense Details (Optional)
            </label>
            <p className="text-[10px] text-slate-400">
              Editing sub-items dynamically updates the main split sum above.
            </p>

            {items.length > 0 && (
              <div className="space-y-1.5">
                {items.map((it) => {
                  const isDisc = it.discountType && it.discountType !== 'none';
                  return (
                    <div key={it.id} className="flex flex-col text-[11px] bg-white border border-slate-150 p-2.5 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">{it.description}</span>
                        <div className="flex items-center gap-2.5">
                          {isDisc ? (
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="line-through text-slate-400">{currency} {it.amount}</span>
                              <span className="font-bold text-emerald-600">{currency} {it.finalAmount}</span>
                            </div>
                          ) : (
                            <span className="font-mono font-bold text-slate-800">{currency} {it.amount}</span>
                          )}
                          <button type="button" onClick={() => handleRemoveItem(it.id)} className="text-red-500 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {isDisc && (
                        <div className="text-[10px] text-emerald-600 bg-emerald-50/50 px-2 py-0.5 rounded-md inline-block self-start font-medium">
                          Saved {it.discountType === 'percentage' ? `${it.discountValue}%` : `${currency}${it.discountValue}`} (-{currency}{it.discountedAmount})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  placeholder="Sub-item name (e.g., Apple Juice)"
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs"
                />
                <input
                  type="number"
                  step="0.01"
                  value={newItemAmount}
                  onChange={(e) => setNewItemAmount(e.target.value)}
                  placeholder="Price"
                  className="w-24 px-3 py-1.5 border border-slate-200 rounded-xl bg-white font-mono text-xs"
                />
              </div>

              <div className="flex items-center gap-2 bg-slate-100/50 p-2 rounded-xl">
                <span className="text-[10px] text-slate-500 font-semibold">Item Discount:</span>
                <select
                  value={newItemDiscountType}
                  onChange={(e) => {
                    setNewItemDiscountType(e.target.value as any);
                    if (e.target.value === 'none') setNewItemDiscountValue('');
                  }}
                  className="px-2 py-1 border border-slate-200 rounded-lg bg-white text-[10px]"
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
                    className="w-20 px-2 py-1 border border-slate-200 rounded-lg bg-white font-mono text-[10px]"
                  />
                )}
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[10px] px-3.5 py-1.5 rounded-lg transition shadow-sm"
                >
                  Add Item
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Paid By</label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:ring-2 focus:ring-indigo-500/20"
              >
                {activeGroupUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Split Method</label>
              <select
                value={splitMethod}
                onChange={(e) => setSplitMethod(e.target.value as SplitMethod)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:ring-2 focus:ring-indigo-500/20"
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
                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:ring-2 focus:ring-indigo-500/20"
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Transaction Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 bg-white"
            />
          </div>

          {/* Exact allocations or Shares splits custom input list */}
          {splitMethod === 'exact' && (
            <div className="border border-indigo-50 bg-indigo-50/10 rounded-xl p-4 space-y-2.5">
              <label className="block text-xs font-semibold text-indigo-700">Exact Amounts for each roommate:</label>
              {activeGroupUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{u.name}</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-slate-400">{currency}</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={exactAmounts[u.id] || ''}
                      onChange={(e) => setExactAmounts({ ...exactAmounts, [u.id]: e.target.value })}
                      className="w-24 px-2 py-1 border border-gray-200 bg-white rounded-lg text-right text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {splitMethod === 'shares' && (
            <div className="border border-indigo-50 bg-indigo-50/10 rounded-xl p-4 space-y-2.5">
              <label className="block text-xs font-semibold text-indigo-700">Specify Shares count (e.g. 1, 2, 3):</label>
              {activeGroupUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{u.name}</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={shares[u.id] || ''}
                    onChange={(e) => setShares({ ...shares, [u.id]: e.target.value })}
                    className="w-16 px-2 py-1 border border-gray-200 bg-white rounded-lg text-center font-mono text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Modal Footer actions */}
          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition shadow-md shadow-indigo-100 disabled:opacity-50"
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
