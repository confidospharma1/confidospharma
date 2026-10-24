import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ShieldCheck, Lock, User, AlertCircle, Building2, Sparkles } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail || !password) return;

    setLoading(true);
    setError('');

    try {
      const data = await api.login({ usernameOrEmail, password });
      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (uname: string, pwd = 'Pharma@2026') => {
    setUsernameOrEmail(uname);
    setPassword(pwd);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 shadow-xl space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white font-black text-2xl flex items-center justify-center mx-auto shadow-md">
            CP
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Confidos Pharma</h1>
          <p className="text-xs text-slate-500 font-medium">
            Multi-Branch Pharmacy Inventory & Counter Billing System
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Username or Email</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="e.g. superadmin or bill_vja_1"
                className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all focus:ring-4 focus:ring-emerald-500/20"
          >
            {loading ? 'Authenticating...' : 'Sign In to Pharmacy OS'}
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
            Demo Evaluation Roles (Password: Pharma@2026)
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => handleQuickLogin('superadmin')}
              className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
            >
              <span className="font-bold text-slate-800 block text-[11px]">Super Admin</span>
              <span className="text-[10px] text-slate-500 font-mono">superadmin</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('admin_vja')}
              className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
            >
              <span className="font-bold text-slate-800 block text-[11px]">VJA Admin</span>
              <span className="text-[10px] text-slate-500 font-mono">admin_vja</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('admin_gnt')}
              className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
            >
              <span className="font-bold text-slate-800 block text-[11px]">GNT Admin</span>
              <span className="text-[10px] text-slate-500 font-mono">admin_gnt</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('bill_vja_1')}
              className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
            >
              <span className="font-bold text-slate-800 block text-[11px]">VJA Cashier</span>
              <span className="text-[10px] text-slate-500 font-mono">bill_vja_1</span>
            </button>
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-400">
          Secured with Argon2 / bcrypt hashing & branch isolation middleware.
        </div>
      </div>
    </div>
  );
};
