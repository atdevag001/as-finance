import { cn } from '@/lib/utils';
import type { Step } from '../_content/_types';
import { Screenshot } from './screenshot';

export function StepList({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn('list-decimal space-y-4 pl-6', className)}>
      {steps.map((step, i) => (
        <li key={i} className="pl-1">
          <p className="leading-relaxed">{step.text}</p>
          {step.screenshot ? <Screenshot shot={step.screenshot} className="my-3" /> : null}
        </li>
      ))}
    </ol>
  );
}
