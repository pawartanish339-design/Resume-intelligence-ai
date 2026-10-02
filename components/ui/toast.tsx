'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

/**
 * Tiny toast system: a context provider plus an imperative `useToast()` hook.
 * Announced via aria-live so screen readers hear successes and errors.
 */

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef(new Map<string, number>());

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = React.useCallback<ToastContextValue['push']>(
    ({ duration = 6_000, ...toast }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-3), { ...toast, id, duration }]);

      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  React.useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const value = React.useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-4 shadow-lg animate-fade-in',
              toast.variant === 'error' && 'border-destructive/50',
              toast.variant === 'success' && 'border-emerald-500/50',
              toast.variant === 'warning' && 'border-amber-500/50',
            )}
            role={toast.variant === 'error' ? 'alert' : 'status'}
          >
            <span aria-hidden="true" className="mt-0.5">
              {toast.variant === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
              ) : toast.variant === 'error' ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : toast.variant === 'warning' ? (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              ) : (
                <Info className="h-5 w-5 text-primary" />
              )}
            </span>

            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description ? (
                <p className="text-sm text-muted-foreground">{toast.description}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return context;
}
