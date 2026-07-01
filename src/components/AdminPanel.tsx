/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User, UserRole, SystemAnalytics, Group } from '../types.js';
import { ShieldAlert, Users, Server, Activity, ArrowRight, ShieldCheck, RefreshCw, FolderClosed, Trash2, KeyRound, Eye, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface AdminPanelProps {
  currentUser: User;
  jwtToken: string;
  users: User[];
  groups: Group[];
  onUpdateUserRole: (userId: string, newRole: UserRole) => Promise<void>;
  onRemoveUserFromApp: (userId: string) => Promise<void>;
  onImpersonateUser: (user: User) => void;
}

export default function AdminPanel({ currentUser, jwtToken, users, groups, onUpdateUserRole, onRemoveUserFromApp, onImpersonateUser }: AdminPanelProps) {
  const isAdmin = currentUser.role === 'admin' && currentUser.email === 'admin@example.com';
  const [analytics, setAnalytics] = useState<SystemAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  
  // Master User Account Reset States
  const [confirmResetUser, setConfirmResetUser] = useState<User | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState(true);
  const [resetExpenses, setResetExpenses] = useState(false);
  const [customPassword, setCustomPassword] = useState('password');

  // Sorting configurations for Users table
  const [userSortField, setUserSortField] = useState<'name' | 'id' | 'role'>('name');
  const [userSortDirection, setUserSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleUserSort = (field: 'name' | 'id' | 'role') => {
    if (userSortField === field) {
      setUserSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setUserSortField(field);
      setUserSortDirection('asc');
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    let valA: any;
    let valB: any;

    if (userSortField === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (userSortField === 'id') {
      valA = a.id;
      valB = b.id;
    } else if (userSortField === 'role') {
      valA = a.role;
      valB = b.role;
    }

    if (valA < valB) return userSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return userSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Sorting configurations for Groups table
  const [groupSortField, setGroupSortField] = useState<'name' | 'id' | 'members' | 'accrued'>('name');
  const [groupSortDirection, setGroupSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleGroupSort = (field: 'name' | 'id' | 'members' | 'accrued') => {
    if (groupSortField === field) {
      setGroupSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setGroupSortField(field);
      setGroupSortDirection('asc');
    }
  };

  const sortedGroups = [...groups].sort((a, b) => {
    let valA: any;
    let valB: any;

    if (groupSortField === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (groupSortField === 'id') {
      valA = a.id;
      valB = b.id;
    } else if (groupSortField === 'members') {
      valA = a.members?.length || 0;
      valB = b.members?.length || 0;
    } else if (groupSortField === 'accrued') {
      valA = Number(a.totalExpense || 0);
      valB = Number(b.totalExpense || 0);
    }

    if (valA < valB) return groupSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return groupSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Fetch JWT secured system analytics from Express
  const fetchAnalytics = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAnalytics(data.analytics);
      } else {
        throw new Error(data.error || 'Failed to authorize JWT session.');
      }
    } catch (err: any) {
      setError(err.message || 'Error querying analytics service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [jwtToken, currentUser]);

  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);

  const handleDeleteUser = async (userId: string) => {
    setDeletingUserId(userId);
    setError('');
    try {
      // 1. Call REST delete endpoint with JWT Bearer Token
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove user via server.');
      }

      // 2. Trigger local state removal
      await onRemoveUserFromApp(userId);
      setConfirmDeleteUser(null);
      
      // Update analytics counts
      if (analytics) {
        setAnalytics(prev => prev ? { ...prev, totalUsers: prev.totalUsers - 1 } : null);
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred while removing user.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdatingUserId(userId);
    try {
      // 1. Fire REST call with JWT Bearer Token
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update role via server.');
      }

      // 2. Trigger local Firestore/state update
      await onUpdateUserRole(userId, newRole);
    } catch (err: any) {
      alert(`Admin Action Rejected: ${err.message}`);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleResetUser = async () => {
    if (!confirmResetUser) return;
    setResettingUserId(confirmResetUser.id);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${confirmResetUser.id}/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ resetPassword, resetExpenses, manualPassword: customPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset user on server.');
      }
      alert(data.message || 'User reset successfully!');
      setConfirmResetUser(null);
    } catch (err: any) {
      setError(err.message || 'Error resetting user.');
    } finally {
      setResettingUserId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-red-50/50 border border-red-100 p-8 rounded-2xl flex flex-col items-center text-center max-w-lg mx-auto font-sans mt-8">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-base font-semibold text-gray-900">Access Denied: Administrative JWT Required</h3>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Your current authenticated session role is <strong>{currentUser.role.toUpperCase()}</strong>.
          The requested administrative endpoint is secured by HMAC SHA-256 JWT validation filters.
          To bypass this boundary, please re-authenticate as an <strong>Admin</strong> using the Quick Sandbox sign-in menu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header section with credentials and validation indicator */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2 uppercase">
            🛡️ Master Administrative Terminal
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            JWT Credentials Active: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px] text-slate-650 dark:text-slate-350 font-mono select-all">Bearer ...{jwtToken.substring(jwtToken.length - 20)}</code>
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 px-3 py-1.5 rounded-xl shrink-0">
          <ShieldCheck className="w-4 h-4" />
          JWT Token Validated (Role: Admin)
        </div>
      </div>

      {/* System analytics grid (Transaction Volume Removed) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide font-sans">System Users</span>
          <p className="text-2xl font-bold font-mono mt-1 text-slate-800 dark:text-slate-100">
            {analytics?.totalUsers || users.length}
          </p>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1">
            <Activity className="w-3 h-3 text-indigo-500" /> Database counts
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide font-sans">API Requests / Day</span>
          <p className="text-2xl font-bold font-mono mt-1 text-slate-800 dark:text-slate-100">
            {analytics?.apiRequestsCount || 1420}
          </p>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1">
            <Server className="w-3 h-3 text-indigo-500" /> Node Proxy Active
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide font-sans">System Health</span>
          <p className="text-xs font-semibold text-indigo-650 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 py-1 px-2.5 rounded-lg text-center mt-1">
            100% Operational
          </p>
          <button 
            onClick={fetchAnalytics}
            disabled={loading}
            className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline self-end flex items-center gap-0.5 mt-2 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Sync Services
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-100 text-red-650 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {/* User Management Database Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">👤 Secure User & Role Management</h3>
          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded">
            Durable Storage
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-150/85 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold">
                <th onClick={() => handleUserSort('name')} className="px-6 py-3 cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                  <span className="flex items-center gap-1">
                    Member Details {userSortField === 'name' ? (userSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </span>
                </th>
                <th onClick={() => handleUserSort('id')} className="px-6 py-3 cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                  <span className="flex items-center gap-1">
                    Unique ID {userSortField === 'id' ? (userSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </span>
                </th>
                <th onClick={() => handleUserSort('role')} className="px-6 py-3 cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                  <span className="flex items-center gap-1">
                    Assigned Role {userSortField === 'role' ? (userSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </span>
                </th>
                <th className="px-6 py-3 text-right">Administrative Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-850/40">
              {sortedUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/30 transition group">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{u.name}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{u.email}</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                    {u.id}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      u.role === 'admin' 
                        ? 'bg-red-50 dark:bg-red-950/30 text-red-650 dark:text-red-400 border border-red-100/50 dark:border-red-900/30' 
                        : u.role === 'manager' 
                        ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-300'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-1.5">
                    {/* Impersonate Mode (Act on Behalf of) */}
                    <button
                      type="button"
                      onClick={() => onImpersonateUser(u)}
                      title={`Impersonate / Act on Behalf of ${u.name}`}
                      className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/30 dark:border-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/70 text-indigo-750 dark:text-indigo-400 text-[10px] font-bold rounded-lg transition duration-150 flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Act on Behalf</span>
                    </button>

                    {/* Reset User */}
                    {u.email !== 'admin@example.com' && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmResetUser(u);
                          setResetPassword(true);
                          setResetExpenses(false);
                        }}
                        title={`Reset credentials or clear expense data for ${u.name}`}
                        className="p-1 px-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-100/30 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50 rounded-lg text-[10px] font-bold transition duration-150 flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Reset User</span>
                      </button>
                    )}

                    {/* Role Assignment Selector (Only show valid roles, cannot add system admins) */}
                    <select
                      value={u.role}
                      disabled={updatingUserId === u.id || u.id === currentUser.id || u.email === 'admin@example.com'}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                    >
                      <option value="member">Member</option>
                      <option value="manager">Billing Manager</option>
                      {u.role === 'admin' && <option value="admin">System Admin</option>}
                    </select>

                    <button
                      type="button"
                      disabled={u.id === currentUser.id || u.email === 'admin@example.com' || deletingUserId !== null}
                      onClick={() => setConfirmDeleteUser(u)}
                      title={u.id === currentUser.id ? "You cannot remove yourself" : `Remove ${u.name} from application`}
                      className={`p-1.5 rounded-lg border transition duration-200 cursor-pointer ${
                        u.id === currentUser.id || u.email === 'admin@example.com'
                          ? 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-slate-350 dark:text-slate-650 cursor-not-allowed opacity-40' 
                          : 'border-red-100 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 text-red-650 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Database Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-1.5">
            <FolderClosed className="w-4 h-4 text-slate-500" /> 📁 Active Split Rooms & Groups Database
          </h3>
          <span className="text-[10px] font-semibold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
            Total Rooms: {groups.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
              No registered groups in the database.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-150/85 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold">
                  <th onClick={() => handleGroupSort('name')} className="px-6 py-3 cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                    <span className="flex items-center gap-1">
                      Group details {groupSortField === 'name' ? (groupSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    </span>
                  </th>
                  <th onClick={() => handleGroupSort('id')} className="px-6 py-3 cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                    <span className="flex items-center gap-1">
                      Unique ID {groupSortField === 'id' ? (groupSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    </span>
                  </th>
                  <th className="px-6 py-3">Base Currency</th>
                  <th onClick={() => handleGroupSort('members')} className="px-6 py-3 text-center cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                    <span className="flex items-center justify-center gap-1">
                      Roommates {groupSortField === 'members' ? (groupSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    </span>
                  </th>
                  <th onClick={() => handleGroupSort('accrued')} className="px-6 py-3 text-right cursor-pointer select-none hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                    <span className="flex items-center justify-end gap-1">
                      Accrued Pool {groupSortField === 'accrued' ? (groupSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-850/40">
                {sortedGroups.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/30 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{g.name}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{g.description || 'No description provided'}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      {g.id}
                    </td>
                    <td className="px-6 py-4 font-mono font-semibold uppercase text-slate-800 dark:text-slate-300">
                      {g.currency}
                    </td>
                    <td className="px-6 py-4 text-center font-semibold font-mono text-slate-700 dark:text-slate-300">
                      {g.members?.length || 0}
                    </td>
                    <td className="px-6 py-4 text-right font-bold font-mono text-indigo-600 dark:text-indigo-400">
                      {g.currency} {(g.totalExpense || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {confirmResetUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col my-8">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850/50">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">👤 Reset User Account</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Administrative manipulation panel</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmResetUser(null)}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Configure administrative reset parameters for <strong>{confirmResetUser.name}</strong> ({confirmResetUser.email}):
              </div>

              <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-150/40 dark:border-slate-800">
                <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetPassword}
                    onChange={(e) => setResetPassword(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span>Reset Account Password</span>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal mt-0.5">
                      Resets user password to a custom manual password (default: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded text-[10px] font-mono font-bold">password</code>)
                    </p>
                  </div>
                </label>

                {resetPassword && (
                  <div className="pl-7 pr-3 py-1 space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Enter Manual Password</label>
                    <input
                      type="text"
                      required
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="password"
                      className="w-full px-2.5 py-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-mono"
                    />
                  </div>
                )}

                <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer pt-2 border-t border-slate-200/50 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={resetExpenses}
                    onChange={(e) => setResetExpenses(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span>Purge Transactional Logs & Splits</span>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal mt-0.5">
                      Deletes all expenses paid by this user and clears them from all shared room split structures.
                    </p>
                  </div>
                </label>
              </div>

              {error && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/25 border border-red-100 dark:border-red-900/30 text-red-750 dark:text-red-400 rounded-lg text-[11px] font-medium leading-normal">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={resettingUserId !== null}
                  onClick={() => setConfirmResetUser(null)}
                  className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-250 rounded-xl text-xs font-semibold transition bg-transparent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={resettingUserId !== null || (!resetPassword && !resetExpenses)}
                  onClick={handleResetUser}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  {resettingUserId ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Performing Reset...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-3.5 h-3.5" /> Execute Manipulation
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col my-8">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850/50">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">⚠️ Remove User from Application</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Permanent administrative system action</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setError('');
                  setConfirmDeleteUser(null);
                }}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to permanently delete <strong>{confirmDeleteUser.name}</strong> ({confirmDeleteUser.email}) from the application database?
              </p>
              
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 p-3 rounded-xl text-xs space-y-1.5 font-medium leading-relaxed">
                <span className="font-bold flex items-center gap-1 text-amber-850 dark:text-amber-400">
                  ⚠️ Critical Safeguards & Deletion Rules:
                </span>
                <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-amber-750 dark:text-amber-400">
                  <li>This user will be permanently deleted from the system user pool.</li>
                  <li>They will be removed from all active Split Rooms they are currently a member of.</li>
                  <li><strong>Security Check:</strong> The system will block removal if the user has any unsettled balances (outstanding dues/credits) anywhere.</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={deletingUserId !== null}
                  onClick={() => {
                    setError('');
                    setConfirmDeleteUser(null);
                  }}
                  className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-250 rounded-xl text-xs font-semibold transition bg-transparent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingUserId !== null}
                  onClick={() => handleDeleteUser(confirmDeleteUser.id)}
                  className="px-4 py-2 bg-red-650 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {deletingUserId ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" /> Verifying & Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" /> Confirm Deletion
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
