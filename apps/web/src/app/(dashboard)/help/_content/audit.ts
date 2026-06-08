import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const audit: ChapterContent = {
  id: 'audit',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    filter: {
      src: '/help/screenshots/audit/audit-log-filtered.png',
      alt: 'Audit Log page with filter row at the top (actor, entity type, action, date range) and rows below showing recorded actions with timestamps, actor names, action types, target entities, and details',
      caption: 'The Audit Log viewer. Filters at the top narrow to the entry you\'re investigating.',
    },
  },
  langs: {
    en: {
      title: 'Audit Logs',
      intro:
        'Every important action — login, loan approve, disburse, collection, reversal, blacklist — gets a permanent record. This chapter explains how to read those records and how to investigate when something looks off.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.VIEWER_AUDITOR],
      sections: [
        {
          id: 'what-gets-recorded',
          heading: 'What gets recorded',
          body:
            'Logins (success and failure), password changes, role changes, customer create/update/blacklist, loan submit/approve/reject/disburse/close/foreclose, collection post/reverse, expense recorded, cash handover and verification, document upload/delete, unauthorized-access attempts. Reads (just viewing a page) are NOT logged — that would be noise without value.',
        },
        {
          id: 'reading-an-entry',
          heading: 'Reading a log entry',
          body:
            'Each row carries six pieces of information:',
          steps: [
            { text: '**Timestamp** — when the action happened (server clock, IST).' },
            { text: '**Actor** — username + role of the person who did it.' },
            { text: '**Action type** — what they did, e.g. loan_approved.' },
            { text: '**Target entity** — the kind of thing they acted on, e.g. loan, customer.' },
            { text: '**Target ID** — the unique ID of that loan / customer / etc. Click it to jump to the record.' },
            { text: '**Before / After state** — for updates, what the values were and what they became. For create or delete, only one side is present.' },
          ],
        },
        {
          id: 'filter',
          heading: 'Filtering the log',
          body:
            'Sidebar → Audit Logs. The filter row at the top accepts:',
          steps: [
            { text: '**Actor ID** — narrow to one staff member.' },
            { text: '**Target entity** — narrow to one kind of thing (customer, loan, collection, penalty, foreclosure, expense, cash_handover, user, setting).' },
            { text: '**Action type** — create, update, delete, etc.' },
            { text: '**Date range** — start and end date.' },
          ],
          tip:
            'A common investigation: filter by actor = a specific officer + date = today, then scan the actions. You\'ll see their day at a glance — which loans they touched, which customers they updated.',
        },
        {
          id: 'investigation-patterns',
          heading: 'Investigation patterns',
          body:
            'Three real-world investigations you can do here:\n\n**1. "A loan was disbursed but the customer says they did not get cash."**\nFilter target_id = loan ID, action = disburse. Look at actor + timestamp + the after_state — payment mode, reference number. Cross-check with cashbook for the same date.\n\n**2. "A customer was blacklisted and I want to know who and why."**\nFilter target_id = customer ID, action = customer_blacklisted. Read the remarks — the reason was captured at blacklist time.\n\n**3. "Why is this collection reversed?"**\nFilter target_id = collection ID, action = collection_reversed. Actor + remarks tell the story.',
        },
        {
          id: 'privacy-of-reads',
          heading: 'About read-only access',
          body:
            'When an Auditor views customer data, that view is NOT logged. The audit log captures changes, not browsing. This is by design — read logging would balloon to billions of entries and obscure the real signal. If you need read tracking for a sensitive case, talk to the Owner; explicit per-record read logging can be enabled.',
        },
        {
          id: 'retention',
          heading: 'Retention',
          body:
            'Audit entries are kept indefinitely. They are append-only — there is no Edit and no Delete on this table, by design. If a record was wrong, the correction is a NEW entry, not a change to the old one.',
        },
      ],
    },
    hi: {
      title: 'ऑडिट लॉग',
      intro:
        'हर ज़रूरी कार्य — लॉगिन, लोन अप्रूव, वितरण, कलेक्शन, रिवर्सल, ब्लैकलिस्ट — का स्थायी रिकॉर्ड। यह अध्याय बताता है कि उन्हें कैसे पढ़ें और जाँच कैसे करें।',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.VIEWER_AUDITOR],
      sections: [
        {
          id: 'what-gets-recorded',
          heading: 'क्या रिकॉर्ड होता है',
          body:
            'लॉगिन (सफल और विफल), पासवर्ड बदलाव, रोल बदलाव, ग्राहक create/update/blacklist, लोन submit/approve/reject/disburse/close/foreclose, कलेक्शन post/reverse, खर्च दर्ज, कैश हैंडओवर और सत्यापन, दस्तावेज़ upload/delete, अनधिकृत-एक्सेस प्रयास। केवल देखना लॉग नहीं होता — शोर बढ़ता और मूल्य नहीं।',
        },
        {
          id: 'reading-an-entry',
          heading: 'एक एंट्री पढ़ना',
          body: 'हर पंक्ति में छह जानकारियाँ:',
          steps: [
            { text: '**Timestamp** — कार्य कब हुआ (सर्वर समय, IST)।' },
            { text: '**Actor** — करने वाले का यूज़रनेम + रोल।' },
            { text: '**Action type** — क्या किया, जैसे loan_approved।' },
            { text: '**Target entity** — किस तरह की वस्तु पर, जैसे loan, customer।' },
            { text: '**Target ID** — उस वस्तु की अनूठी ID। दबाएँ — रिकॉर्ड खुलेगा।' },
            { text: '**Before / After state** — अपडेट के लिए पहले/बाद के मान। create/delete में एक तरफ़।' },
          ],
        },
        {
          id: 'filter',
          heading: 'लॉग छाँटना',
          body: 'साइडबार → Audit Logs। ऊपर फ़िल्टर:',
          steps: [
            { text: '**Actor ID** — किसी एक स्टाफ़ तक सीमित।' },
            { text: '**Target entity** — एक प्रकार (customer, loan, collection, आदि)।' },
            { text: '**Action type** — create, update, delete, आदि।' },
            { text: '**Date range** — आरंभ और अंत तारीख।' },
          ],
          tip: 'आम जाँच: actor = एक ऑफिसर + date = आज, फिर कार्य देखें। पूरा दिन एक नज़र में।',
        },
        {
          id: 'investigation-patterns',
          heading: 'जाँच के सामान्य तरीक़े',
          body:
            'तीन वास्तविक जाँचें:\n\n**1. "लोन वितरण हुआ पर ग्राहक कहता है नकद नहीं मिला।"**\nFilter: target_id = लोन ID, action = disburse। actor, समय, after_state (मोड, रेफ़रेंस)। Cashbook से उसी तारीख मिलाएँ।\n\n**2. "ग्राहक ब्लैकलिस्ट क्यों हुआ?"**\nFilter: target_id = ग्राहक ID, action = customer_blacklisted। remarks में कारण।\n\n**3. "यह कलेक्शन रिवर्स क्यों है?"**\nFilter: target_id = कलेक्शन ID, action = collection_reversed। actor + remarks।',
        },
        {
          id: 'privacy-of-reads',
          heading: 'पढ़ने पर निजता',
          body:
            'ऑडिटर ग्राहक डेटा देखे — लॉग नहीं होता। ऑडिट लॉग बदलावों को पकड़ता है, ब्राउज़िंग को नहीं। पढ़ना लॉग करना अरबों एंट्री बना देगा। संवेदनशील मामले के लिए मालिक से कहें।',
        },
        {
          id: 'retention',
          heading: 'रिटेंशन',
          body: 'ऑडिट एंट्री हमेशा रखी जाती हैं। केवल जोड़ने योग्य — Edit/Delete नहीं। ग़लत रिकॉर्ड का सुधार नई एंट्री है, पुरानी में बदलाव नहीं।',
        },
      ],
    },
    hinglish: {
      title: 'Audit Logs',
      intro:
        'Har zaroori action — login, loan approve, disburse, collection, reversal, blacklist — ka permanent record. Ye chapter batata hai kaise read karna aur kaise investigate karna.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.VIEWER_AUDITOR],
      sections: [
        {
          id: 'what-gets-recorded',
          heading: 'Kya record hota hai',
          body:
            'Logins (success aur failure), password changes, role changes, customer create/update/blacklist, loan submit/approve/reject/disburse/close/foreclose, collection post/reverse, expense recorded, cash handover aur verification, document upload/delete, unauthorized-access attempts. Reads (sirf dekhna) log NAHI hota — noise badhata, value nahi.',
        },
        {
          id: 'reading-an-entry',
          heading: 'Ek entry padhna',
          body: 'Har row mein 6 informations:',
          steps: [
            { text: '**Timestamp** — action kab hua (server clock, IST).' },
            { text: '**Actor** — username + role karne wale ka.' },
            { text: '**Action type** — kya kiya, jaise loan_approved.' },
            { text: '**Target entity** — kis tarah ki cheez par, jaise loan, customer.' },
            { text: '**Target ID** — us cheez ki unique ID. Click karke record kholo.' },
            { text: '**Before / After state** — updates ke liye purane/naye values. Create/delete mein ek side.' },
          ],
        },
        {
          id: 'filter',
          heading: 'Log filter karna',
          body: 'Sidebar → Audit Logs. Upar filter row:',
          steps: [
            { text: '**Actor ID** — ek staff tak limit.' },
            { text: '**Target entity** — ek type (customer, loan, collection, etc.).' },
            { text: '**Action type** — create, update, delete, etc.' },
            { text: '**Date range** — start aur end date.' },
          ],
          tip: 'Common investigation: actor = ek specific officer + date = today, phir actions scan karo. Unka pura din ek nazar mein.',
        },
        {
          id: 'investigation-patterns',
          heading: 'Investigation patterns',
          body:
            'Teen real-world investigations:\n\n**1. "Loan disbursed but customer kehta hai cash nahi mila."**\nFilter: target_id = loan ID, action = disburse. Actor, timestamp, after_state (mode, reference). Cashbook se same date cross-check.\n\n**2. "Customer blacklist kyun hua?"**\nFilter: target_id = customer ID, action = customer_blacklisted. Remarks mein reason.\n\n**3. "Ye collection reverse kyun hai?"**\nFilter: target_id = collection ID, action = collection_reversed. Actor + remarks story batate hain.',
        },
        {
          id: 'privacy-of-reads',
          heading: 'Reads ke baare mein',
          body:
            'Auditor customer data dekhe — log nahi hota. Audit log changes capture karta hai, browsing nahi. Read logging billions entries banayega aur signal chhupayega. Sensitive case ke liye Owner se kaho.',
        },
        {
          id: 'retention',
          heading: 'Retention',
          body: 'Audit entries hamesha rakhi jaati hain. Append-only — Edit ya Delete nahi. Galat record ka correction nayi entry hai, purani mein badlao nahi.',
        },
      ],
    },
  },
};
