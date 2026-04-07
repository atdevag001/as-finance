'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './auth-provider';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';
import { ToastProvider } from './toast-provider';
import { ToastContainer } from '@/components/shared/toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
          <ToastContainer />
        </ToastProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

export { AuthProvider, useAuth } from './auth-provider';
export type { AuthUser } from './auth-provider';
export { QueryProvider } from './query-provider';
export { ThemeProvider, useTheme } from './theme-provider';
export { ToastProvider, useToast } from './toast-provider';
export type { ToastVariant, ToastItem } from './toast-provider';
