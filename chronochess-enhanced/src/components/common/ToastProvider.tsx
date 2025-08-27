import React, { createContext, useContext, useCallback, useState } from 'react';
import { setShowToast } from './toastService';
import './Toast.css';

type Toast = {
  id: string;
  message: string;
  level?: 'info' | 'success' | 'error';
  duration?: number;
};

type ToastContextValue = {
  showToast: (message: string, opts?: { level?: Toast['level']; duration?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const DEDUPE_WINDOW = 700; // ms - if an identical toast appears within this window, ignore duplicate

  const showToast = useCallback(
    (message: string, opts?: { level?: Toast['level']; duration?: number }) => {
      const now = Date.now();
      const id = `toast-${now}-${Math.random().toString(36).slice(2, 8)}`;
      const toast: Toast & { _createdAt?: number } = {
        id,
        message,
        level: opts?.level || 'info',
        duration: opts?.duration ?? 3000,
        _createdAt: now,
      };

      setToasts(prev => {
        // If an identical toast (same message & level) was created very recently, skip adding a duplicate
        const duplicate = prev.some(t => {
          const tCreated = (t as any)._createdAt as number | undefined;
          return (
            t.message === message &&
            t.level === toast.level &&
            typeof tCreated !== 'undefined' &&
            now - tCreated < DEDUPE_WINDOW
          );
        });

        if (duplicate) return prev;

        // schedule removal
        const timeoutId = window.setTimeout(() => removeToast(id), toast.duration);
        (toast as any)._timeoutId = timeoutId as unknown as number;
        return [toast, ...prev];
      });
    },
    [removeToast]
  );

  // Expose a global fallback for non-React modules (store, engine, renderer)
  React.useEffect(() => {
    try {
      // Prefer setting the importable toast service so non-React modules can import it.
      setShowToast(showToast);
      // Keep global fallback for older code paths
      (globalThis as any).showToast = showToast;
    } catch (err) {
      // ignore in constrained environments
    }
    return () => {
      try {
        setShowToast(() => {});
        if ((globalThis as any).showToast === showToast) delete (globalThis as any).showToast;
      } catch (err) {}
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-root" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.level}`} role="status" aria-atomic="true">
            <div className="toast__message">{t.message}</div>
            <button
              className="toast__close"
              aria-label="Dismiss notification"
              onClick={() => {
                // clear timeout if present
                try {
                  const to = (t as any)._timeoutId;
                  if (to) window.clearTimeout(to);
                } catch {}
                removeToast(t.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
