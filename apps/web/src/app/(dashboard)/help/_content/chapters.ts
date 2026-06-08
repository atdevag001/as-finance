import type { HelpLang } from './_types';

/**
 * Registry of every chapter in the user guide. Drives the home-page grid, sidebar TOC,
 * and the build-time HELP_TOPICS coverage check.
 *
 * Order here = display order on the home page.
 */
export type ChapterListItem = {
  id: string;
  label: Record<HelpLang, string>;
  hook: Record<HelpLang, string>;
  iconName?:
    | 'BookOpen'
    | 'UserCircle'
    | 'Users'
    | 'FileText'
    | 'Package'
    | 'Banknote'
    | 'Receipt'
    | 'UsersRound'
    | 'Wallet'
    | 'BookText'
    | 'AlertOctagon'
    | 'BarChart3'
    | 'UserCog'
    | 'Settings'
    | 'Bell'
    | 'Shield'
    | 'LifeBuoy'
    | 'GraduationCap'
    | 'Route';
};

export const CHAPTERS: ChapterListItem[] = [
  {
    id: 'getting-started',
    iconName: 'BookOpen',
    label: { en: 'Getting Started', hi: 'शुरुआत', hinglish: 'Shuruaat' },
    hook: {
      en: 'Login, the dashboard, and your first 5 minutes.',
      hi: 'लॉगिन, डैशबोर्ड और शुरू के 5 मिनट।',
      hinglish: 'Login, dashboard, aur first 5 minutes.',
    },
  },
  {
    id: 'roles',
    iconName: 'UserCircle',
    label: { en: 'Your Role', hi: 'आपकी भूमिका', hinglish: 'Aapka Role' },
    hook: {
      en: 'What you can do, what stays hidden, and why.',
      hi: 'आप क्या कर सकते हैं, क्या नहीं, और क्यों।',
      hinglish: 'Aap kya kar sakte ho, kya nahi, aur kyun.',
    },
  },
  {
    id: 'workflows',
    iconName: 'Route',
    label: { en: 'Common Workflows', hi: 'सामान्य कार्यप्रवाह', hinglish: 'Common Workflows' },
    hook: {
      en: 'Lending cycle, day-end, month-end — step by step.',
      hi: 'लेंडिंग चक्र, दिन-समापन, महीना समापन — चरणवार।',
      hinglish: 'Lending cycle, day-end, month-end — step-by-step.',
    },
  },
  {
    id: 'customers',
    iconName: 'Users',
    label: { en: 'Customers', hi: 'ग्राहक', hinglish: 'Customers' },
    hook: {
      en: 'Add, search, KYC documents, blacklist.',
      hi: 'जोड़ें, खोजें, KYC दस्तावेज़, ब्लैकलिस्ट।',
      hinglish: 'Add karein, search karein, KYC docs, blacklist.',
    },
  },
  {
    id: 'loans',
    iconName: 'FileText',
    label: { en: 'Loans', hi: 'लोन', hinglish: 'Loans' },
    hook: {
      en: 'Application → Approval → Disbursement → Foreclosure.',
      hi: 'आवेदन → अप्रूवल → वितरण → फोरक्लोज़र।',
      hinglish: 'Application → Approval → Disburse → Foreclosure.',
    },
  },
  {
    id: 'loan-products',
    iconName: 'Package',
    label: { en: 'Loan Products', hi: 'लोन प्रोडक्ट्स', hinglish: 'Loan Products' },
    hook: {
      en: 'Define the templates that loans are built from.',
      hi: 'जिनसे लोन बनते हैं — टेम्पलेट परिभाषा।',
      hinglish: 'Templates jinse loans bante hain — define karna.',
    },
  },
  {
    id: 'collections',
    iconName: 'Banknote',
    label: { en: 'Collections', hi: 'कलेक्शन', hinglish: 'Collections' },
    hook: {
      en: 'Post a payment, print a receipt, fix mistakes.',
      hi: 'भुगतान दर्ज करें, रसीद प्रिंट करें, गलती सुधारें।',
      hinglish: 'Payment post karein, receipt print karein, galti theek karein.',
    },
  },
  {
    id: 'receipts',
    iconName: 'Receipt',
    label: { en: 'Receipts', hi: 'रसीदें', hinglish: 'Receipts' },
    hook: {
      en: 'Find, view, print, share — and what reversals do.',
      hi: 'ढूँढें, देखें, प्रिंट, साझा — और रिवर्सल का असर।',
      hinglish: 'Dhundo, dekho, print, share — aur reversal ka asar.',
    },
  },
  {
    id: 'groups',
    iconName: 'UsersRound',
    label: { en: 'Groups', hi: 'समूह', hinglish: 'Groups' },
    hook: {
      en: 'Group lending and bulk collection.',
      hi: 'समूह लोन और बल्क कलेक्शन।',
      hinglish: 'Group lending aur bulk collection.',
    },
  },
  {
    id: 'cashbook',
    iconName: 'Wallet',
    label: { en: 'Cashbook & Day-End', hi: 'कैशबुक और दिन-समापन', hinglish: 'Cashbook + Day-End' },
    hook: {
      en: 'Daily cash, expenses, handovers, shortage SOP.',
      hi: 'दैनिक नकदी, खर्च, हैंडओवर, शॉर्टेज SOP।',
      hinglish: 'Daily cash, expenses, handovers, shortage SOP.',
    },
  },
  {
    id: 'accounting',
    iconName: 'BookText',
    label: { en: 'Accounting', hi: 'अकाउंटिंग', hinglish: 'Accounting' },
    hook: {
      en: 'Chart of Accounts, Daybook, Trial Balance, P&L, Balance Sheet.',
      hi: 'खातों की सूची, Daybook, Trial Balance, P&L, Balance Sheet।',
      hinglish: 'Chart of Accounts, Daybook, Trial Balance, P&L, Balance Sheet.',
    },
  },
  {
    id: 'penalties',
    iconName: 'AlertOctagon',
    label: { en: 'Penalties', hi: 'पेनल्टी', hinglish: 'Penalties' },
    hook: {
      en: 'How they accrue, when to waive, who approves.',
      hi: 'कब लगती है, कब माफ़, कौन अप्रूव करता है।',
      hinglish: 'Kab lagti hai, kab waive, kaun approve.',
    },
  },
  {
    id: 'reports',
    iconName: 'BarChart3',
    label: { en: 'Reports', hi: 'रिपोर्ट्स', hinglish: 'Reports' },
    hook: {
      en: 'Find, filter, export the report you need.',
      hi: 'जो रिपोर्ट चाहिए वो खोजें, फ़िल्टर करें, एक्सपोर्ट करें।',
      hinglish: 'Jo report chahiye dhundhein, filter karein, export karein.',
    },
  },
  {
    id: 'admin',
    iconName: 'UserCog',
    label: { en: 'Administration', hi: 'प्रशासन', hinglish: 'Administration' },
    hook: {
      en: 'Users — create, edit, reset password, deactivate.',
      hi: 'उपयोगकर्ता — बनाना, संपादन, पासवर्ड रीसेट, निष्क्रिय।',
      hinglish: 'Users — create, edit, reset password, deactivate.',
    },
  },
  {
    id: 'settings',
    iconName: 'Settings',
    label: { en: 'Settings', hi: 'सेटिंग्स', hinglish: 'Settings' },
    hook: {
      en: 'Interest bounds, group sizes, holidays — the rules.',
      hi: 'ब्याज सीमाएँ, समूह आकार, छुट्टियाँ — नियम।',
      hinglish: 'Interest bounds, group sizes, holidays — rules.',
    },
  },
  {
    id: 'notifications',
    iconName: 'Bell',
    label: { en: 'Notifications', hi: 'नोटिफिकेशन', hinglish: 'Notifications' },
    hook: {
      en: 'SMS outbox, retries, what to escalate.',
      hi: 'SMS आउटबॉक्स, रिट्राय, कब बढ़ाना।',
      hinglish: 'SMS outbox, retries, kab escalate.',
    },
  },
  {
    id: 'audit',
    iconName: 'Shield',
    label: { en: 'Audit Logs', hi: 'ऑडिट लॉग', hinglish: 'Audit Logs' },
    hook: {
      en: 'Investigate who did what, and when.',
      hi: 'जाँचें — किसने क्या किया, कब।',
      hinglish: 'Investigate karo — kisne kya kiya, kab.',
    },
  },
  {
    id: 'troubleshooting',
    iconName: 'LifeBuoy',
    label: { en: 'Help & Troubleshooting', hi: 'मदद और समस्याएँ', hinglish: 'Help + Problems' },
    hook: {
      en: 'Common errors, what to do, who to call.',
      hi: 'आम गलतियाँ, क्या करें, किसे कॉल करें।',
      hinglish: 'Common errors, kya karein, kise call karein.',
    },
  },
  {
    id: 'glossary',
    iconName: 'GraduationCap',
    label: { en: 'Glossary', hi: 'शब्दावली', hinglish: 'Glossary' },
    hook: {
      en: 'EMI, DPD, PAR, foreclosure — in plain language.',
      hi: 'EMI, DPD, PAR, फोरक्लोज़र — आसान भाषा में।',
      hinglish: 'EMI, DPD, PAR, foreclosure — aasaan bhasha mein.',
    },
  },
];
