/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Group, Expense, User, SplitMethod, ExpenseSplit, ExpenseItem, UserRole } from '../types.js';
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
  FileSpreadsheet, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface GroupDetailProps {
  group: Group;
  expenses: Expense[];
  users: User[];
  currentUserId: string;
  currentUserRole: UserRole;
  onAddExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteExpense: (expenseId: string, amount: number) => Promise<void>;
}

export default function GroupDetail({ 
  group, 
  expenses, 
  users, 
  currentUserId, 
  currentUserRole,
  onAddExpense, 
  onDeleteExpense 
}: GroupDetailProps) {
  // Member records mapped
  const groupUsers = useMemo(() => {
    return users.filter(u => group.members.includes(u.id));
  }, [users, group.members]);

  // Form States - Expense
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food & Groceries');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  
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

  const categories = [
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
              <h2 className="text-xl font-semibold text-gray-900 mt-2">{group.name}</h2>
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

        {/* LOG AN EXPENSE FORM */}
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight flex items-center gap-2 mb-4">
            <Coins className="w-5 h-5 text-gray-500" /> Log Split Transaction
          </h3>

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
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-md shadow-indigo-100"
            >
              Add Expense Logs to Pool
            </button>
          </form>
        </div>

        {/* ITEMIZED LOGGED EXPENSES LIST */}
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight mb-4">🧾 Shared Expense Log</h3>
          
          {expenses.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No transactions logged in this group yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {expenses.map((exp) => {
                const payingUser = users.find(u => u.id === exp.paidBy);
                const showDelete = currentUserRole === 'admin' || currentUserRole === 'manager' || exp.paidBy === currentUserId;

                return (
                  <div key={exp.id} className="py-4 flex justify-between items-center text-xs group">
                    <div className="space-y-1">
                      <h4 className="font-semibold text-gray-800">{exp.description}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide font-mono text-[9px]">
                          {exp.category}
                        </span>
                        <span>• Paid by <strong>{payingUser?.name || 'Unknown'}</strong></span>
                        <span>• {exp.date}</span>
                      </div>

                      {/* Display sub-items if present */}
                      {exp.items && exp.items.length > 0 && (
                        <div className="mt-1.5 bg-gray-50/50 p-2 rounded-lg space-y-1 text-[10px]">
                          <span className="font-semibold text-gray-500 block uppercase tracking-wider text-[8px]">
                            Itemized breakdown:
                          </span>
                          {exp.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-gray-500">
                              <span>- {it.description}</span>
                              <span className="font-mono">{group.currency} {it.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="font-bold font-mono text-gray-900">
                          {exp.currency} {Number(exp.amount).toFixed(2)}
                        </span>
                        <p className="text-[9px] text-gray-400 font-medium uppercase mt-0.5">
                          {exp.splitMethod === 'equal' ? 'Split Equally' : exp.splitMethod === 'exact' ? 'Exact Allocation' : 'Proportional Shares'}
                        </p>
                      </div>

                      {showDelete && (
                        <button
                          type="button"
                          onClick={() => onDeleteExpense(exp.id, exp.amount)}
                          className="text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
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
                <option value="admin">Group Administrator (Full Permissions)</option>
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

    </div>
  );
}
