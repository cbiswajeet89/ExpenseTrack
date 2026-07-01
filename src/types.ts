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

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
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
