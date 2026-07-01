/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Group, Expense, User } from '../types.js';
import { 
  Grid, 
  ArrowRight, 
  Coins, 
  Users, 
  TrendingUp, 
  HelpCircle,
  Info,
  CheckCircle,
  TrendingDown
} from 'lucide-react';

interface SettlementMatrixProps {
  groups: Group[];
  expenses: Expense[];
  users: User[];
  currentUserId: string;
}

export default function SettlementMatrix({ 
  groups, 
  expenses, 
  users, 
  currentUserId 
}: SettlementMatrixProps) {
  // Select active group for settlement matrix view
  const [activeGroupId, setActiveGroupId] = useState<string>(groups[0]?.id || '');

  // Map of userId to User object for easy lookup
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach(u => map.set(u.id, u));
    return map;
  }, [users]);

  // Selected Group
  const selectedGroup = useMemo(() => {
    return groups.find(g => g.id === activeGroupId) || null;
  }, [groups, activeGroupId]);

  // Sync active group if groups list updates or active group is deleted
  React.useEffect(() => {
    if (groups.length > 0 && !groups.some(g => g.id === activeGroupId)) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups, activeGroupId]);

  // Filter active expenses of current group
  const activeExpenses = useMemo(() => {
    if (!activeGroupId) return [];
    return expenses.filter(e => e.groupId === activeGroupId && !e.isDeleted);
  }, [expenses, activeGroupId]);

  // Calculate standard roommate net balances
  const roommateBalances = useMemo(() => {
    if (!selectedGroup) return {};
    const balances: { [userId: string]: number } = {};
    selectedGroup.members.forEach(mId => {
      balances[mId] = 0;
    });

    activeExpenses.forEach(exp => {
      if (balances[exp.paidBy] !== undefined) {
        balances[exp.paidBy] += Number(exp.amount);
      }
      if (exp.splits) {
        exp.splits.forEach(split => {
          if (balances[split.userId] !== undefined) {
            balances[split.userId] -= Number(split.amount);
          }
        });
      }
    });
    return balances;
  }, [activeExpenses, selectedGroup]);

  // Calculate gross and net pairwise debts matrix
  const matrixData = useMemo(() => {
    if (!selectedGroup) return { gross: {}, net: {}, members: [] };

    const members = selectedGroup.members;
    
    // Initialize empty matrices
    const gross: { [fromId: string]: { [toId: string]: number } } = {};
    const net: { [fromId: string]: { [toId: string]: number } } = {};

    members.forEach(m1 => {
      gross[m1] = {};
      net[m1] = {};
      members.forEach(m2 => {
        gross[m1][m2] = 0;
        net[m1][m2] = 0;
      });
    });

    // Populate gross matrix based on active expenses splits
    activeExpenses.forEach(exp => {
      const payerId = exp.paidBy;
      if (!members.includes(payerId)) return;

      if (exp.splits) {
        exp.splits.forEach(split => {
          const splitterId = split.userId;
          if (!members.includes(splitterId)) return;
          
          if (splitterId !== payerId) {
            gross[splitterId][payerId] += Number(split.amount);
          }
        });
      }
    });

    // Compute net matrix
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const m1 = members[i];
        const m2 = members[j];
        const m1OwesM2 = gross[m1][m2];
        const m2OwesM1 = gross[m2][m1];

        if (m1OwesM2 > m2OwesM1) {
          net[m1][m2] = m1OwesM2 - m2OwesM1;
        } else if (m2OwesM1 > m1OwesM2) {
          net[m2][m1] = m2OwesM1 - m1OwesM2;
        }
      }
    }

    return {
      gross,
      net,
      members
    };
  }, [activeExpenses, selectedGroup]);

  // Greedy settlement optimization (debt simplification/normalize)
  const simplifiedSettlements = useMemo(() => {
    if (!selectedGroup || Object.keys(roommateBalances).length === 0) return [];

    const debtors: Array<{ id: string; name: string; amount: number }> = [];
    const creditors: Array<{ id: string; name: string; amount: number }> = [];

    Object.entries(roommateBalances).forEach(([userId, balVal]) => {
      const bal = balVal as number;
      const u = userMap.get(userId);
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
  }, [roommateBalances, selectedGroup, userMap]);

  return (
    <div className="space-y-8 font-sans">
      {/* Top Selector Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-bold px-2.5 py-1 rounded-md uppercase font-mono tracking-wider">
              Pairwise Financial Auditing
            </span>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mt-1">🤝 Roommate Settlement Matrix</h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Visualize net peer-to-peer debts and simplified settlement flows for roommates.
            </p>
          </div>

          <div className="w-full sm:w-64">
            <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
              Select Ledger Room
            </label>
            <select
              value={activeGroupId}
              onChange={(e) => setActiveGroupId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name} ({g.currency})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-2">
          <Users className="w-8 h-8 text-slate-300" />
          No ledger groups found. Join or create a roommate group to view its settlement matrix!
        </div>
      ) : !selectedGroup ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          Loading group information...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main 2D Matrix Grid (Left 2 Columns) */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                  <Grid className="w-4 h-4 text-indigo-500" /> Net Dues Matrix ({selectedGroup.currency})
                </h3>
                <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                  Pairwise Net Repayments
                </span>
              </div>

              <div className="p-6">
                {/* Visual Matrix Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800/80">
                        <th className="px-4 py-3 bg-slate-50/40 dark:bg-slate-850/20 text-slate-400 dark:text-slate-500 font-bold uppercase text-[9px] tracking-wider w-28 shrink-0">
                          Roommate <br /> (Owes ➜)
                        </th>
                        {matrixData.members.map(mId => {
                          const mUser = userMap.get(mId);
                          return (
                            <th key={mId} className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 text-center min-w-[100px]">
                              {mUser?.name || 'Unknown'} <br />
                              <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 font-sans tracking-tight">
                                (Is Paid)
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-850 bg-white dark:bg-slate-900">
                      {matrixData.members.map(rowId => {
                        const rowUser = userMap.get(rowId);
                        return (
                          <tr key={rowId} className="hover:bg-slate-50/30 dark:hover:bg-slate-850/20 transition-colors">
                            {/* Row Header */}
                            <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-200 bg-slate-50/20 dark:bg-slate-850/10">
                              {rowUser?.name || 'Unknown'}
                            </td>

                            {/* Cells */}
                            {matrixData.members.map(colId => {
                              const amountOwed = matrixData.net[rowId]?.[colId] || 0;
                              const isSelf = rowId === colId;

                              if (isSelf) {
                                return (
                                  <td key={colId} className="px-4 py-3.5 text-center text-slate-300 dark:text-slate-700 font-medium bg-slate-50/40 dark:bg-slate-950/20 select-none">
                                    —
                                  </td>
                                );
                              }

                              return (
                                <td 
                                  key={colId} 
                                  className={`px-4 py-3.5 text-center font-mono font-bold text-xs ${
                                    amountOwed > 0.01 
                                      ? 'text-rose-650 bg-rose-50/15 dark:bg-rose-950/5' 
                                      : 'text-slate-400 dark:text-slate-600'
                                  }`}
                                >
                                  {amountOwed > 0.01 ? (
                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                      <span className="text-rose-600 dark:text-rose-400">
                                        {selectedGroup.currency} {amountOwed.toFixed(2)}
                                      </span>
                                      <span className="text-[8px] font-sans font-medium uppercase text-rose-400 dark:text-rose-500 block tracking-tight">
                                        Pays {userMap.get(colId)?.name.split(' ')[0]}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-sans font-medium text-slate-350 dark:text-slate-700 select-none">
                                      No debt
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Caption / Helper Guide */}
                <div className="mt-6 flex items-start gap-2.5 bg-indigo-50/30 dark:bg-indigo-950/15 border border-indigo-100/50 dark:border-indigo-900/30 p-4 rounded-xl text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
                  <Info className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold block mb-0.5">💡 Interactive Matrix Reading Guide</span>
                    To read the matrix, find a roommate in the **leftmost row (who owes)** and look across their horizontal row to a roommate's **column (who is paid)**. For example, if row Alice has a cell of <span className="font-semibold font-mono text-rose-600 dark:text-rose-400">{selectedGroup.currency} 25.00</span> in column Bob, it means Alice owes Bob exactly {selectedGroup.currency} 25.00 based on net shared expenditures in this room ledger.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Repayment and Debt Simplification Column (Right 1 Column) */}
          <div className="space-y-8">
            
            {/* Net Roommate Balances Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 border-b border-slate-50 dark:border-slate-850 pb-2.5">
                <Users className="w-4 h-4 text-indigo-500" /> Roommate Balances
              </h3>

              <div className="space-y-3">
                {selectedGroup.members.map(mId => {
                  const mUser = userMap.get(mId);
                  const bal = roommateBalances[mId] || 0;
                  const hasDues = Math.abs(bal) >= 0.01;

                  let balText = 'Settled';
                  let balClass = 'text-slate-400 bg-slate-50 dark:bg-slate-950 dark:text-slate-500';
                  let icon = <CheckCircle className="w-3.5 h-3.5 text-slate-400" />;

                  if (bal > 0.01) {
                    balText = `Owed +${selectedGroup.currency} ${bal.toFixed(2)}`;
                    balClass = 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400';
                    icon = <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
                  } else if (bal < -0.01) {
                    balText = `Owes -${selectedGroup.currency} ${Math.abs(bal).toFixed(2)}`;
                    balClass = 'text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400';
                    icon = <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
                  }

                  return (
                    <div key={mId} className="flex items-center justify-between text-xs py-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {mUser?.name || 'Unknown'}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 ${balClass}`}>
                        {icon}
                        <span className="font-mono">{balText}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Normalized / Debt Simplification Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-50 dark:border-slate-850 pb-2.5">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Coins className="w-4 h-4 text-indigo-500" /> Simplified Repayments (Normalized)
                </h3>
                <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Minimized
                </span>
              </div>

              <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed">
                By modeling roommate group debts as a network, our algorithm automatically minimizes the total money transfers needed to fully settle everyone.
              </p>

              {simplifiedSettlements.length === 0 ? (
                <div className="py-8 text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50/20 dark:bg-emerald-950/10 border border-emerald-100/50 dark:border-emerald-900/20 rounded-xl flex flex-col items-center justify-center gap-1.5">
                  <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
                  All balances are settled! No payments needed.
                </div>
              ) : (
                <div className="space-y-3">
                  {simplifiedSettlements.map((debt, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 border border-slate-100 dark:border-slate-850 bg-slate-50/40 dark:bg-slate-950/20 rounded-xl space-y-2 flex flex-col justify-center"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Repayment #{idx + 1}</span>
                        <span className="font-mono font-extrabold text-indigo-650 dark:text-indigo-400 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-2 py-0.5 rounded-lg shadow-2xs">
                          {selectedGroup.currency} {debt.amount.toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between gap-1.5 text-xs">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500">Debtor</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{debt.fromName}</span>
                        </div>
                        
                        <ArrowRight className="w-4 h-4 text-indigo-500 shrink-0" />
                        
                        <div className="flex flex-col text-right">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Creditor</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{debt.toName}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
