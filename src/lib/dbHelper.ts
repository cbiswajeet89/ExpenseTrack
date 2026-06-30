/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { db } from './firebase.js';
import { User, Group, Expense, Invite, UserRole } from '../types.js';

// Default mock users list to seed Firestore
export const DEFAULT_USERS: User[] = [
  { id: 'usr_alice', email: 'alice@example.com', name: 'Alice Smith', role: 'admin', createdAt: new Date().toISOString() },
  { id: 'usr_bob', email: 'bob@example.com', name: 'Bob Johnson', role: 'manager', createdAt: new Date().toISOString() },
  { id: 'usr_charlie', email: 'charlie@example.com', name: 'Charlie Davis', role: 'member', createdAt: new Date().toISOString() },
  { id: 'usr_admin', email: 'cbiswajeet89@gmail.com', name: 'Biswajeet Admin', role: 'admin', createdAt: new Date().toISOString() }
];

// Helper to seed Firestore if empty
export async function seedDatabaseIfEmpty() {
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    if (!usersSnap.empty) {
      console.log('[Firestore] Database already contains data. Skipping seeding.');
      return;
    }

    console.log('[Firestore] Database is empty. Seeding starting data...');

    // 1. Seed Users
    for (const u of DEFAULT_USERS) {
      await setDoc(doc(db, 'users', u.id), u);
    }

    // 2. Seed a sample Group
    const sampleGroup: Group = {
      id: 'grp_apartment_3b',
      name: 'Apartment 3B Roomies',
      description: 'Shared flat utility bills, organic groceries, and cleaning supplies.',
      currency: 'USD',
      members: ['usr_alice', 'usr_bob', 'usr_charlie'],
      memberRoles: {
        usr_alice: 'admin',
        usr_bob: 'manager',
        usr_charlie: 'member'
      },
      createdAt: new Date().toISOString(),
      totalExpense: 480.0
    };
    await setDoc(doc(db, 'groups', sampleGroup.id), sampleGroup);

    // 3. Seed some initial itemized Expenses
    const sampleExpenses: Expense[] = [
      {
        id: 'exp_grocery',
        groupId: 'grp_apartment_3b',
        description: 'Monthly Whole Foods Grocery Haul',
        amount: 150.0,
        currency: 'USD',
        date: '2026-06-15',
        paidBy: 'usr_alice',
        splitMethod: 'equal',
        splits: [
          { userId: 'usr_alice', amount: 50.0 },
          { userId: 'usr_bob', amount: 50.0 },
          { userId: 'usr_charlie', amount: 50.0 }
        ],
        items: [
          { id: 'it_1', description: 'Fresh produce & organic milk', amount: 90.0 },
          { id: 'it_2', description: 'Gourmet cheese & crackers', amount: 60.0 }
        ],
        category: 'Food & Groceries',
        createdAt: new Date().toISOString()
      },
      {
        id: 'exp_electricity',
        groupId: 'grp_apartment_3b',
        description: 'AC Power & Electric Bill',
        amount: 240.0,
        currency: 'USD',
        date: '2026-06-20',
        paidBy: 'usr_bob',
        splitMethod: 'exact',
        splits: [
          { userId: 'usr_alice', amount: 100.0 }, // Alice had bigger bedroom with extra AC
          { userId: 'usr_bob', amount: 70.0 },
          { userId: 'usr_charlie', amount: 70.0 }
        ],
        items: [
          { id: 'it_e1', description: 'Standard utility usage charges', amount: 240.0 }
        ],
        category: 'Utilities & Bills',
        createdAt: new Date().toISOString()
      },
      {
        id: 'exp_cleaning',
        groupId: 'grp_apartment_3b',
        description: 'Flat Deep Cleaning Supplies',
        amount: 90.0,
        currency: 'USD',
        date: '2026-06-25',
        paidBy: 'usr_charlie',
        splitMethod: 'shares',
        splits: [
          { userId: 'usr_alice', amount: 30.0, share: 1 },
          { userId: 'usr_bob', amount: 30.0, share: 1 },
          { userId: 'usr_charlie', amount: 30.0, share: 1 }
        ],
        items: [
          { id: 'it_c1', description: 'Eco-friendly cleaning agents', amount: 50.0 },
          { id: 'it_c2', description: 'Mop, broom & microfibre wipes', amount: 40.0 }
        ],
        category: 'Household',
        createdAt: new Date().toISOString()
      }
    ];

    for (const exp of sampleExpenses) {
      await setDoc(doc(db, 'expenses', exp.id), exp);
    }

    console.log('[Firestore] Seeding completed successfully!');
  } catch (error) {
    console.error('[Firestore Error] Seeding failed:', error);
  }
}

