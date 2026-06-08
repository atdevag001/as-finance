import type { ChapterContent } from './_types';
import { gettingStarted } from './getting-started';
import { roles } from './roles';
import { customers } from './customers';
import { loans } from './loans';
import { collections } from './collections';
import { groups } from './groups';
import { cashbook } from './cashbook';
import { reports } from './reports';
import { admin } from './admin';
import { troubleshooting } from './troubleshooting';
import { glossary } from './glossary';

export const ALL_CHAPTERS: Record<string, ChapterContent> = {
  'getting-started': gettingStarted,
  roles,
  customers,
  loans,
  collections,
  groups,
  cashbook,
  reports,
  admin,
  troubleshooting,
  glossary,
};

export {
  gettingStarted,
  roles,
  customers,
  loans,
  collections,
  groups,
  cashbook,
  reports,
  admin,
  troubleshooting,
  glossary,
};
