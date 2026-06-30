/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { Group, Expense, User } from '../types.js';
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
import { TrendingUp, ArrowDownRight, ArrowUpRight, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

interface DashboardProps {
  groups: Group[];
  expenses: Expense[];
  users: User[];
  currentUserId: string;
  currencyRates: { [key: string]: number };
}

export default function Dashboard({ groups, expenses, users, currentUserId, currencyRates }: DashboardProps) {
  // Map of userId to User object for easy name lookup
  const userMap = useMemo(() => {
    return new Map<string, User>(users.map(u => [u.id, u]));
  }, [users]);

  // Convert an amount to USD for unified system chart metrics
  const convertToUSD = (amount: number, fromCurrency: string) => {
    const rate = currencyRates[fromCurrency] || 1;
    return amount / rate;
  };

  // Convert an amount from USD to group currency
  const convertFromUSD = (amountUSD: number, toCurrency: string) => {
    const rate = currencyRates[toCurrency] || 1;
    return amountUSD * rate;
  };

  // Resolve all balances and optimize settlement routes
  const balanceResolution = useMemo(() => {
    const balances: { [userId: string]: number } = {};

    // Initialize all users with 0
    users.forEach(u => {
      balances[u.id] = 0;
    });

    // Sum all expenses and subtract splits
    expenses.forEach(exp => {
      // Amount in USD for universal comparison, or if we want standard group currency we can keep it USD-based
      const amountUSD = convertToUSD(exp.amount, exp.currency);

      // PaidBy gets the credit
      if (balances[exp.paidBy] !== undefined) {
        balances[exp.paidBy] += amountUSD;
      }

      // Splits get the debit
      if (exp.splits) {
        exp.splits.forEach(split => {
          const splitAmountUSD = convertToUSD(split.amount, exp.currency);
          if (balances[split.userId] !== undefined) {
            balances[split.userId] -= splitAmountUSD;
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
      
      // Filter out small floating point dust
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
      amountUSD: number;
    }> = [];

    // Copy to avoid mutating
    const dList = debtors.map(d => ({ ...d }));
    const cList = creditors.map(c => ({ ...c }));

    let safetyVal = 0;
    while (dList.length > 0 && cList.length > 0 && safetyVal < 500) {
      safetyVal++;
      // Sort to settle largest amounts first
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
        amountUSD: settleAmount
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
  }, [expenses, users, userMap, currencyRates]);

  // Aggregate Category breakdown data for pie chart
  const categoryData = useMemo(() => {
    const dataMap: { [cat: string]: number } = {};

    expenses.forEach(exp => {
      const amountUSD = convertToUSD(exp.amount, exp.currency);
      const cat = exp.category || 'Other';
      dataMap[cat] = (dataMap[cat] || 0) + amountUSD;
    });

    const colors = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6'];
    return Object.entries(dataMap).map(([name, value], idx) => ({
      name,
      value: Math.round(value),
      color: colors[idx % colors.length]
    }));
  }, [expenses, currencyRates]);

  // Aggregate monthly spending trends for bar chart
  const trendData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dataMap: { [month: string]: number } = {};

    // Initialize all months to 0
    months.forEach(m => {
      dataMap[m] = 0;
    });

    expenses.forEach(exp => {
      const date = new Date(exp.date);
      const m = months[date.getMonth()];
      const amountUSD = convertToUSD(exp.amount, exp.currency);
      if (dataMap[m] !== undefined) {
        dataMap[m] += amountUSD;
      }
    });

    // Filter to months that have values or are the current window
    return months.map(m => ({
      month: m,
      Amount: Math.round(dataMap[m])
    }));
  }, [expenses, currencyRates]);

  const personalBalance = balanceResolution.balances[currentUserId] || 0;

  // Compute "You are owed" (gross positive splits from others when you paid) 
  // and "You owe" (gross negative splits to others when others paid)
  const { youAreOwed, youOwe } = useMemo(() => {
    let owedToYou = 0;
    let owedByYou = 0;

    expenses.forEach(exp => {
      if (exp.paidBy === currentUserId) {
        if (exp.splits) {
          exp.splits.forEach(split => {
            if (split.userId !== currentUserId) {
              owedToYou += convertToUSD(split.amount, exp.currency);
            }
          });
        }
      } else {
        if (exp.splits) {
          const mySplit = exp.splits.find(s => s.userId === currentUserId);
          if (mySplit) {
            owedByYou += convertToUSD(mySplit.amount, exp.currency);
          }
        }
      }
    });

    return {
      youAreOwed: owedToYou,
      youOwe: owedByYou
    };
  }, [expenses, currentUserId, currencyRates]);

  return (
    <div className="space-y-6 font-sans">
      {/* Overview Cards (Theme Mode) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Total Balance</p>
            <h3 className={`text-2xl font-extrabold ${personalBalance >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {personalBalance >= 0 ? '+' : ''}${personalBalance.toFixed(2)}
            </h3>
          </div>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${personalBalance >= 0 ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">You are owed</p>
            <h3 className="text-2xl font-extrabold text-slate-800">${youAreOwed.toFixed(2)}</h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">You owe</p>
            <h3 className="text-2xl font-extrabold text-rose-500">${youOwe.toFixed(2)}</h3>
          </div>
          <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 shrink-0">
            <ArrowDownRight className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Optimized Debt Settlements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight flex items-center gap-2">
              🤝 Settlement Optimizer
            </h3>
            <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-mono">
              Greedy Routing
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-6">
            Minimized debt clearance matrix. Shows the exact, most efficient transfers needed to fully settle everyone.
          </p>

          {balanceResolution.settlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="text-xs font-medium text-gray-600">Perfect Equilibrium!</p>
              <p className="text-[10px] text-gray-400 mt-1">All dues are completely squared up.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {balanceResolution.settlements.map((settle, i) => (
                <div 
                  key={i} 
                  className={`flex items-center justify-between p-3.5 border rounded-xl text-xs transition ${
                    settle.fromId === currentUserId 
                      ? 'border-red-100 bg-red-50/20' 
                      : settle.toId === currentUserId 
                      ? 'border-emerald-100 bg-emerald-50/20' 
                      : 'border-gray-100 bg-gray-50/30'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-gray-800">{settle.fromName}</span>
                    <span className="text-gray-400">pays</span>
                    <span className="font-semibold text-gray-800">{settle.toName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="font-semibold text-gray-900">${settle.amountUSD.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">USD</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ledger Breakdown by User */}
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight mb-2">👥 Splitwise Board Member Status</h3>
          <p className="text-xs text-gray-500 mb-6">
            Individual member balances. Positive implies they are owed; negative implies they owe the pool.
          </p>

          <div className="space-y-4">
            {users.map((user) => {
              const bal = balanceResolution.balances[user.id] || 0;
              return (
                <div key={user.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 text-xs uppercase">
                      {user.name.substr(0, 2)}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-gray-800">{user.name} {user.id === currentUserId && '(You)'}</h4>
                      <p className="text-[10px] text-gray-400 uppercase font-mono tracking-wider">{user.role}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-mono font-semibold ${bal > 0 ? 'text-emerald-600' : bal < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {bal > 0 ? '+' : ''}${bal.toFixed(2)} USD
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recharts Analytics Charts */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight mb-1">🍕 Allocation by Category</h3>
            <p className="text-xs text-gray-500 mb-6">Consolidated expenditures converted to USD.</p>
            <div className="h-64">
              {categoryData.length === 0 ? (
                <p className="text-xs text-gray-400 flex items-center justify-center h-full">No category data recorded.</p>
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
                    <Tooltip formatter={(value) => [`$${value} USD`, 'Amount']} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight mb-1">📈 Monthly Spending Velocity</h3>
            <p className="text-xs text-gray-500 mb-6">A real-time visual tracking of shared volume.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="month" stroke="#9ca3af" fontSize={11} tickLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} />
                  <Tooltip formatter={(value) => [`$${value} USD`, 'Total spent']} />
                  <Bar dataKey="Amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
