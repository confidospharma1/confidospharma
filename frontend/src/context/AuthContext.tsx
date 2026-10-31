import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Branch } from '../types';
import { api, getAuthToken, setAuthToken, removeAuthToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  selectedBranchId: string;
  branches: Branch[];
  setSelectedBranchId: (id: string) => void;
  login: (token: string, userData: User) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  isSuperAdmin: boolean;
  isBranchAdmin: boolean;
  isBillingUser: boolean;
  currentBranch: Branch | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  const fetchProfile = async () => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await api.getMe();
      setUser(data.user);

      // Load branches
      const branchList = await api.getBranches();
      setBranches(branchList);

      if (data.user.role === 'SUPER_ADMIN') {
        // Default to first branch or saved branch
        const saved = localStorage.getItem('confidos_selected_branch');
        if (saved && branchList.some((b: Branch) => b.id === saved)) {
          setSelectedBranchId(saved);
        } else if (branchList.length > 0) {
          setSelectedBranchId(branchList[0].id);
        }
      } else {
        setSelectedBranchId(data.user.branchId || '');
      }
    } catch {
      // Clear token and reset user on authentication failure
      removeAuthToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleBranchSelect = (id: string) => {
    if (user?.role === 'SUPER_ADMIN') {
      setSelectedBranchId(id);
      localStorage.setItem('confidos_selected_branch', id);
    }
  };

  const login = (token: string, userData: User) => {
    setAuthToken(token);
    setUser(userData);
    setSelectedBranchId(userData.branchId || '');
    fetchProfile();
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (e) {}
    removeAuthToken();
    setUser(null);
    setBranches([]);
    setSelectedBranchId('');
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isBranchAdmin = user?.role === 'BRANCH_ADMIN';
  const isBillingUser = user?.role === 'BILLING_USER';

  const currentBranch = branches.find((b) => b.id === selectedBranchId) || (user?.branch || null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        selectedBranchId,
        branches,
        setSelectedBranchId: handleBranchSelect,
        login,
        logout,
        refreshProfile: fetchProfile,
        isSuperAdmin,
        isBranchAdmin,
        isBillingUser,
        currentBranch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