// ---------------- USER OPERATIONS ----------------

export async function getAllUsers(): Promise<User[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const list: User[] = [];
    snap.forEach(d => {
      list.push(d.data() as User);
    });
    return list;
  } catch (err) {
    console.error('[Firestore] getAllUsers error:', err);
    return DEFAULT_USERS;
  }
}

export async function createUser(id: string, name: string, email: string, role: UserRole = 'member'): Promise<User> {
  const newUser: User = {
    id,
    name,
    email,
    role,
    createdAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'users', id), newUser);
  return newUser;
}

export async function updateUserRoleInDb(id: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, 'users', id), { role });
}

// ---------------- GROUP OPERATIONS ----------------

export async function getGroupsForUser(userId: string): Promise<Group[]> {
  try {
    const snap = await getDocs(collection(db, 'groups'));
    const list: Group[] = [];
    snap.forEach(d => {
      const g = d.data() as Group;
      if (g.members.includes(userId)) {
        list.push(g);
      }
    });
    return list;
  } catch (err) {
    console.error('[Firestore] getGroupsForUser error:', err);
    return [];
  }
}

export async function createGroupInDb(name: string, description: string, currency: string, creatorId: string): Promise<Group> {
  const id = `grp_${Math.random().toString(36).substr(2, 9)}`;
  const newGroup: Group = {
    id,
    name,
    description,
    currency,
    members: [creatorId],
    memberRoles: { [creatorId]: 'admin' },
    createdAt: new Date().toISOString(),
    totalExpense: 0
  };
  await setDoc(doc(db, 'groups', id), newGroup);
  return newGroup;
}

export async function addMemberToGroup(groupId: string, userId: string, role: UserRole): Promise<void> {
  const groupRef = doc(db, 'groups', groupId);
  // Fetch group first
  const snap = await getDocs(query(collection(db, 'groups')));
  let targetGroup: Group | null = null;
  snap.forEach(d => {
    if (d.id === groupId) {
      targetGroup = d.data() as Group;
    }
  });

  if (targetGroup) {
    const group = targetGroup as Group;
    if (!group.members.includes(userId)) {
      const updatedMembers = [...group.members, userId];
      const updatedRoles = { ...group.memberRoles, [userId]: role };
      await updateDoc(groupRef, {
        members: updatedMembers,
        memberRoles: updatedRoles
      });
    }
  }
}

// ---------------- EXPENSE OPERATIONS ----------------

export async function getExpensesForGroup(groupId: string): Promise<Expense[]> {
  try {
    const snap = await getDocs(collection(db, 'expenses'));
    const list: Expense[] = [];
    snap.forEach(d => {
      const exp = d.data() as Expense;
      if (exp.groupId === groupId) {
        list.push(exp);
      }
    });
    // Sort by date descending
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (err) {
    console.error('[Firestore] getExpensesForGroup error:', err);
    return [];
  }
}

export async function createExpenseInDb(expense: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> {
  const id = `exp_${Math.random().toString(36).substr(2, 9)}`;
  const newExpense: Expense = {
    ...expense,
    id,
    createdAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'expenses', id), newExpense);

  // Update group totalExpense
  const groupRef = doc(db, 'groups', expense.groupId);
  const snap = await getDocs(query(collection(db, 'groups')));
  let targetGroup: Group | null = null;
  snap.forEach(d => {
    if (d.id === expense.groupId) {
      targetGroup = d.data() as Group;
    }
  });

  if (targetGroup) {
    const group = targetGroup as Group;
    const newTotal = (group.totalExpense || 0) + Number(expense.amount);
    await updateDoc(groupRef, { totalExpense: newTotal });
  }

  return newExpense;
}

export async function deleteExpenseFromDb(expenseId: string, groupId: string, amount: number): Promise<void> {
  await deleteDoc(doc(db, 'expenses', expenseId));

  // Update group total
  const groupRef = doc(db, 'groups', groupId);
  const snap = await getDocs(query(collection(db, 'groups')));
  let targetGroup: Group | null = null;
  snap.forEach(d => {
    if (d.id === groupId) {
      targetGroup = d.data() as Group;
    }
  });

  if (targetGroup) {
    const group = targetGroup as Group;
    const newTotal = Math.max(0, (group.totalExpense || 0) - amount);
    await updateDoc(groupRef, { totalExpense: newTotal });
  }
}
