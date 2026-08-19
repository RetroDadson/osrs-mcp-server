import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { SHARED_MEMBER } from '@osrs-mcp/shared';
import { getLoginData } from '../api/client.js';
import { clearStoredLogin, getStoredLogin, storeLogin } from './storage.js';

export interface Member {
  name: string;
}

interface LoginContextValue {
  loginName: string | null;
  token: string | null;
  members: Member[];
  isAuthenticated: boolean;
  setCredentials: (loginName: string, token: string) => void;
  refreshMembers: () => Promise<void>;
  logout: () => void;
}

const LoginContext = createContext<LoginContextValue | undefined>(undefined);

export function LoginProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const stored = getStoredLogin();
  const [loginName, setLoginName] = useState<string | null>(stored.loginName);
  const [token, setToken] = useState<string | null>(stored.token);
  const [members, setMembers] = useState<Member[]>([]);

  const setCredentials = useCallback((name: string, newToken: string) => {
    storeLogin(name, newToken);
    setLoginName(name);
    setToken(newToken);
  }, []);

  const refreshMembers = useCallback(async () => {
    if (!loginName || !token) return;
    const data = await getLoginData(loginName, token);
    setMembers(data.filter((m) => m.name !== SHARED_MEMBER).map((m) => ({ name: m.name })));
  }, [loginName, token]);

  const logout = useCallback(() => {
    clearStoredLogin();
    setLoginName(null);
    setToken(null);
    setMembers([]);
  }, []);

  const value = useMemo(
    () => ({
      loginName,
      token,
      members,
      isAuthenticated: Boolean(loginName && token),
      setCredentials,
      refreshMembers,
      logout,
    }),
    [loginName, token, members, setCredentials, refreshMembers, logout],
  );

  return <LoginContext.Provider value={value}>{children}</LoginContext.Provider>;
}

export function useLogin(): LoginContextValue {
  const ctx = useContext(LoginContext);
  if (!ctx) throw new Error('useLogin must be used within a LoginProvider');
  return ctx;
}
