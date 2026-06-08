import type { HelpLang } from './_types';

/**
 * Registry of every chapter in the user guide. Drives the home-page grid, sidebar TOC,
 * and the build-time HELP_TOPICS coverage check.
 *
 * Order here = display order on the home page.
 */
export type ChapterListItem = {
  id: string;
  /** Sidebar / grid label, per language. */
  label: Record<HelpLang, string>;
  /** One-line hook shown on the chapter card. */
  hook: Record<HelpLang, string>;
  /** Optional icon name from lucide-react — wired in the home page. */
  iconName?:
    | 'BookOpen'
    | 'UserCircle'
    | 'Users'
    | 'FileText'
    | 'Banknote'
    | 'UsersRound'
    | 'Wallet'
    | 'BarChart3'
    | 'UserCog'
    | 'LifeBuoy'
    | 'GraduationCap';
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
      en: 'Users, settings, holidays, audit log.',
      hi: 'उपयोगकर्ता, सेटिंग्स, छुट्टियाँ, ऑडिट लॉग।',
      hinglish: 'Users, settings, holidays, audit log.',
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
