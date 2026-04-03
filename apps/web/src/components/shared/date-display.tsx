'use client';

import { formatDateIST, formatTimestampIST } from '@/lib/date-utils';

interface DateDisplayProps {
  /** ISO 8601 date string */
  date: string;
  /** Include HH:mm time in IST (default: false) */
  showTime?: boolean;
  className?: string;
}

/**
 * Displays a date formatted in IST (Asia/Kolkata).
 * - Date only: DD-MMM-YYYY (e.g. "15-Jan-2024")
 * - With time: DD-MMM-YYYY HH:mm (e.g. "15-Jan-2024 14:30")
 */
export function DateDisplay({ date, showTime = false, className }: DateDisplayProps) {
  const formatted = showTime ? formatTimestampIST(date) : formatDateIST(date);

  return (
    <time dateTime={date} className={className}>
      {formatted}
    </time>
  );
}
