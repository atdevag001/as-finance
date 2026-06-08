import type { ChapterContent } from './_types';
import { gettingStarted } from './getting-started';
import { roles } from './roles';
import { workflows } from './workflows';
import { customers } from './customers';
import { loans } from './loans';
import { loanProducts } from './loan-products';
import { collections } from './collections';
import { receipts } from './receipts';
import { groups } from './groups';
import { cashbook } from './cashbook';
import { accounting } from './accounting';
import { penalties } from './penalties';
import { reports } from './reports';
import { admin } from './admin';
import { settings } from './settings';
import { notifications } from './notifications';
import { audit } from './audit';
import { troubleshooting } from './troubleshooting';
import { glossary } from './glossary';
import { dataImportExport } from './data-import-export';
import { dataMigration } from './data-migration';

export const ALL_CHAPTERS: Record<string, ChapterContent> = {
  'getting-started': gettingStarted,
  roles,
  workflows,
  customers,
  loans,
  'loan-products': loanProducts,
  collections,
  receipts,
  groups,
  cashbook,
  accounting,
  penalties,
  reports,
  admin,
  settings,
  notifications,
  audit,
  troubleshooting,
  glossary,
  'data-import-export': dataImportExport,
  'data-migration': dataMigration,
};

export {
  gettingStarted,
  roles,
  workflows,
  customers,
  loans,
  loanProducts,
  collections,
  receipts,
  groups,
  cashbook,
  accounting,
  penalties,
  reports,
  admin,
  settings,
  notifications,
  audit,
  troubleshooting,
  glossary,
  dataImportExport,
  dataMigration,
};
