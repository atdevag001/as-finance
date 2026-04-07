'use client';

import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast, type ToastVariant } from '@/providers/toast-provider';

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-green-500/30 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-orange-500/30 bg-orange-50 text-orange-900 dark:bg-orange-950 dark:text-orange-100',
};

const VARIANT_ICONS: Record<ToastVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
};

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
    >
      {toasts.map((toast) => {
        const Icon = VARIANT_ICONS[toast.variant];
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'flex items-center gap-2 rounded-md border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-right-full fade-in duration-200',
              VARIANT_STYLES[toast.variant],
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 rounded-sm p-0.5 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
