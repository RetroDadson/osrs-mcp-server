import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { clearStoredLogin, getStoredLogin, storeLogin } from './storage.js';

interface LoginContextValue {
  loginName: string | null;
  token: string | null;
  isAuthenticated: boolean;
  setCredentials: (loginName: string, token: string) => void;
  logout: () => void;
}

const LoginContext = createContext<LoginContextValue | undefined>(undefined);

export function LoginProvider({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const stored = getStoredLogin();
  const [loginName, setLoginName] = useState<string | null>(stored.loginName);
  const [token, setToken] = useState<string | null>(stored.token);

  const setCredentials = useCallback((name: string, newToken: string) => {
    storeLogin(name, newToken);
    setLoginName(name);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    clearStoredLogin();
    setLoginName(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({
      loginName,
      token,
      isAuthenticated: Boolean(loginName && token),
      setCredentials,
      logout,
    }),
    [loginName, token, setCredentials, logout],
  );

  return <LoginContext.Provider value={value}>{children}</LoginContext.Provider>;
}

export function useLogin(): LoginContextValue {
  const ctx = useContext(LoginContext);
  if (!ctx) throw new Error('useLogin must be used within a LoginProvider');
  return ctx;
}
