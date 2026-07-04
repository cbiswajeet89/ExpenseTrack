/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from './lib/firebase.js';
import { User, Group, Expense, UserRole } from './types.js';
import { 
  seedDatabaseIfEmpty, 
  getAllUsers, 
  getGroupsForUser, 
  getExpensesForGroup, 
  createGroupInDb, 
  createExpenseInDb, 
  deleteExpenseFromDb, 
  updateUserRoleInDb,
  addMemberToGroup,
  getAllGroups,
  updateExpenseInDb,
  updateGroupInDb,
  deleteGroupFromDb,
  removeMemberFromGroup,
  removeUserFromApp
} from './lib/dbHelper.js';

// Sub-components
import AuthScreen from './components/AuthScreen.js';
import Dashboard from './components/Dashboard.js';
import GroupsList from './components/GroupsList.js';
import GroupDetail from './components/GroupDetail.js';
import SettlementMatrix from './components/SettlementMatrix.js';
import AdminPanel from './components/AdminPanel.js';
import ReferenceViewer from './components/ReferenceViewer.js';
import ProfileSettings from './components/ProfileSettings.js';
import ConfirmDialog from './components/ConfirmDialog.js';
import MasterDataPanel from './components/MasterDataPanel.js';

// Icons
import { 
  Shield, 
  Sparkles, 
  LogOut, 
  Users, 
  LayoutDashboard, 
  Code2, 
  UserPlus, 
  ArrowRight,
  ShieldAlert,
  UserCheck,
  Sun,
  Moon,
  Grid,
  Database,
  ChevronLeft,
  ChevronRight,
  Menu
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [jwtToken, setJwtToken] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [currencyRates, setCurrencyRates] = useState<{ [key: string]: number }>({
    USD: 1.0,
    EUR: 0.91,
    INR: 83.45,
    GBP: 0.78,
    CAD: 1.36,
    AUD: 1.49,
    JPY: 158.20
  });

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'groups' | 'matrix' | 'admin' | 'reference' | 'profile' | 'master_data'>('dashboard');
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);
  
  // App initialization states
  const [loading, setLoading] = useState(true);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<any | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');
  const [inviteAccepting, setInviteAccepting] = useState(false);
  const [inviteUserExists, setInviteUserExists] = useState(false);
  const [inviteExistingUser, setInviteExistingUser] = useState<any | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('isSidebarCollapsed') === 'true';
  });

  const [isGroupsPanelCollapsed, setIsGroupsPanelCollapsed] = useState(() => {
    return localStorage.getItem('isGroupsPanelCollapsed') === 'true';
  });

  const toggleGroupsPanelCollapse = () => {
    setIsGroupsPanelCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('isGroupsPanelCollapsed', String(next));
      return next;
    });
  };

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('isSidebarCollapsed', String(next));
      return next;
    });
  };

  // Keep dark class on document element in sync
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Parse invite tokens and load initial system configurations
  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. Automatically seed Firestore with default sandbox data if completely blank
        await seedDatabaseIfEmpty();

        // 2. Fetch currency exchange rates from our REST endpoint
        const ratesRes = await fetch('/api/rates');
        const ratesData = await ratesRes.json();
        if (ratesRes.ok && ratesData.success) {
          setCurrencyRates(ratesData.rates);
        }

        // 3. Resolve any invite tokens in the query parameters
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('inviteToken');
        if (token) {
          setInviteToken(token);
          const resolveRes = await fetch(`/api/invite/resolve/${token}`);
          const resolveData = await resolveRes.json();
          if (resolveRes.ok && resolveData.success) {
            setPendingInvite(resolveData.invite);
            setInviteEmail(resolveData.invite.email);
            setInviteUserExists(resolveData.userExists || false);
            setInviteExistingUser(resolveData.existingUser || null);
          }
        }

        // 4. Try to restore session from localStorage using Access/Refresh Tokens
        const storedAccessToken = localStorage.getItem('accessToken');
        const storedRefreshToken = localStorage.getItem('refreshToken');

        if (storedAccessToken && storedRefreshToken) {
          try {
            // Check if current access token is still valid via /api/auth/me
            const meRes = await fetch('/api/auth/me', {
              headers: {
                'Authorization': `Bearer ${storedAccessToken}`
              }
            });

            if (meRes.ok) {
              const meData = await meRes.json();
              if (meData.success && meData.user) {
                setCurrentUser(meData.user);
                setJwtToken(storedAccessToken);
              }
            } else {
              // Access token is expired or invalid, attempt to refresh it
              const refreshRes = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken: storedRefreshToken })
              });

              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                if (refreshData.success && refreshData.token) {
                  setCurrentUser(refreshData.user);
                  setJwtToken(refreshData.token);
                  localStorage.setItem('accessToken', refreshData.token);
                  localStorage.setItem('refreshToken', refreshData.refreshToken);
                  localStorage.setItem('currentUser', JSON.stringify(refreshData.user));
                }
              } else {
                // Refresh failed: clear credentials to force re-auth
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('currentUser');
              }
            }
          } catch (err) {
            console.error('Session restoration error:', err);
          }
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  // Real-time synchronization for users and groups list
  useEffect(() => {
    if (!currentUser) {
      setUsers([]);
      setGroups([]);
      return;
    }

    // Subscribe to all users in real-time
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: User[] = [];
      snapshot.forEach(d => {
        list.push(d.data() as User);
      });
      setUsers(list);
    }, (error) => {
      console.error('Real-time sync error for users:', error);
    });

    // Subscribe to groups (either all for admin, or where user is member)
    const activeUserId = impersonatedUser ? impersonatedUser.id : currentUser.id;
    const activeUserRole = impersonatedUser ? impersonatedUser.role : currentUser.role;
    const activeUserEmail = impersonatedUser ? impersonatedUser.email : currentUser.email;

    const groupsQuery = (activeUserRole === 'admin' && activeUserEmail === 'admin@example.com')
      ? collection(db, 'groups')
      : query(collection(db, 'groups'), where('members', 'array-contains', activeUserId));

    const unsubscribeGroups = onSnapshot(groupsQuery, (snapshot) => {
      const list: Group[] = [];
      snapshot.forEach(d => {
        list.push(d.data() as Group);
      });
      setGroups(list);

      // Manage group selection reactively
      setSelectedGroupId(prev => {
        if (prev && list.some(g => g.id === prev)) {
          return prev;
        }
        const preseeded = list.find(g => g.id === 'grp_apartment_3b');
        if (preseeded) {
          return preseeded.id;
        } else if (list.length > 0) {
          return list[0].id;
        }
        return null;
      });
    }, (error) => {
      console.error('Real-time sync error for groups:', error);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeGroups();
    };
  }, [currentUser, impersonatedUser]);

  // Real-time synchronization for active group's expense logs
  useEffect(() => {
    if (!currentUser || !selectedGroupId) {
      setExpenses([]);
      return;
    }

    const expensesQuery = query(
      collection(db, 'expenses'),
      where('groupId', '==', selectedGroupId)
    );

    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const list: Expense[] = [];
      snapshot.forEach(d => {
        list.push(d.data() as Expense);
      });
      // Sort by transaction creation time descending (newest first), falling back to date
      const sorted = list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime();
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime();
        return timeB - timeA;
      });
      setExpenses(sorted);
    }, (error) => {
      console.error('Real-time sync error for expenses:', error);
    });

    return () => {
      unsubscribeExpenses();
    };
  }, [currentUser, selectedGroupId]);

  const [categoriesList, setCategoriesList] = useState<string[]>([]);

  // Real-time synchronization for categories
  useEffect(() => {
    const unsubscribeCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const list: string[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        if (data && data.name) {
          list.push(data.name);
        }
      });
      if (list.length === 0) {
        setCategoriesList([
          'Food & Groceries',
          'Utilities & Bills',
          'Rent & Lodging',
          'Household',
          'Entertainment & Leisure',
          'Travel & Transport',
          'Other'
        ]);
      } else {
        list.sort();
        setCategoriesList(list);
      }
    }, (error) => {
      console.error('Real-time sync error for categories:', error);
    });

    return () => {
      unsubscribeCats();
    };
  }, []);

  // Real-time synchronization for exchange rates
  useEffect(() => {
    const unsubscribeRates = onSnapshot(collection(db, 'exchangeRates'), (snapshot) => {
      const ratesMap: { [key: string]: number } = {};
      snapshot.forEach(d => {
        const rateObj = d.data() as { code: string; rate: number };
        if (rateObj.code && rateObj.rate) {
          ratesMap[rateObj.code] = Number(rateObj.rate);
        }
      });
      if (Object.keys(ratesMap).length > 0) {
        setCurrencyRates(ratesMap);
      }
    }, (error) => {
      console.error('Real-time sync error for exchange rates:', error);
    });

    return () => {
      unsubscribeRates();
    };
  }, []);

  const handleAuthSuccess = (user: User, token: string, refreshToken: string) => {
    setCurrentUser(user);
    setJwtToken(token);
    localStorage.setItem('accessToken', token);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('currentUser', JSON.stringify(user));
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Logout Confirmation',
      message: 'Are you sure you want to log out of your session?',
      type: 'warning',
      confirmLabel: 'Logout',
      onConfirm: () => {
        setCurrentUser(null);
        setJwtToken('');
        setSelectedGroupId(null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('currentUser');
        setConfirmDialog(null);
      }
    });
  };

  // Group creation
  const handleCreateGroup = async (name: string, description: string, currency: string) => {
    if (!currentUser) return;
    try {
      const newGroup = await createGroupInDb(name, description, currency, currentUser.id);
      setSelectedGroupId(newGroup.id);
    } catch (err) {
      console.error(err);
    }
  };

  // Add split expense
  const handleAddExpense = async (expensePayload: Omit<Expense, 'id' | 'createdAt'>) => {
    try {
      const finalPayload = {
        ...expensePayload,
        createdBy: currentUser?.id
      };
      await createExpenseInDb(finalPayload);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete split expense
  const handleDeleteExpense = async (expenseId: string, amount: number) => {
    if (!selectedGroupId) return;
    try {
      await deleteExpenseFromDb(expenseId, selectedGroupId, amount);
    } catch (err) {
      console.error(err);
    }
  };

  // Update split expense
  const handleUpdateExpense = async (expenseId: string, updatedPayload: Omit<Expense, 'id' | 'createdAt'>, oldAmount: number) => {
    try {
      await updateExpenseInDb(expenseId, updatedPayload, oldAmount);
    } catch (err) {
      console.error(err);
    }
  };

  // Update group details
  const handleUpdateGroup = async (groupId: string, name: string, description: string, currency: string) => {
    try {
      await updateGroupInDb(groupId, name, description, currency);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete group (cascade deletes all expenses)
  const handleDeleteGroup = async (groupId: string) => {
    try {
      await deleteGroupFromDb(groupId);
      if (selectedGroupId === groupId) {
        setSelectedGroupId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Remove member from group
  const handleRemoveMember = async (groupId: string, userId: string) => {
    try {
      await removeMemberFromGroup(groupId, userId);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  // Remove user from the entire application (Admin Action)
  const handleRemoveUserFromApp = async (userId: string) => {
    try {
      await removeUserFromApp(userId);
      
      // Update local users list state
      setUsers(prev => prev.filter(u => u.id !== userId));
      
      // Update local groups state to remove them from all memberships
      setGroups(prev => prev.map(g => {
        if (g.members.includes(userId)) {
          const updatedMembers = g.members.filter(m => m !== userId);
          const updatedRoles = { ...g.memberRoles };
          delete updatedRoles[userId];
          return {
            ...g,
            members: updatedMembers,
            memberRoles: updatedRoles
          };
        }
        return g;
      }));
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  // Update user role (from Admin panel)
  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Update User Role',
      message: `Are you sure you want to change this user's role to ${newRole}?`,
      type: 'warning',
      confirmLabel: 'Update Role',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await updateUserRoleInDb(userId, newRole);
          setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  // Synchronize profile updates on current user & list
  const handleProfileUpdate = (updatedUser: User, newToken: string, newRefreshToken?: string) => {
    setCurrentUser(updatedUser);
    setJwtToken(newToken);
    localStorage.setItem('accessToken', newToken);
    if (newRefreshToken) {
      localStorage.setItem('refreshToken', newRefreshToken);
    }
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
  };

  // Accept simulation join link invitation
  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingInvite || !inviteEmail.trim()) return;

    const isAlreadyLoggedInAsEmail = currentUser && currentUser.email.toLowerCase().trim() === inviteEmail.toLowerCase().trim();

    if (!inviteUserExists) {
      if (!inviteName.trim() || !invitePassword) {
        alert('Please fill in your name and password.');
        return;
      }
      if (invitePassword !== inviteConfirmPassword) {
        alert('Passwords do not match.');
        return;
      }
    } else {
      if (!isAlreadyLoggedInAsEmail && !invitePassword) {
        alert('Please provide your password to join.');
        return;
      }
    }

    setInviteAccepting(true);
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (jwtToken) {
        headers['Authorization'] = `Bearer ${jwtToken}`;
      }

      const bodyPayload: any = {
        token: inviteToken,
        userEmail: inviteEmail
      };

      if (inviteUserExists) {
        if (isAlreadyLoggedInAsEmail) {
          bodyPayload.bypassPassword = true;
        } else {
          bodyPayload.password = invitePassword;
        }
      } else {
        bodyPayload.userName = inviteName;
        bodyPayload.password = invitePassword;
      }

      // 1. Submit to REST endpoint
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to join group.');
      }

      // 2. Add user registration record to Firestore DB
      const userRecord = await getAllUsers();
      let matchedUser = userRecord.find(u => u.email.toLowerCase().trim() === inviteEmail.toLowerCase().trim());

      if (!matchedUser) {
        // Register newly created roommate in Firestore DB
        matchedUser = {
          id: data.user.id,
          name: data.user.name || inviteName,
          email: inviteEmail,
          role: pendingInvite.role,
          createdAt: new Date().toISOString()
        };
        await getAllUsers(); // refresh trigger
      }

      // 3. Add member reference and custom group role mapping to group's document in Firestore
      await addMemberToGroup(pendingInvite.groupId, matchedUser.id, pendingInvite.role);

      // 4. Set state, log them in, and open the exact group
      setCurrentUser(matchedUser);
      setJwtToken(data.token);
      localStorage.setItem('accessToken', data.token);
      localStorage.setItem('refreshToken', data.refreshToken || '');
      localStorage.setItem('currentUser', JSON.stringify(matchedUser));
      setSelectedGroupId(pendingInvite.groupId);
      setPendingInvite(null);
      setInviteToken(null);
      setInviteUserExists(false);
      setInviteExistingUser(null);
      
      // Clean query parameter in browser URL address bar safely
      window.history.replaceState({}, document.title, "/");
    } catch (err: any) {
      alert(`Accept Error: ${err.message}`);
    } finally {
      setInviteAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9fafb]">
        <div className="text-center space-y-3 font-sans">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest font-mono">Loading Secure Services...</p>
        </div>
      </div>
    );
  }

  // If there is an active pending invitation token we render the Accept Invitation overlay screen
  if (pendingInvite) {
    const isAlreadyLoggedInAsEmail = currentUser && currentUser.email.toLowerCase().trim() === inviteEmail.toLowerCase().trim();

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9fafb] p-6 font-sans">
        <div className="w-full max-w-md bg-white border border-gray-100 rounded-2xl shadow-xl shadow-gray-100/50 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 mb-3">
              <UserPlus className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Join Shared Room</h1>
            <p className="text-xs text-gray-500 mt-1">
              You are invited to join <strong>{pendingInvite.groupName}</strong>
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl space-y-1 text-xs mb-6 border border-gray-100">
            <div className="flex justify-between">
              <span className="text-gray-400">Target Group:</span>
              <strong className="text-gray-700">{pendingInvite.groupName}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Assigned Role:</span>
              <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-bold uppercase text-[9px]">
                {pendingInvite.role}
              </span>
            </div>
          </div>

          {inviteUserExists ? (
            isAlreadyLoggedInAsEmail ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-850 rounded-xl text-xs space-y-2 leading-relaxed">
                  <p className="font-semibold text-emerald-800">✨ Account Verified</p>
                  <p>You are currently authenticated as <strong>{currentUser.email}</strong>. Just click below to accept this invitation and join the group.</p>
                </div>

                <button
                  onClick={(e) => handleAcceptInvite(e)}
                  disabled={inviteAccepting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-xl text-xs transition shadow-lg shadow-emerald-600/10 disabled:opacity-50"
                >
                  {inviteAccepting ? 'Joining Group...' : 'Accept & Join Group'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleAcceptInvite} className="space-y-4">
                <div className="p-4 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-xl text-xs space-y-1.5 leading-relaxed">
                  <p className="font-semibold">💡 Account Already Exists</p>
                  <p>An account with email <strong>{inviteEmail}</strong> is already registered. Please verify your password below to join.</p>
                </div>

                {currentUser && (
                  <div className="p-3 bg-amber-50 border border-amber-100 text-amber-800 rounded-xl text-[11px] leading-normal">
                    ⚠️ Note: You are currently logged in as <strong>{currentUser.email}</strong>. Verifying your password will switch your active session to <strong>{inviteEmail}</strong>.
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Your Email Address</label>
                  <input
                    type="email"
                    required
                    readOnly
                    value={inviteEmail}
                    className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-xl text-xs font-mono text-gray-500 cursor-not-allowed focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Enter Your Password</label>
                  <input
                    type="password"
                    required
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={inviteAccepting}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl text-xs transition shadow-lg shadow-indigo-600/10 disabled:opacity-50"
                >
                  {inviteAccepting ? 'Verifying & Joining...' : 'Verify Password & Join'}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingInvite(null);
                      setInviteToken(null);
                      window.history.replaceState({}, document.title, "/");
                    }}
                    className="text-[11px] text-gray-400 hover:text-gray-600 underline font-medium"
                  >
                    Cancel and return to app
                  </button>
                </div>
              </form>
            )
          ) : (
            <form onSubmit={handleAcceptInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Your Full Name</label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Enter name"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Your Invite Email Address</label>
                <input
                  type="email"
                  required
                  readOnly
                  value={inviteEmail}
                  className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-xl text-xs font-mono text-gray-500 cursor-not-allowed focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Set Your Account Password</label>
                <input
                  type="password"
                  required
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Confirm Your Password</label>
                <input
                  type="password"
                  required
                  value={inviteConfirmPassword}
                  onChange={(e) => setInviteConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <button
                type="submit"
                disabled={inviteAccepting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl text-xs transition shadow-lg shadow-indigo-600/10 disabled:opacity-50"
              >
                {inviteAccepting ? 'Settle & Register...' : 'Accept Invitation & Join'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // If not authenticated we render AuthScreen
  if (!currentUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans flex flex-col md:flex-row">
      
      {/* MOBILE TOP BAR */}
      <header className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
        <h1 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-white text-[10px] font-bold">
            W
          </div>
          SPLITWISE.PRO
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 px-2 py-0.5 rounded capitalize">
            {currentUser.role}
          </span>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* DESKTOP SIDEBAR */}
      <aside className={`hidden md:flex ${isSidebarCollapsed ? 'w-20 p-4' : 'w-64 p-6'} bg-slate-900 text-slate-300 flex-col justify-between shrink-0 h-screen sticky top-0 transition-all duration-300 z-30`}>
        <div className="space-y-8">
          <div className="flex flex-col">
            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} w-full`}>
              <h1 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
                <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-md shadow-indigo-500/25 shrink-0">
                  <span className="text-white text-xs font-bold font-sans">W</span>
                </div>
                {!isSidebarCollapsed && <span>SPLITWISE.PRO</span>}
              </h1>
              {!isSidebarCollapsed && (
                <button
                  onClick={toggleSidebarCollapse}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>
            {isSidebarCollapsed && (
              <button
                onClick={toggleSidebarCollapse}
                className="p-1 mt-3 mx-auto rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center"
                title="Expand sidebar"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <nav className="space-y-6 text-xs">
            <div>
              {!isSidebarCollapsed && (
                <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-3.5 block">Main Navigation</span>
              )}
              <ul className="space-y-1.5">
                <li>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-xl font-medium transition-all duration-150 ${
                      activeTab === 'dashboard'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'hover:bg-slate-800 hover:text-white text-slate-400'
                    }`}
                    title={isSidebarCollapsed ? "Dashboard Analytics" : undefined}
                  >
                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                    {!isSidebarCollapsed && <span>Dashboard Analytics</span>}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab('groups')}
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-xl font-medium transition-all duration-150 ${
                      activeTab === 'groups'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'hover:bg-slate-800 hover:text-white text-slate-400'
                    }`}
                    title={isSidebarCollapsed ? "Shared Groups" : undefined}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    {!isSidebarCollapsed && <span>Shared Groups</span>}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab('matrix')}
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-xl font-medium transition-all duration-150 ${
                      activeTab === 'matrix'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'hover:bg-slate-800 hover:text-white text-slate-400'
                    }`}
                    title={isSidebarCollapsed ? "Settlement Matrix" : undefined}
                  >
                    <Grid className="w-4 h-4 shrink-0" />
                    {!isSidebarCollapsed && <span>Settlement Matrix</span>}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab('profile')}
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-xl font-medium transition-all duration-150 ${
                      activeTab === 'profile'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'hover:bg-slate-800 hover:text-white text-slate-400'
                    }`}
                    title={isSidebarCollapsed ? "My Profile" : undefined}
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    {!isSidebarCollapsed && <span>My Profile</span>}
                  </button>
                </li>
              </ul>
            </div>

            {currentUser?.email === 'admin@example.com' && (
              <div>
                {!isSidebarCollapsed && (
                  <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-3.5 block">Administration</span>
                )}
                <ul className="space-y-1.5">
                  <li>
                    <button
                      onClick={() => setActiveTab('admin')}
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-xl font-medium transition-all duration-150 ${
                        activeTab === 'admin'
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                          : 'hover:bg-slate-800 hover:text-white text-slate-400'
                      }`}
                      title={isSidebarCollapsed ? "Admin Panel" : undefined}
                    >
                      <Shield className="w-4 h-4 shrink-0" />
                      {!isSidebarCollapsed && <span>Admin Panel</span>}
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setActiveTab('master_data')}
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-xl font-medium transition-all duration-150 ${
                        activeTab === 'master_data'
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                          : 'hover:bg-slate-800 hover:text-white text-slate-400'
                      }`}
                      title={isSidebarCollapsed ? "Master Data Management" : undefined}
                    >
                      <Database className="w-4 h-4 shrink-0" />
                      {!isSidebarCollapsed && <span>Master Data Management</span>}
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setActiveTab('reference')}
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-xl font-medium transition-all duration-150 ${
                        activeTab === 'reference'
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                          : 'hover:bg-slate-800 hover:text-white text-slate-400'
                      }`}
                      title={isSidebarCollapsed ? "Export Tech Stack" : undefined}
                    >
                      <Code2 className="w-4 h-4 shrink-0" />
                      {!isSidebarCollapsed && <span>Export Tech Stack</span>}
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </nav>
        </div>

        {/* User Context Card at Bottom of Sidebar */}
        <div className={`bg-slate-850 border border-slate-800/80 rounded-xl ${isSidebarCollapsed ? 'p-1.5 flex flex-col items-center gap-2' : 'p-4'}`}>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} mb-2.5 overflow-hidden text-left w-full hover:bg-slate-800/50 p-1.5 rounded-lg transition`}
            title={isSidebarCollapsed ? `Profile: ${currentUser.name}` : "Update Profile details"}
          >
            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shrink-0 text-xs uppercase shadow-inner">
              {currentUser.name.substring(0, 2)}
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white font-semibold truncate leading-tight hover:underline">{currentUser.name}</p>
                <p className="text-[10px] text-slate-400 capitalize truncate mt-0.5">{currentUser.role}</p>
              </div>
            )}
          </button>
          <button
            onClick={handleLogout}
            className={`w-full py-2 bg-slate-750 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center justify-center text-xs font-medium`}
            title={isSidebarCollapsed ? "Log Out" : undefined}
          >
            {isSidebarCollapsed ? <LogOut className="w-4 h-4" /> : 'Logout'}
          </button>
        </div>
      </aside>

      {/* MOBILE BOTTOM NAV BAR */}
      <nav className="md:hidden flex items-center justify-around bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-3 text-xs text-center fixed bottom-0 left-0 right-0 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] dark:shadow-[0_-2px_10px_rgba(0,0,0,0.2)]">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'dashboard' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}
        >
          <LayoutDashboard className="w-4.5 h-4.5" />
          <span className="text-[9px]">Dashboard</span>
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'groups' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}
        >
          <Users className="w-4.5 h-4.5" />
          <span className="text-[9px]">Groups</span>
        </button>
        <button
          onClick={() => setActiveTab('matrix')}
          className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'matrix' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}
        >
          <Grid className="w-4.5 h-4.5" />
          <span className="text-[9px]">Matrix</span>
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'profile' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}
        >
          <UserCheck className="w-4.5 h-4.5" />
          <span className="text-[9px]">Profile</span>
        </button>
        {currentUser?.email === 'admin@example.com' && (
          <>
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'admin' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}
            >
              <Shield className="w-4.5 h-4.5" />
              <span className="text-[9px]">Admin</span>
            </button>
            <button
              onClick={() => setActiveTab('master_data')}
              className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'master_data' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}
            >
              <Database className="w-4.5 h-4.5" />
              <span className="text-[9px]">Master Data</span>
            </button>
            <button
              onClick={() => setActiveTab('reference')}
              className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'reference' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}
            >
              <Code2 className="w-4.5 h-4.5" />
              <span className="text-[9px]">Export</span>
            </button>
          </>
        )}
      </nav>

      {/* PRIMARY WORKSPACE CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 md:h-screen md:overflow-y-auto pb-16 md:pb-0">
        
        {/* STICKY HEADER & WARNING WRAPPER */}
        <div className="sticky top-[53px] md:top-0 z-30 flex flex-col shrink-0">
          {/* DESKTOP HEADER */}
          <header className="hidden md:flex h-16 border-b border-slate-200 dark:border-slate-850 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs px-8 items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight uppercase">
                {activeTab === 'dashboard' && 'Dashboard Overview'}
                {activeTab === 'groups' && 'Shared Ledger Groups'}
                {activeTab === 'matrix' && 'Settlement Matrix'}
                {activeTab === 'profile' && 'My Account Profile'}
                {activeTab === 'admin' && 'Master Administration'}
                {activeTab === 'master_data' && 'Master Data Terminal'}
                {activeTab === 'reference' && 'Export Tech Stack'}
              </h2>
              <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"></div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Active Session: <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{currentUser.name}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {(activeTab === 'groups' || activeTab === 'matrix') && selectedGroup && (
                <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/40">
                  Active Group: {selectedGroup.name}
                </span>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-650 dark:text-slate-300 font-bold uppercase text-xs cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    title="User Settings"
                  >
                    {currentUser.name.substring(0, 2)}
                  </button>
                  
                  {showProfileMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowProfileMenu(false)}
                      />
                      <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-xl py-1.5 z-20 animate-in fade-in slide-in-from-top-1 duration-100">
                        <div className="px-3 py-2 border-b border-slate-50 dark:border-slate-850">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{currentUser.name}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{currentUser.email}</p>
                        </div>
                        <button
                          onClick={() => {
                            setActiveTab('profile');
                            setShowProfileMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-2 cursor-pointer border-0 bg-transparent"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span>My Profile</span>
                        </button>
                        <button
                          onClick={() => {
                            setShowProfileMenu(false);
                            handleLogout();
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition flex items-center gap-2 cursor-pointer border-0 bg-transparent"
                        >
                          <LogOut className="w-3.5 h-3.5 text-rose-500" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </header>

          {impersonatedUser && (
            <div className="bg-amber-500 text-white px-6 py-2 flex items-center justify-between text-xs font-semibold shrink-0 shadow-md">
              <div className="flex items-center gap-2">
                <span className="bg-white text-amber-600 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase animate-pulse">
                  Impersonation Active
                </span>
                <span>
                  Acting on behalf of: <strong className="underline">{impersonatedUser.name}</strong> ({impersonatedUser.email}) — Role: <span className="uppercase">{impersonatedUser.role}</span>
                </span>
              </div>
              <button
                onClick={() => setImpersonatedUser(null)}
                className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-[10px] uppercase font-bold transition-all cursor-pointer border-0"
              >
                Exit Impersonation
              </button>
            </div>
          )}
        </div>

        <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6 pb-24 md:pb-8">
          
          {activeTab === 'dashboard' && (
            <Dashboard
              groups={groups}
              expenses={expenses}
              users={users}
              currentUserId={impersonatedUser ? impersonatedUser.id : currentUser.id}
              currencyRates={currencyRates}
              onUpdateExpense={handleUpdateExpense}
              onDeleteExpense={handleDeleteExpense}
              categories={categoriesList}
            />
          )}

          {activeTab === 'groups' && (
            <div className="flex flex-col md:flex-row gap-6">
              {/* Active Groups Panel */}
              {!isGroupsPanelCollapsed ? (
                <div className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-slate-200/50 pb-4 md:pb-0 md:pr-4">
                  <div className="flex items-center justify-between mb-3 bg-slate-50 dark:bg-slate-850/30 p-2.5 rounded-xl border border-slate-150 dark:border-slate-800">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Rooms / Groups</span>
                    <button 
                      onClick={() => setIsGroupsPanelCollapsed(true)}
                      className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-650 dark:hover:text-indigo-400 transition cursor-pointer shadow-2xs"
                      title="Collapse Panel"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                  <GroupsList
                    groups={groups}
                    selectedGroupId={selectedGroupId}
                    onSelectGroup={(id) => setSelectedGroupId(id)}
                    onCreateGroup={handleCreateGroup}
                  />
                </div>
              ) : (
                <div className="shrink-0 flex flex-col gap-2">
                  {/* Collapsed Panel Strip on Desktop */}
                  <div className="hidden md:flex flex-col items-center py-4 px-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 shrink-0 rounded-2xl w-14">
                    <button 
                      onClick={() => setIsGroupsPanelCollapsed(false)}
                      className="p-2 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-xl text-slate-650 dark:text-slate-350 hover:text-indigo-600 transition shadow-xs cursor-pointer"
                      title="Expand Panel"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="mt-8 [writing-mode:vertical-lr] rotate-180 text-[11px] font-bold select-none whitespace-nowrap flex items-center gap-1">
                      <span className="text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-widest">Active Rooms</span>
                      {selectedGroup && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600 mx-1">•</span>
                          <span className="text-slate-700 dark:text-slate-300 normal-case font-semibold">{selectedGroup.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Collapsed Expand Button on Mobile */}
                  <div className="md:hidden">
                    <button 
                      onClick={() => setIsGroupsPanelCollapsed(false)}
                      className="w-full py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold text-indigo-650 dark:text-indigo-400 flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" /> Expand Active Groups Panel {selectedGroup ? `(${selectedGroup.name})` : ''}
                    </button>
                  </div>
                </div>
              )}

              {/* Main Workspace content */}
              <div className="flex-1 min-w-0">
                {selectedGroup ? (
                  <GroupDetail
                    group={selectedGroup}
                    expenses={expenses}
                    users={users}
                    currentUserId={impersonatedUser ? impersonatedUser.id : currentUser.id}
                    currentUserRole={impersonatedUser ? (selectedGroup.memberRoles[impersonatedUser.id] || 'member') : currentUser.role}
                    onAddExpense={handleAddExpense}
                    onDeleteExpense={handleDeleteExpense}
                    onUpdateExpense={handleUpdateExpense}
                    onUpdateGroup={handleUpdateGroup}
                    onDeleteGroup={handleDeleteGroup}
                    onRemoveMember={handleRemoveMember}
                    categories={categoriesList}
                  />
                ) : (
                  <div className="h-96 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-6 text-center bg-white shadow-sm">
                    <Users className="w-12 h-12 text-slate-300 mb-2 animate-pulse" />
                    <h4 className="text-sm font-semibold text-slate-700">Select or Create a Split Group</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      Join a roommate flat, vacation log, or office cafeteria ledger to begin logging splits in real-time.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'matrix' && (
            <SettlementMatrix
              groups={groups}
              expenses={expenses}
              users={users}
              currentUserId={impersonatedUser ? impersonatedUser.id : currentUser.id}
            />
          )}

          {activeTab === 'admin' && currentUser?.email === 'admin@example.com' && (
            <AdminPanel
              currentUser={currentUser}
              jwtToken={jwtToken}
              users={users}
              groups={groups}
              onUpdateUserRole={handleUpdateUserRole}
              onRemoveUserFromApp={handleRemoveUserFromApp}
              onImpersonateUser={(u) => {
                setImpersonatedUser(u);
                setActiveTab('dashboard');
              }}
            />
          )}

          {activeTab === 'master_data' && currentUser?.email === 'admin@example.com' && (
            <MasterDataPanel
              jwtToken={jwtToken}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileSettings
              currentUser={impersonatedUser ? impersonatedUser : currentUser}
              jwtToken={jwtToken}
              onProfileUpdate={handleProfileUpdate}
            />
          )}

          {activeTab === 'reference' && currentUser?.email === 'admin@example.com' && (
            <ReferenceViewer />
          )}

        </main>
      </div>

      {confirmDialog && confirmDialog.isOpen && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

    </div>
  );
}
