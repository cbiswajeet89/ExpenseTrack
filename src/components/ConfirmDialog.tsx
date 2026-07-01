/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, HelpCircle, Info } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'warning',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const typeConfig = {
    danger: {
      icon: <AlertTriangle className="w-6 h-6 text-red-600" />,
      iconBg: 'bg-red-50',
      btnBg: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
      icon: <HelpCircle className="w-6 h-6 text-amber-600" />,
      iconBg: 'bg-amber-50',
      btnBg: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
    },
    info: {
      icon: <Info className="w-6 h-6 text-indigo-600" />,
      iconBg: 'bg-indigo-50',
      btnBg: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
    }
  };

  const config = typeConfig[type] || typeConfig.warning;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full shrink-0 ${config.iconBg}`}>
            {config.icon}
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100 text-xs">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl transition font-semibold"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-white font-semibold rounded-xl transition shadow-sm ${config.btnBg}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
