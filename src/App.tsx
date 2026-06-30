/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  addMemberToGroup
} from './lib/dbHelper.js';

// Sub-components
import AuthScreen from './components/AuthScreen.js';
import Dashboard from './components/Dashboard.js';
import GroupsList from './components/GroupsList.js';
import GroupDetail from './components/GroupDetail.js';
import AdminPanel from './components/AdminPanel.js';
import ReferenceViewer from './components/ReferenceViewer.js';

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
  ShieldAlert
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [jwtToken, setJwtToken] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'groups' | 'admin' | 'reference'>('dashboard');
  
  // App initialization states
  const [loading, setLoading] = useState(true);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<any | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteAccepting, setInviteAccepting] = useState(false);

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

  // Sync state data on user authentication
  useEffect(() => {
    const syncUserData = async () => {
      if (!currentUser) return;
      setLoading(true);
      try {
        const [allUsers, myGroups] = await Promise.all([
          getAllUsers(),
          getGroupsForUser(currentUser.id)
        ]);
        
        setUsers(allUsers);
        setGroups(myGroups);

        // Pre-select the seeded group if it exists
        const preseeded = myGroups.find(g => g.id === 'grp_apartment_3b');
        if (preseeded) {
          setSelectedGroupId(preseeded.id);
        } else if (myGroups.length > 0) {
          setSelectedGroupId(myGroups[0].id);
        }
      } catch (err) {
        console.error('Error syncing user data:', err);
      } finally {
        setLoading(false);
      }
    };

    syncUserData();
  }, [currentUser]);

  // Sync expenses list when active group changes
  useEffect(() => {
    const syncExpenses = async () => {
      if (!selectedGroupId) {
        setExpenses([]);
        return;
      }
      try {
        const logs = await getExpensesForGroup(selectedGroupId);
        setExpenses(logs);
      } catch (err) {
        console.error('Error syncing expenses:', err);
      }
    };

    syncExpenses();
  }, [selectedGroupId]);

  const handleAuthSuccess = (user: User, token: string) => {
    setCurrentUser(user);
    setJwtToken(token);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setJwtToken('');
    setSelectedGroupId(null);
  };

  // Group creation
  const handleCreateGroup = async (name: string, description: string, currency: string) => {
    if (!currentUser) return;
    try {
      const newGroup = await createGroupInDb(name, description, currency, currentUser.id);
      setGroups(prev => [newGroup, ...prev]);
      setSelectedGroupId(newGroup.id);
      // Re-sync users to display creator in membership
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (err) {
      console.error(err);
    }
  };

  // Add split expense
  const handleAddExpense = async (expensePayload: Omit<Expense, 'id' | 'createdAt'>) => {
    try {
      const newExpense = await createExpenseInDb(expensePayload);
      setExpenses(prev => [newExpense, ...prev]);

      // Refresh groups list to reflect newly logged totals
      if (currentUser) {
        const myGroups = await getGroupsForUser(currentUser.id);
        setGroups(myGroups);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete split expense
  const handleDeleteExpense = async (expenseId: string, amount: number) => {
    if (!selectedGroupId) return;
    try {
      await deleteExpenseFromDb(expenseId, selectedGroupId, amount);
      setExpenses(prev => prev.filter(e => e.id !== expenseId));

      // Refresh groups
      if (currentUser) {
        const myGroups = await getGroupsForUser(currentUser.id);
        setGroups(myGroups);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Update user role (from Admin panel)
  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRoleInDb(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      console.error(err);
    }
  };

  // Accept simulation join link invitation
  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim() || !pendingInvite) return;

    setInviteAccepting(true);
    try {
      // 1. Submit to REST endpoint
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          userName: inviteName,
          userEmail: inviteEmail
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to join group.');
      }

      // 2. Add user registration record to Firestore DB
      const userRecord = await getAllUsers();
      let matchedUser = userRecord.find(u => u.email === inviteEmail);

      if (!matchedUser) {
        // Register newly created roommate in Firestore DB
        matchedUser = {
          id: data.user.id,
          name: inviteName,
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
      setSelectedGroupId(pendingInvite.groupId);
      setPendingInvite(null);
      setInviteToken(null);
      
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

            <button
              type="submit"
              disabled={inviteAccepting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl text-xs transition shadow-lg shadow-indigo-600/10 disabled:opacity-50"
            >
              {inviteAccepting ? 'Settle & Register...' : 'Accept Invitation & Join'}
            </button>
          </form>
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
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col md:flex-row">
      
      {/* MOBILE TOP BAR */}
      <header className="md:hidden bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
        <h1 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-white text-[10px] font-bold">
            W
          </div>
          SPLITWISE.PRO
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded capitalize">
            {currentUser.role}
          </span>
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
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-300 flex-col justify-between p-6 shrink-0 h-screen sticky top-0">
        <div className="space-y-8">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-md shadow-indigo-500/25">
                <span className="text-white text-xs font-bold font-sans">W</span>
              </div>
              SPLITWISE.PRO
            </h1>
          </div>

          <nav className="space-y-6 text-xs">
            <div>
              <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-3.5 block">Main Navigation</span>
              <ul className="space-y-1.5">
                <li>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-150 ${
                      activeTab === 'dashboard'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'hover:bg-slate-800 hover:text-white text-slate-400'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard Analytics</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab('groups')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-150 ${
                      activeTab === 'groups'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'hover:bg-slate-800 hover:text-white text-slate-400'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Shared Groups</span>
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-3.5 block">Administration</span>
              <ul className="space-y-1.5">
                <li>
                  <button
                    onClick={() => setActiveTab('admin')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-150 ${
                      activeTab === 'admin'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'hover:bg-slate-800 hover:text-white text-slate-400'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin Panel</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab('reference')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-150 ${
                      activeTab === 'reference'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'hover:bg-slate-800 hover:text-white text-slate-400'
                    }`}
                  >
                    <Code2 className="w-4 h-4" />
                    <span>Export Tech Stack</span>
                  </button>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        {/* User Context Card at Bottom of Sidebar */}
        <div className="p-4 bg-slate-850 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-3 mb-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shrink-0 text-xs uppercase shadow-inner">
              {currentUser.name.substring(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white font-semibold truncate leading-tight">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400 capitalize truncate mt-0.5">{currentUser.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2 bg-slate-750 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* MOBILE BOTTOM NAV BAR */}
      <nav className="md:hidden flex items-center justify-around bg-white border-t border-slate-200 py-3 text-xs text-center fixed bottom-0 left-0 right-0 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'dashboard' ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}
        >
          <LayoutDashboard className="w-4.5 h-4.5" />
          <span className="text-[9px]">Dashboard</span>
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'groups' ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}
        >
          <Users className="w-4.5 h-4.5" />
          <span className="text-[9px]">Groups</span>
        </button>
        <button
          onClick={() => setActiveTab('admin')}
          className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'admin' ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}
        >
          <Shield className="w-4.5 h-4.5" />
          <span className="text-[9px]">Admin</span>
        </button>
        <button
          onClick={() => setActiveTab('reference')}
          className={`flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'reference' ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}
        >
          <Code2 className="w-4.5 h-4.5" />
          <span className="text-[9px]">Export</span>
        </button>
      </nav>

      {/* PRIMARY WORKSPACE CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* DESKTOP HEADER */}
        <header className="hidden md:flex h-16 border-b border-slate-200 bg-white px-8 items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-slate-800 tracking-tight uppercase">
              {activeTab === 'dashboard' && 'Dashboard Overview'}
              {activeTab === 'groups' && 'Shared Ledger Groups'}
              {activeTab === 'admin' && 'Master Administration'}
              {activeTab === 'reference' && 'Export Tech Stack'}
            </h2>
            <div className="h-4 w-px bg-slate-300"></div>
            <div className="text-xs text-slate-500 font-medium">
              Active Session: <span className="text-indigo-600 font-semibold">{currentUser.name}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {activeTab === 'groups' && selectedGroup && (
              <span className="bg-indigo-50 text-indigo-700 text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border border-indigo-100">
                Active Group: {selectedGroup.name}
              </span>
            )}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-650 font-bold uppercase text-xs">
                {currentUser.name.substring(0, 2)}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6 pb-24 md:pb-8">
          
          {activeTab === 'dashboard' && (
            <Dashboard
              groups={groups}
              expenses={expenses}
              users={users}
              currentUserId={currentUser.id}
              currencyRates={currencyRates}
            />
          )}

          {activeTab === 'groups' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 border-r border-slate-200/50 pr-0 md:pr-4">
                <GroupsList
                  groups={groups}
                  selectedGroupId={selectedGroupId}
                  onSelectGroup={(id) => setSelectedGroupId(id)}
                  onCreateGroup={handleCreateGroup}
                />
              </div>
              <div className="md:col-span-2">
                {selectedGroup ? (
                  <GroupDetail
                    group={selectedGroup}
                    expenses={expenses}
                    users={users}
                    currentUserId={currentUser.id}
                    currentUserRole={currentUser.role}
                    onAddExpense={handleAddExpense}
                    onDeleteExpense={handleDeleteExpense}
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

          {activeTab === 'admin' && (
            <AdminPanel
              currentUser={currentUser}
              jwtToken={jwtToken}
              users={users}
              onUpdateUserRole={handleUpdateUserRole}
            />
          )}

          {activeTab === 'reference' && (
            <ReferenceViewer />
          )}

        </main>
      </div>

    </div>
  );
}
