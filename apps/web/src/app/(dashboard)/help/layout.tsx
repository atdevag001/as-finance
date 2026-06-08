import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { HelpLangProvider } from './_components/help-language-context';

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <HelpLangProvider>
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </HelpLangProvider>
    </Suspense>
  );
}
