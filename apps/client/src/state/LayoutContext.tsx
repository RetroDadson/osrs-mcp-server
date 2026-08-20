import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { getLayoutDirection, setLayoutDirection as persistLayoutDirection, type LayoutDirection } from './storage.js';

interface LayoutContextValue {
  direction: LayoutDirection;
  setDirection: (direction: LayoutDirection) => void;
}

const LayoutContext = createContext<LayoutContextValue | undefined>(undefined);

export function LayoutProvider({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const [direction, setDirectionState] = useState<LayoutDirection>(getLayoutDirection());

  const setDirection = useCallback((value: LayoutDirection) => {
    persistLayoutDirection(value);
    setDirectionState(value);
  }, []);

  const value = useMemo(() => ({ direction, setDirection }), [direction, setDirection]);

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayoutDirection(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayoutDirection must be used within a LayoutProvider');
  return ctx;
}
