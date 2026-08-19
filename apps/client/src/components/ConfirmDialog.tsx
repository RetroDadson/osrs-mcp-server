import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { MenButton } from './MenButton.js';

interface ConfirmOptions {
  headline: string;
  body: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmFn | undefined>(undefined);

export function ConfirmDialogProvider({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const close = (result: boolean): void => {
    setOptions(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {options && (
        <div className="dialog dialog__visible">
          <div className="dialog__container rsborder rsbackground">
            <h2>{options.headline}</h2>
            <p>{options.body}</p>
            <div className="dialog__actions">
              <MenButton onClick={() => close(true)}>Yes</MenButton>
              <MenButton onClick={() => close(false)}>No</MenButton>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  return useMemo(() => ctx, [ctx]);
}
