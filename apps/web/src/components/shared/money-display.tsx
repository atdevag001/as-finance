'use client';

import { cn } from '@/lib/utils';

/**
 * Formats paise to INR with Indian comma grouping.
 * Indian grouping: last 3 digits, then groups of 2.
 * Example: 12345678 paise → "₹1,23,456.78"
 */
function formatPaiseToINR(paise: number): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const paisa = absPaise % 100;
  const decPart = paisa.toString().padStart(2, '0');

  const intStr = rupees.toString();
  let formatted: string;
  if (intStr.length <= 3) {
    formatted = intStr;
  } else {
    const last3 = intStr.slice(-3);
    const rest = intStr.slice(0, -3);
    const groups: string[] = [];
    for (let i = rest.length; i > 0; i -= 2) {
      groups.unshift(rest.slice(Math.max(0, i - 2), i));
    }
    formatted = groups.join(',') + ',' + last3;
  }

  return `${isNegative ? '-' : ''}₹${formatted}.${decPart}`;
}

interface MoneyDisplayProps {
  /** Amount in paise (integer) */
  paise: number;
  /** Show negative amounts in red */
  colorNegative?: boolean;
  className?: string;
}

export function MoneyDisplay({ paise, colorNegative = true, className }: MoneyDisplayProps) {
  const formatted = formatPaiseToINR(paise);
  const isNegative = paise < 0;

  return (
    <span
      className={cn(
        'tabular-nums',
        colorNegative && isNegative && 'text-destructive',
        className,
      )}
    >
      {formatted}
    </span>
  );
}
