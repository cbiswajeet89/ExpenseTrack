/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Expense } from '../types.js';
import { X, History, Flag, AlertTriangle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FlagHistoryModalProps {
  expense: Expense | null;
  onClose: () => void;
}

export default function FlagHistoryModal({ expense, onClose }: FlagHistoryModalProps) {
  if (!expense) return null;

  const flagHistory = expense.flagHistory || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs cursor-pointer"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: 'spring', duration: 0.4 }}
          className="relative w-full max-w-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] z-10"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-900 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/50">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-sans font-bold text-slate-900 dark:text-slate-100 text-sm md:text-base leading-none">
                  Flag & Audit Trail Logs
                </h3>
                <p className="text-[11px] text-slate-450 dark:text-slate-500 mt-1 uppercase tracking-wider font-semibold">
                  Transaction Audit Ledger
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Transaction Metadata Summary */}
          <div className="px-5 py-4 bg-slate-50/40 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-900/60 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-slate-850 dark:text-slate-200">
                {expense.description}
              </p>
              <p className="text-[10px] text-slate-450 dark:text-slate-500 mt-0.5">
                Logged on {new Date(expense.date || expense.createdAt || '').toLocaleDateString()}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-sans font-bold text-sm text-slate-900 dark:text-slate-100">
                {expense.currency} {Number(expense.amount).toFixed(2)}
              </p>
              <div className="mt-1 flex justify-end">
                {expense.isFlagged ? (
                  <span className="bg-amber-150/70 text-amber-850 dark:bg-amber-950 dark:text-amber-400 font-bold uppercase text-[9px] px-2 py-0.5 rounded tracking-wide flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" /> Currently Flagged
                  </span>
                ) : (
                  <span className="bg-emerald-100 text-emerald-850 dark:bg-emerald-950 dark:text-emerald-400 font-bold uppercase text-[9px] px-2 py-0.5 rounded tracking-wide flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-500" /> Resolved / Clear
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Audit Logs Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {flagHistory.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center text-center">
                <Flag className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  No audit history records found
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  This transaction hasn't been flagged or resolved yet.
                </p>
              </div>
            ) : (
              <div className="relative border-l-2 border-slate-100 dark:border-slate-850 ml-3 pl-5 space-y-5">
                {flagHistory.map((h, hIdx) => {
                  const isFlag = h.type === 'flag';
                  return (
                    <div key={hIdx} className="relative">
                      {/* Timeline Dot icon */}
                      <span className={`absolute -left-[27px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-950 ${
                        isFlag 
                          ? 'bg-amber-500 text-white' 
                          : 'bg-emerald-500 text-white'
                      }`}>
                        {isFlag ? (
                          <AlertTriangle className="h-2 w-2" />
                        ) : (
                          <CheckCircle className="h-2 w-2" />
                        )}
                      </span>

                      {/* Log Entry details */}
                      <div className="bg-slate-50/60 dark:bg-slate-900/30 border border-slate-150/40 dark:border-slate-850 p-3.5 rounded-xl space-y-1.5 shadow-2xs">
                        <div className="flex items-center justify-between text-[10px] text-slate-450 dark:text-slate-500 font-mono">
                          <span className="font-sans font-bold text-slate-700 dark:text-slate-300">
                            {h.authorName || 'System'}
                          </span>
                          <span>
                            {new Date(h.timestamp).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans font-medium whitespace-pre-wrap">
                          {h.comment}
                        </div>
                        <div className="flex justify-start">
                          <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            isFlag 
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' 
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          }`}>
                            {isFlag ? 'Transaction Flagged' : 'Flag Resolved'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Close button */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-900 flex justify-end bg-slate-50/30 dark:bg-slate-950/30">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
            >
              Close Ledger
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
