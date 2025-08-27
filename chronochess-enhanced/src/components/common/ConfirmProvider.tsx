import React, { createContext, useCallback, useContext, useState } from 'react';
import './Confirm.css';

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
};

type ConfirmFn = (message: string, opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{
    open: boolean;
    message: string;
    opts?: ConfirmOptions;
    resolver?: (val: boolean) => void;
  }>({ open: false, message: '', opts: undefined });

  const confirm: ConfirmFn = useCallback((message: string, opts?: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setState({ open: true, message, opts, resolver: resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    if (state.resolver) state.resolver(result);
    setState({ open: false, message: '', opts: undefined });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {state.open && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal surface-elevated">
            <h3>{state.opts?.title || 'Confirm'}</h3>
            <p>{state.message}</p>
            {state.opts?.description && <p className="confirm-desc">{state.opts.description}</p>}
            <div className="confirm-actions">
              <button
                className="btn btn--small"
                onClick={() => handleClose(false)}
                aria-label={state.opts?.cancelText || 'Cancel'}
              >
                {state.opts?.cancelText || 'Cancel'}
              </button>
              <button
                className="btn btn--small btn--danger"
                onClick={() => handleClose(true)}
                aria-label={state.opts?.confirmText || 'Confirm'}
              >
                {state.opts?.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export default ConfirmProvider;
