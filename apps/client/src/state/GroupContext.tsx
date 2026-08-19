import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { SHARED_MEMBER } from '@osrs-mcp/shared';
import { getGroupData } from '../api/client.js';
import { clearStoredGroup, getStoredGroup, storeGroup } from './storage.js';

export interface Member {
  name: string;
}

interface GroupContextValue {
  groupName: string | null;
  groupToken: string | null;
  members: Member[];
  isAuthenticated: boolean;
  setCredentials: (groupName: string, groupToken: string) => void;
  refreshMembers: () => Promise<void>;
  logout: () => void;
}

const GroupContext = createContext<GroupContextValue | undefined>(undefined);

export function GroupProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const stored = getStoredGroup();
  const [groupName, setGroupName] = useState<string | null>(stored.groupName);
  const [groupToken, setGroupToken] = useState<string | null>(stored.groupToken);
  const [members, setMembers] = useState<Member[]>([]);

  const setCredentials = useCallback((name: string, token: string) => {
    storeGroup(name, token);
    setGroupName(name);
    setGroupToken(token);
  }, []);

  const refreshMembers = useCallback(async () => {
    if (!groupName || !groupToken) return;
    const data = await getGroupData(groupName, groupToken);
    setMembers(data.filter((m) => m.name !== SHARED_MEMBER).map((m) => ({ name: m.name })));
  }, [groupName, groupToken]);

  const logout = useCallback(() => {
    clearStoredGroup();
    setGroupName(null);
    setGroupToken(null);
    setMembers([]);
  }, []);

  const value = useMemo(
    () => ({
      groupName,
      groupToken,
      members,
      isAuthenticated: Boolean(groupName && groupToken),
      setCredentials,
      refreshMembers,
      logout,
    }),
    [groupName, groupToken, members, setCredentials, refreshMembers, logout],
  );

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup must be used within a GroupProvider');
  return ctx;
}
