import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorMessageProps {
  message: string;
  className?: string;
}

export function ErrorMessage({ message, className }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive',
        className,
      )}
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
