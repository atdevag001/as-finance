'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './auth-provider';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <AuthProvider>{children}</AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

export { AuthProvider, useAuth } from './auth-provider';
export type { AuthUser } from './auth-provider';
export { QueryProvider } from './query-provider';
export { ThemeProvider, useTheme } from './theme-provider';
