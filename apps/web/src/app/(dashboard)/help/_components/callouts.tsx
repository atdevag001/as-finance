import { Info, AlertTriangle, Heart, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

type CalloutProps = {
  children: React.ReactNode;
  className?: string;
};

function Callout({
  icon: Icon,
  tone,
  children,
  className,
  label,
}: CalloutProps & {
  icon: typeof Info;
  tone: 'info' | 'warning' | 'reassure' | 'example';
  label: string;
}) {
  const tones = {
    info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100',
    warning:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100',
    reassure:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
    example:
      'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100',
  };

  return (
    <aside
      className={cn('my-4 flex gap-3 rounded-md border-l-4 px-4 py-3 text-sm', tones[tone], className)}
      role="note"
      aria-label={label}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
    </aside>
  );
}

export function Tip({ children, className }: CalloutProps) {
  return (
    <Callout icon={Info} tone="info" label="Tip" className={className}>
      {children}
    </Callout>
  );
}

export function Warning({ children, className }: CalloutProps) {
  return (
    <Callout icon={AlertTriangle} tone="warning" label="Warning" className={className}>
      {children}
    </Callout>
  );
}

export function Reassure({ children, className }: CalloutProps) {
  return (
    <Callout icon={Heart} tone="reassure" label="Reassurance" className={className}>
      {children}
    </Callout>
  );
}

export function ExampleBox({
  title,
  children,
  className,
}: CalloutProps & { title: string }) {
  return (
    <Callout icon={Lightbulb} tone="example" label="Worked example" className={className}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1 whitespace-pre-line">{children}</div>
    </Callout>
  );
}
