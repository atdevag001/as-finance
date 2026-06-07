'use client';

import { cn } from '@/lib/utils';

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'overdue-1' | 'overdue-2' | 'overdue-3' | 'overdue-4';

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  'overdue-1': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  'overdue-2': 'bg-orange-200 text-orange-900 dark:bg-orange-900/40 dark:text-orange-300',
  'overdue-3': 'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300',
  'overdue-4': 'bg-red-300 text-red-950 dark:bg-red-900/60 dark:text-red-200',
};

/** Maps loan statuses to visual variants */
const LOAN_STATUS_MAP: Record<string, StatusVariant> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'info',
  approved: 'success',
  rejected: 'danger',
  disbursed: 'info',
  active: 'success',
  overdue: 'warning',
  defaulted: 'danger',
  foreclosed: 'warning',
  closed: 'neutral',
};

/** Maps overdue buckets to visual variants */
const OVERDUE_BUCKET_MAP: Record<string, StatusVariant> = {
  bucket_0: 'success',
  bucket_1_30: 'overdue-1',
  bucket_31_60: 'overdue-2',
  bucket_61_90: 'overdue-3',
  bucket_90_plus: 'overdue-4',
};

/** Maps installment statuses to visual variants */
const INSTALLMENT_STATUS_MAP: Record<string, StatusVariant> = {
  pending: 'neutral',
  partial: 'warning',
  paid: 'success',
  overdue: 'danger',
  closed: 'neutral',
};

/** Maps collection statuses to visual variants */
const COLLECTION_STATUS_MAP: Record<string, StatusVariant> = {
  posted: 'success',
  active: 'success',
  reversed: 'danger',
  reversal: 'warning',
};

/** Maps customer statuses to visual variants */
const CUSTOMER_STATUS_MAP: Record<string, StatusVariant> = {
  active: 'success',
  blacklisted: 'danger',
  inactive: 'neutral',
};

/** Maps penalty statuses to visual variants */
const PENALTY_STATUS_MAP: Record<string, StatusVariant> = {
  pending: 'warning',
  paid: 'success',
  waived: 'info',
};

/** Maps product statuses to visual variants */
const PRODUCT_STATUS_MAP: Record<string, StatusVariant> = {
  active: 'success',
  inactive: 'neutral',
};

/** Maps group statuses to visual variants */
const GROUP_STATUS_MAP: Record<string, StatusVariant> = {
  active: 'success',
  inactive: 'neutral',
  dissolved: 'danger',
  disbanded: 'danger',
};

/** Maps notification statuses to visual variants */
const NOTIFICATION_STATUS_MAP: Record<string, StatusVariant> = {
  pending: 'info',
  processing: 'warning',
  sent: 'success',
  failed: 'warning',
  dead_letter: 'danger',
};

type StatusType = 'loan' | 'overdue_bucket' | 'installment' | 'collection' | 'customer' | 'penalty' | 'product' | 'group' | 'notification';

const STATUS_MAPS: Record<StatusType, Record<string, StatusVariant>> = {
  loan: LOAN_STATUS_MAP,
  overdue_bucket: OVERDUE_BUCKET_MAP,
  installment: INSTALLMENT_STATUS_MAP,
  collection: COLLECTION_STATUS_MAP,
  customer: CUSTOMER_STATUS_MAP,
  penalty: PENALTY_STATUS_MAP,
  product: PRODUCT_STATUS_MAP,
  group: GROUP_STATUS_MAP,
  notification: NOTIFICATION_STATUS_MAP,
};

interface StatusBadgeProps {
  /** The status value (e.g. 'active', 'overdue', 'bucket_1_30') */
  status: string;
  /** The type of status to determine color mapping */
  type?: StatusType;
  /** Override the display label */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, type = 'loan', label, className }: StatusBadgeProps) {
  const map = STATUS_MAPS[type];
  const variant = map[status] ?? 'neutral';
  const displayLabel = label ?? status.replace(/_/g, ' ');

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {displayLabel}
    </span>
  );
}
