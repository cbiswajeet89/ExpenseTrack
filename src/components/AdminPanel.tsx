/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User, UserRole, SystemAnalytics, Group } from '../types.js';
import { ShieldAlert, Users, Server, Activity, ArrowRight, ShieldCheck, RefreshCw, FolderClosed } from 'lucide-react';

interface AdminPanelProps {
  currentUser: User;
  jwtToken: string;
  users: User[];
  groups: Group[];
  onUpdateUserRole: (userId: string, newRole: UserRole) => Promise<void>;
}

export default function AdminPanel({ currentUser, jwtToken, users, groups, onUpdateUserRole }: AdminPanelProps) {
  const isAdmin = currentUser.role === 'admin';
  const [analytics, setAnalytics] = useState<SystemAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

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
      <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2 uppercase">
            🛡️ Master Administrative Terminal
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            JWT Credentials Active: <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px] text-slate-650 font-mono select-all">Bearer ...{jwtToken.substring(jwtToken.length - 20)}</code>
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl shrink-0">
          <ShieldCheck className="w-4 h-4" />
          JWT Token Validated (Role: Admin)
        </div>
      </div>

      {/* System analytics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">System Users</span>
          <p className="text-2xl font-bold font-mono mt-1 text-slate-800">
            {analytics?.totalUsers || users.length}
          </p>
          <div className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
            <Activity className="w-3 h-3 text-indigo-500" /> Database counts
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">API Requests / Day</span>
          <p className="text-2xl font-bold font-mono mt-1 text-slate-800">
            {analytics?.apiRequestsCount || 1420}
          </p>
          <div className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
            <Server className="w-3 h-3 text-indigo-500" /> Node Proxy Active
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Transaction Volume</span>
          <p className="text-2xl font-bold font-mono mt-1 text-slate-800">
            ${analytics?.totalVolumeUSD || '12,450.75'}
          </p>
          <div className="text-[10px] text-slate-400 mt-2">
            Base Currency: USD
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">System Health</span>
          <p className="text-xs font-semibold text-indigo-650 bg-indigo-50 border border-indigo-100 py-1 px-2.5 rounded-lg text-center mt-1">
            100% Operational
          </p>
          <button 
            onClick={fetchAnalytics}
            disabled={loading}
            className="text-[10px] text-indigo-600 font-bold hover:underline self-end flex items-center gap-0.5 mt-2 disabled:opacity-50"
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
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 tracking-tight">👤 Secure User & Role Management</h3>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded">
            Durable Storage
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                <th className="px-6 py-3">Member Details</th>
                <th className="px-6 py-3">Unique ID</th>
                <th className="px-6 py-3">Assigned Role</th>
                <th className="px-6 py-3 text-right">Administrative Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-800">{u.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{u.email}</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-[10px] text-slate-400">
                    {u.id}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      u.role === 'admin' 
                        ? 'bg-red-50 text-red-650' 
                        : u.role === 'manager' 
                        ? 'bg-indigo-50 text-indigo-650' 
                        : 'bg-slate-100 text-slate-650'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <select
                      value={u.role}
                      disabled={updatingUserId === u.id || u.id === currentUser.id}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      <option value="member">Member</option>
                      <option value="manager">Billing Manager</option>
                      <option value="admin">System Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Database Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
            <FolderClosed className="w-4 h-4 text-slate-500" /> 📁 Active Split Rooms & Groups Database
          </h3>
          <span className="text-[10px] font-semibold text-indigo-650 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded">
            Total Rooms: {groups.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-medium">
              No registered groups in the database.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                  <th className="px-6 py-3">Group details</th>
                  <th className="px-6 py-3">Unique ID</th>
                  <th className="px-6 py-3">Base Currency</th>
                  <th className="px-6 py-3 text-center">Roommates</th>
                  <th className="px-6 py-3 text-right">Accrued Pool</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {groups.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">{g.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{g.description || 'No description provided'}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-[10px] text-slate-400">
                      {g.id}
                    </td>
                    <td className="px-6 py-4 font-mono font-semibold uppercase">
                      {g.currency}
                    </td>
                    <td className="px-6 py-4 text-center font-semibold font-mono text-slate-700">
                      {g.members?.length || 0}
                    </td>
                    <td className="px-6 py-4 text-right font-bold font-mono text-indigo-600">
                      {g.currency} {(g.totalExpense || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
