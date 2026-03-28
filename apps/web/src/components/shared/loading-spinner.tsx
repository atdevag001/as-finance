import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-3',
} as const;

interface LoadingSpinnerProps {
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'animate-spin rounded-full border-primary border-t-transparent',
        SIZE_CLASSES[size],
        className,
      )}
    >
      <span className="sr-only">Loading…</span>
    </div>
  );
}
