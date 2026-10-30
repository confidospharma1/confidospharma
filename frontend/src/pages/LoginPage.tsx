import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ShieldCheck, Lock, User, AlertCircle, Sparkles } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();

  // Mode: regular login or initial onboarding
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Login form state
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');

  // Onboarding form state
  const [onboardingForm, setOnboardingForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: 'Confidos Pharma Ltd.',
    branchName: '',
    branchCode: '',
    branchAddress: '',
    branchPhone: '',
    branchGstin: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await api.getSetupStatus();
        setNeedsSetup(res.needsSetup);
      } catch (err) {
        // If API unreachable or fails, default to login form
        setNeedsSetup(false);
      } finally {
        setCheckingSetup(false);
      }
    };

    checkStatus();
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
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

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardingForm.fullName || !onboardingForm.username || !onboardingForm.email || !onboardingForm.password) {
      setError('Please fill in all required administrator fields.');
      return;
    }

    if (onboardingForm.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (onboardingForm.password !== onboardingForm.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload: any = {
        fullName: onboardingForm.fullName,
        username: onboardingForm.username,
        email: onboardingForm.email,
        password: onboardingForm.password,
        companyName: onboardingForm.companyName || 'Confidos Pharma Ltd.',
      };

      if (onboardingForm.branchName && onboardingForm.branchCode) {
        payload.branchName = onboardingForm.branchName;
        payload.branchCode = onboardingForm.branchCode;
        payload.branchAddress = onboardingForm.branchAddress;
        payload.branchPhone = onboardingForm.branchPhone;
        payload.branchGstin = onboardingForm.branchGstin;
      }

      const data = await api.setupAdmin(payload);
      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize administrator account.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
        <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Connecting to Confidos Pharma OS...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-3 sm:p-4">
      <div className={`w-full max-w-[calc(100vw-1.5rem)] ${needsSetup ? 'sm:max-w-xl' : 'sm:max-w-md'} bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm space-y-5 sm:space-y-6 transition-all`}>
        {/* Brand Header with Authentic Logo */}
        <div className="text-center space-y-2">
          <img
            src="/confidos-logo.png"
            alt="Confidos Pharma"
            className="h-11 sm:h-14 w-auto max-w-[190px] sm:max-w-[210px] object-contain mx-auto"
          />
          <p className="text-xs text-slate-500 font-medium tracking-wide">
            Enterprise Multi-Branch Pharmacy Management & Counter Billing OS
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {needsSetup ? (
          /* Initial Administrator Onboarding Mode */
          <div className="space-y-4">
            <div className="bg-brand-50 border border-brand-200 rounded-xl p-3.5 text-xs text-brand-900">
              <div className="flex items-center gap-2 font-bold mb-1">
                <Sparkles className="w-4 h-4 text-brand-600 flex-shrink-0" />
                <span>Initial Database Onboarding</span>
              </div>
              <p className="text-[11px] text-brand-800">
                The database is connected and currently contains zero user accounts. Create your primary Super Administrator account to initialize system access.
              </p>
            </div>

            <form onSubmit={handleOnboardingSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Ramesh Kumar"
                    value={onboardingForm.fullName}
                    onChange={(e) => setOnboardingForm({ ...onboardingForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. admin"
                    value={onboardingForm.username}
                    onChange={(e) => setOnboardingForm({ ...onboardingForm, username: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Official Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="admin@confidospharma.com"
                  value={onboardingForm.email}
                  onChange={(e) => setOnboardingForm({ ...onboardingForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Password * (min 8 chars)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="••••••••••••"
                    value={onboardingForm.password}
                    onChange={(e) => setOnboardingForm({ ...onboardingForm, password: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Confirm Password *</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="••••••••••••"
                    value={onboardingForm.confirmPassword}
                    onChange={(e) => setOnboardingForm({ ...onboardingForm, confirmPassword: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Initial Branch Configuration (Optional)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Primary Branch Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Vijayawada Central Branch"
                      value={onboardingForm.branchName}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, branchName: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Branch Code</label>
                    <input
                      type="text"
                      placeholder="e.g. B-VJA"
                      value={onboardingForm.branchCode}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, branchCode: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all focus:ring-4 focus:ring-brand-500/20"
              >
                {loading ? 'Initializing Administrator...' : 'Create Super Administrator & Initialize OS'}
              </button>
            </form>
          </div>
        ) : (
          /* Standard Authenticated Sign-In Mode */
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Username or Email</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="Enter your registered username or email"
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 font-medium"
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
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all focus:ring-4 focus:ring-brand-500/20"
            >
              {loading ? 'Authenticating...' : 'Sign In to Pharmacy OS'}
            </button>
          </form>
        )}

        <div className="text-center text-[10px] text-slate-400 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-center gap-1.5 text-center">
          <ShieldCheck className="w-3.5 h-3.5 text-brand-500 shrink-0" />
          <span>PostgreSQL Persistent Database • Enterprise Branch Scope Isolation</span>
        </div>
      </div>
    </div>
  );
};
