/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, UserRole } from '../types.js';
import { Shield, Key, Sparkles, UserCheck, Lock } from 'lucide-react';

interface AuthScreenProps {
  onAuthSuccess: (user: User, token: string) => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const preseededUsers = [
    { email: 'admin@example.com', name: 'Default Admin', role: 'admin' as const },
    { email: 'cbiswajeet89@gmail.com', name: 'Biswajeet Admin', role: 'admin' as const },
    { email: 'alice@example.com', name: 'Alice Smith', role: 'admin' as const },
    { email: 'bob@example.com', name: 'Bob Johnson', role: 'manager' as const },
    { email: 'charlie@example.com', name: 'Charlie Davis', role: 'member' as const }
  ];

  const handleAuth = async (e?: React.FormEvent, selectedUser?: typeof preseededUsers[0]) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    const targetEmail = selectedUser ? selectedUser.email : email;
    const targetPassword = selectedUser ? 'admin123' : password;

    if (!targetEmail || !targetPassword || (isRegistering && !name)) {
      setError(isRegistering ? 'Please provide email, name, and password.' : 'Please provide both email and password.');
      setLoading(false);
      return;
    }

    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const bodyPayload = isRegistering 
        ? { email: targetEmail, name, password: targetPassword } 
        : { email: targetEmail, password: targetPassword };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      onAuthSuccess(
        {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          createdAt: data.user.createdAt
        },
        data.token
      );
    } catch (err: any) {
      setError(err.message || 'Something went wrong during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
      <div className="w-full max-w-md bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-100/50 p-8 relative overflow-hidden">
        {/* Decorative background gradients */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-2xl opacity-60 -mr-10 -mt-10"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-50 rounded-full blur-2xl opacity-60 -ml-10 -mb-10"></div>

        <div className="relative text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white mb-3 shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Splitwise Workspace</h1>
          <p className="text-slate-400 text-xs mt-1">RESTful & Firebase Secured Expense Auditing</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs leading-relaxed">
            {error}
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex border-b border-slate-150 mb-6 text-xs font-bold uppercase tracking-wide">
          <button
            type="button"
            className={`flex-1 pb-3 transition-colors ${!isRegistering ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            onClick={() => { setIsRegistering(false); setError(''); setPassword(''); }}
          >
            Sign In / Quick Sandbox
          </button>
          <button
            type="button"
            className={`flex-1 pb-3 transition-colors ${isRegistering ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            onClick={() => { setIsRegistering(true); setError(''); setPassword(''); }}
          >
            Create New Account
          </button>
        </div>

        {!isRegistering ? (
          <div>
            {/* Quick Sandbox Profiles */}
            <div className="mb-6">
              <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-3">
                ⚡ Quick Sign-In (Default Password: <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px] font-mono text-slate-600 select-all">admin123</code>)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {preseededUsers.map((user) => (
                  <button
                    key={user.email}
                    onClick={() => handleAuth(undefined, user)}
                    disabled={loading}
                    className="flex flex-col items-start p-3 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 border border-slate-150 rounded-xl transition text-left disabled:opacity-50 group"
                  >
                    <span className="text-xs font-semibold text-slate-700 group-hover:text-indigo-600 transition">
                      {user.name.split(' ')[0]}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {user.role.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-100"></div>
              <span className="flex-shrink mx-4 text-slate-400 text-[10px] uppercase tracking-wider">or login credentials</span>
              <div className="flex-grow border-t border-slate-100"></div>
            </div>

            <form onSubmit={handleAuth} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl text-xs transition shadow-lg shadow-indigo-100 disabled:opacity-50"
              >
                {loading ? 'Securing Session...' : 'Enter Workspace'}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@example.com"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Biswajeet"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-2.5 mt-2">
              <Shield className="w-4.5 h-4.5 text-indigo-500 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-indigo-700 leading-normal">
                To maintain standard safety rules, newly created accounts are initialized with standard <strong>Group Member</strong> roles by default. Only designated Administrators can adjust role policies inside the Administrative Terminal.
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl text-xs transition shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              {loading ? 'Generating JWT Token...' : 'Register & Enter'}
            </button>
          </form>
        )}

        <div className="mt-6 flex justify-center items-center gap-1.5 text-slate-400 text-xs font-mono">
          <Lock className="w-3.5 h-3.5 text-indigo-500" />
          <span>Secured via PBKDF2 / SHA-256 Hashes</span>
        </div>
      </div>
    </div>
  );
}
