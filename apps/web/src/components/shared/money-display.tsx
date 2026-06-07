'use client';

import { cn } from '@/lib/utils';

/**
 * Coerces a paise value (which may arrive as a string from the API since BigInt serializes to
 * string) into bigint. Returns BigInt(0) for non-finite / unparseable inputs so the UI never crashes.
 */
function toPaiseBigInt(paise: number | string | bigint): bigint {
  if (typeof paise === 'bigint') return paise;
  if (typeof paise === 'number') {
    if (!Number.isFinite(paise)) return BigInt(0);
    return BigInt(Math.trunc(paise));
  }
  // string: tolerate a leading minus, ignore fractional paise (Indian money is integral paise).
  const trimmed = paise.trim();
  if (trimmed === '' || !/^-?\d+$/.test(trimmed)) return BigInt(0);
  return BigInt(trimmed);
}

/**
 * Formats paise to INR with Indian comma grouping.
 * Indian grouping: last 3 digits, then groups of 2.
 * Example: 12345678 paise → "₹1,23,456.78"
 */
export function formatPaiseToINR(paise: number | string | bigint): string {
  const value = toPaiseBigInt(paise);
  const isNegative = value < BigInt(0);
  const absPaise = isNegative ? -value : value;
  const rupees = absPaise / BigInt(100);
  const paisa = absPaise % BigInt(100);
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
  /** Amount in paise. Accepts string (API BigInt serialization), number, or bigint. */
  paise: number | string | bigint;
  /** Show negative amounts in red */
  colorNegative?: boolean;
  className?: string;
}

export function MoneyDisplay({ paise, colorNegative = true, className }: MoneyDisplayProps) {
  const formatted = formatPaiseToINR(paise);
  const isNegative = toPaiseBigInt(paise) < BigInt(0);

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
