/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'admin' | 'manager' | 'member';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  avatar?: string;
  isSimulated?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  currency: string;
  members: string[]; // User IDs
  memberRoles: { [userId: string]: UserRole }; // role mapping
  createdAt: string;
  totalExpense: number;
}

export type SplitMethod = 'equal' | 'exact' | 'shares';

export interface ExpenseSplit {
  userId: string;
  amount: number;
  share?: number;
}

export interface FlagHistoryEntry {
  timestamp: string;
  userId?: string;
  userName?: string;
  action?: 'flag' | 'resolve';
  type?: 'flag' | 'resolve';
  authorId?: string;
  authorName?: string;
  comment: string;
}

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  discountType?: 'percentage' | 'amount' | 'none';
  discountValue?: number;
  discountedAmount?: number;
  finalAmount?: number;
  splitMethod?: SplitMethod;
  splits?: ExpenseSplit[];
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  paidBy: string; // User ID
  splitMethod: SplitMethod;
  splits: ExpenseSplit[];
  items?: ExpenseItem[];
  category: string;
  createdAt: string;
  isDeleted?: boolean;
  createdBy?: string;
  
  // Discounts
  discountType?: 'percentage' | 'amount' | 'none';
  discountValue?: number;
  discountedAmount?: number;
  originalAmount?: number;

  // Flagging
  isFlagged?: boolean;
  flagReason?: string;
  flagResolved?: boolean;
  flagResolution?: string;
  flagHistory?: FlagHistoryEntry[];
}

export interface Invite {
  id: string;
  groupId: string;
  groupName: string;
  email: string;
  role: UserRole;
  token: string;
  status: 'pending' | 'accepted';
  createdAt: string;
}

export interface CurrencyRate {
  [code: string]: number;
}

export interface SystemAnalytics {
  totalUsers: number;
  totalGroups: number;
  totalExpenses: number;
  totalVolumeUSD: number;
  activeUsers24h: number;
  apiRequestsCount: number;
}
