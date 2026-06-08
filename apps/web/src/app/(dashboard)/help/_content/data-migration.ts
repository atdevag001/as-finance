import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const dataMigration: ChapterContent = {
  id: 'data-migration',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  langs: {
    en: {
      title: 'Data Migration (one-shot legacy import)',
      intro:
        'A separate module from "Data Import / Export". Designed for a single event: bringing existing customers, groups, loans, and historical collections from your OLD software into AS-Finance — once, when you go live. After it succeeds, the module locks itself permanently.',
      whoCanDoThis: [UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'when-to-use',
          heading: 'When to use it (vs Data Import / Export)',
          body:
            'Use Data Migration only on go-live day, for the one-time backfill of legacy customer + loan data. For everything afterwards (monthly holiday sync, regulator exports, new branch loan-product config), use the regular Data Import / Export feature instead. Once Data Migration commits, it cannot be re-run without ops intervention.',
          warning:
            'This is a ONE-SHOT operation. After a successful commit, the module is permanently locked. To run again, ops must manually reset settings.migration_state in the database.',
        },
        {
          id: 'the-five-files',
          heading: 'The five files',
          body:
            'You upload up to 5 .xlsx files in one go: customers.xlsx (required), groups.xlsx, group_members.xlsx, loans.xlsx, collections.xlsx. Cross-references are by your old system\'s ids (legacy_customer_id, legacy_loan_id, legacy_group_id, etc.) — the system assigns its own UUIDs and keeps your ids in a searchable column.',
          steps: [
            { text: 'Sidebar → Data Migration.' },
            { text: 'Click "Template" next to each file row — downloads a blank .xlsx with the right columns and one example row showing valid values.' },
            { text: 'Fill the templates with your legacy data. Delete the example row.' },
            { text: 'Upload all 5 files (or just customers.xlsx if that\'s all you have).' },
            { text: 'Click "Dry-run (validate)". You see per-file row counts + a list of any errors with the row number + column.' },
            { text: 'Fix the source spreadsheets based on the error list. Re-upload. Re-validate. Repeat until "✅ 0 errors".' },
            { text: 'Click "Commit migration (one-shot)" → type MIGRATE → confirm.' },
            { text: 'Success card shows the commit duration, audit log id (copyable), and SHA-256 of each uploaded file.' },
          ],
        },
        {
          id: 'validations',
          heading: 'What the dry-run checks',
          body:
            'Every error you see in the dry-run is one your operators would have hit anyway, but at the dry-run stage no DB writes have happened. Top validations:',
          steps: [
            { text: 'Cross-references resolve: every legacy_loan_id\'s customer is in customers.xlsx; every group member\'s group is in groups.xlsx.' },
            { text: 'Duplicate ids inside a file (legacy_customer_id, legacy_collection_id) are caught.' },
            { text: 'Pincode must be exactly 6 digits — no padding.' },
            { text: 'Every *_paise column must be a non-negative whole number (no decimals).' },
            { text: 'tenure_months ≥ 1, installments_paid_count ≤ tenure_months.' },
            { text: 'Enum values (gender, status, payment_mode, meeting_day) accept any case — "Active", "ACTIVE", "active" all match — but the value itself must be in the allowed list.' },
          ],
        },
        {
          id: 'what-gets-created',
          heading: 'What the commit creates',
          body:
            'Commit runs inside a single Serializable transaction with a 10-minute timeout. It bootstraps a synthetic "migration-bot" user (super_admin, login disabled — auditors filter on this user to see what was migrated), a "LEGACY_MIGRATION" loan product with zero penalty/interest rules (so the system never accrues new penalties on legacy balances), and a single shared zero-totals journal entry that every migrated collection/disbursement points at (so historical payments don\'t double-count in P&L going forward).',
          tip:
            'For every migrated loan, the EMI schedule is materialised (one row per month, first_due_date + i months, month-end clamped — Jan 31 + 1 = Feb 28/29, not March 3). DPD continues to compute normally from the next nightly cron run.',
        },
        {
          id: 'audit-logs',
          heading: 'Audit logs',
          body:
            'Three possible audit entries per attempt: migration_started (written BEFORE the transaction so a rollback leaves a trace), migration_completed (single batch entry — its id is what the success card shows), and migration_failed (written outside the rolled-back transaction with the error message). The dashboard lock card surfaces the completed audit id and the timestamp.',
        },
        {
          id: 'when-it-goes-wrong',
          heading: 'When something goes wrong',
          body:
            'Most failures happen at dry-run, before any DB writes. If a commit DOES fail (network, timeout, schema drift), the entire transaction rolls back — no partial state — the draft is dropped, and a migration_failed audit entry is written. You must re-upload all files and re-validate. The lock is NOT engaged until commit succeeds.',
          reassure:
            'There is no "half-migrated" state. Either every row in your files landed in the DB, or none did. If you\'re worried about a stuck state, check Audit Log → filter by migration_* to see what happened.',
        },
      ],
    },
    hi: {
      title: 'Data Migration (पुराने सिस्टम से एक बार का import)',
      intro:
        'यह "Data Import / Export" से अलग module है। केवल go-live के दिन एक बार: पुराने software से सभी customers, groups, loans, और पुरानी collections को AS-Finance में लाने के लिए। एक बार successful होने पर module हमेशा के लिए lock हो जाता है।',
      whoCanDoThis: [UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'when-to-use',
          heading: 'कब use करें (Data Import/Export से अलग)',
          body:
            'Data Migration केवल go-live दिन पर पुराने data को एक बार लाने के लिए है। उसके बाद holidays, exports, नए loan products के लिए — regular Data Import / Export use करें।',
          warning: 'ये ONE-SHOT operation है — एक बार commit के बाद module permanently lock हो जाता है।',
        },
        {
          id: 'the-five-files',
          heading: 'पाँच files',
          body:
            'एक साथ 5 .xlsx files upload करें: customers.xlsx (ज़रूरी), groups.xlsx, group_members.xlsx, loans.xlsx, collections.xlsx। पुराने system के legacy ids से cross-reference होती हैं।',
          steps: [
            { text: 'Sidebar → Data Migration खोलें।' },
            { text: 'हर file के साथ "Template" button से खाली template download करें — सही columns और example row मिलेगी।' },
            { text: 'Templates में अपना legacy data भरें, example row delete करें।' },
            { text: 'सारी files upload करें (या केवल customers.xlsx)।' },
            { text: '"Dry-run (validate)" पर click करें — हर file की row count + errors दिखेंगी।' },
            { text: 'Source spreadsheet ठीक करें, फिर से upload करें, फिर से validate करें। 0 errors तक repeat करें।' },
            { text: '"Commit migration" → "MIGRATE" type करें → confirm।' },
            { text: 'Success card में duration, audit id, file SHA-256 दिखेगा।' },
          ],
        },
        {
          id: 'validations',
          heading: 'Dry-run क्या check करता है',
          body:
            'सारी जाँचें commit से पहले होती हैं — कोई भी DB write नहीं होती। ज़रूरी checks:',
          steps: [
            { text: 'हर loan का customer customers.xlsx में होना चाहिए।' },
            { text: 'File के अंदर duplicate legacy_customer_id / legacy_collection_id पकड़ी जाती हैं।' },
            { text: 'Pincode बिल्कुल 6 digits का होना चाहिए।' },
            { text: 'सारे *_paise columns सिर्फ integer होने चाहिए (decimal नहीं)।' },
            { text: 'tenure_months ≥ 1, और installments_paid_count ≤ tenure_months।' },
            { text: 'Enum values (gender, status, payment_mode) कोई भी case में चलेंगे लेकिन allowed list में होने चाहिए।' },
          ],
        },
        {
          id: 'what-gets-created',
          heading: 'Commit क्या create करता है',
          body:
            '10-minute timeout के साथ एक Serializable transaction चलता है। "migration-bot" synthetic user (login disabled) बनता है, "LEGACY_MIGRATION" loan product zero rules के साथ बनता है, और एक shared zero-totals journal entry बनती है — ताकि पुरानी payments P&L में double-count न हों।',
          tip:
            'हर migrated loan की EMI schedule generate होती है — month-end clamped (Jan 31 + 1 = Feb 28, March 3 नहीं)। DPD अगली nightly cron से normal compute होता है।',
        },
        {
          id: 'audit-logs',
          heading: 'Audit logs',
          body:
            'हर attempt पर तीन audit entries possible हैं: migration_started (transaction से पहले), migration_completed (success के बाद), migration_failed (failure पर error message के साथ)। Dashboard के lock card में audit id और timestamp दिखते हैं।',
        },
        {
          id: 'when-it-goes-wrong',
          heading: 'अगर कुछ गड़बड़ हो',
          body:
            'अधिकांश errors dry-run पर पकड़े जाते हैं। अगर commit fail हो — पूरा transaction roll back हो जाता है (कोई आधी-अधूरी state नहीं), draft drop हो जाता है, और migration_failed audit entry लिखी जाती है। फिर से सारी files upload करनी होंगी।',
          reassure: 'या तो सारी rows DB में आ गईं, या कोई नहीं आई — कोई "half-migrated" state नहीं हो सकती।',
        },
      ],
    },
    hinglish: {
      title: 'Data Migration (purane system se one-shot import)',
      intro:
        '"Data Import / Export" se alag ek dedicated module hai. Sirf ek baar — go-live day par — purane software ke customers, groups, loans, aur historical collections AS-Finance me laane ke liye. Successful commit ke baad module hamesha ke liye lock ho jaata hai.',
      whoCanDoThis: [UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'when-to-use',
          heading: 'Kab use kare (Data Import/Export se alag)',
          body:
            'Data Migration sirf go-live ke ek baar wale backfill ke liye hai. Holidays sync, monthly exports, naye loan product config — yeh sab Data Import / Export module se hote hain.',
          warning: 'Yeh ONE-SHOT hai. Ek successful commit ke baad module permanently lock ho jaata hai.',
        },
        {
          id: 'the-five-files',
          heading: 'Paanch files',
          body:
            '5 .xlsx files ek saath upload karte hain: customers.xlsx (mandatory), groups.xlsx, group_members.xlsx, loans.xlsx, collections.xlsx. Apne purane system ke legacy ids se cross-reference hoti hain.',
          steps: [
            { text: 'Sidebar → Data Migration kholo.' },
            { text: 'Har file row ke saath "Template" button par click karke blank .xlsx template download karo — sahi columns aur ek example row milegi.' },
            { text: 'Templates me apna legacy data bharo. Example row delete kar do.' },
            { text: '5 files (ya sirf customers.xlsx) upload karo.' },
            { text: '"Dry-run (validate)" click karo. Row counts + errors dikhenge — kis row me kya galat hai.' },
            { text: 'Source spreadsheets thik karo. Phir upload karo. Phir validate. 0 errors tak repeat.' },
            { text: '"Commit migration (one-shot)" → "MIGRATE" type karo → confirm.' },
            { text: 'Success card me duration, audit log id (copyable), aur file SHA-256 dikhega.' },
          ],
        },
        {
          id: 'validations',
          heading: 'Dry-run me kya check hota hai',
          body:
            'Sab kuch commit se PEHLE check hota hai — koi DB write nahi. Main checks:',
          steps: [
            { text: 'Cross-references: har loan ka customer customers.xlsx me hona chahiye.' },
            { text: 'File ke andar duplicate legacy_customer_id / legacy_collection_id pakdte hain.' },
            { text: 'Pincode bilkul 6 digits ka — padding nahi karega.' },
            { text: 'Sab *_paise columns whole number hone chahiye (decimal nahi).' },
            { text: 'tenure_months ≥ 1, installments_paid_count ≤ tenure_months.' },
            { text: 'Enum values (gender, status, payment_mode) ka case kuch bhi chalega lekin allowed list me hona chahiye.' },
          ],
        },
        {
          id: 'what-gets-created',
          heading: 'Commit kya banata hai',
          body:
            '10-minute timeout wala Serializable transaction chalta hai. "migration-bot" synthetic user (login disabled) banta hai — auditors isi se filter karke dekh sakte hain kya migrate hua. "LEGACY_MIGRATION" loan product zero penalty/interest rules ke saath banta hai. Ek shared zero-totals journal entry bhi ban ti hai jisme historical collections point karti hain — P&L me double count nahi hoga.',
          tip:
            'Har migrated loan ki EMI schedule materialise hoti hai (one row per month, first_due_date + i months, month-end clamped — Jan 31 + 1 = Feb 28/29, March 3 nahi). DPD agle nightly cron se normally compute hota hai.',
        },
        {
          id: 'audit-logs',
          heading: 'Audit logs',
          body:
            'Per attempt 3 audit entries possible hain: migration_started (transaction shuru hone se PEHLE — rollback ho bhi gaya to trace rehta hai), migration_completed (success ka single batch entry — success card me iska id dikhata hai), migration_failed (transaction rollback ke baad error message ke saath). Lock card me audit id aur timestamp dono dikhte hain.',
        },
        {
          id: 'when-it-goes-wrong',
          heading: 'Agar kuch galat ho',
          body:
            'Zyada errors dry-run par hi pakdte hain. Agar commit fail ho — pura transaction rollback ho jaata hai (koi half-migrated state nahi), draft drop ho jaata hai, migration_failed audit likhi jaati hai. Aapko phir se sari files upload karke validate karna padega. Jab tak commit successful nahi hota, lock engage nahi hota.',
          reassure: 'Ya to sari rows DB me chali gayi, ya koi bhi nahi gayi. "Half-migrated" state mathematically possible hi nahi hai.',
        },
      ],
    },
  },
};
