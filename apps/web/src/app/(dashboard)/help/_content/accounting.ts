import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const accounting: ChapterContent = {
  id: 'accounting',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    hub: {
      src: '/help/screenshots/accounting/accounting-hub.png',
      alt: 'The Accounting hub showing the Chart of Accounts tab open, with rows like Cash (1001, Asset), Bank, Loans Receivable, Owner\'s Equity, Interest Income, Processing Fee Income, Salary Expense, Rent Expense. Top-right buttons link to Trial Balance, P&L, and Balance Sheet.',
      caption: 'The Accounting hub. Three tabs (Chart of Accounts, Daybook) plus three statement links top-right.',
    },
    'trial-balance': {
      src: '/help/screenshots/accounting/trial-balance.png',
      alt: 'Trial Balance page showing total debits vs total credits across every account at a selected date.',
      caption: 'Trial Balance — debits and credits must match.',
    },
    'profit-loss': {
      src: '/help/screenshots/accounting/profit-loss.png',
      alt: 'Profit & Loss statement showing income and expense lines summed for a date range.',
    },
    'balance-sheet': {
      src: '/help/screenshots/accounting/balance-sheet.png',
      alt: 'Balance Sheet showing assets on one side, liabilities and equity on the other.',
    },
  },
  langs: {
    en: {
      title: 'Accounting',
      intro:
        'Every collection, disbursement, expense, and handover becomes a journal entry. Accounting pulls those entries into the four reports you need: Chart of Accounts, Daybook, Trial Balance, P&L, and Balance Sheet.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER_AUDITOR],
      sections: [
        {
          id: 'hub',
          heading: 'The Accounting hub',
          body:
            'Sidebar → Accounting opens a three-tab page: Chart of Accounts, Daybook, and links to the three statements (Trial Balance, P&L, Balance Sheet). You don\'t post entries here directly — they flow in from Collections, Disbursements, Expenses, and Handovers.',
        },
        {
          id: 'chart-of-accounts',
          heading: 'Chart of Accounts',
          body:
            'A list of every account the system uses: assets (Cash, Bank, Loans Receivable), liabilities (Customer Deposits, Payables), income (Interest Income, Processing Fee), expenses (Salaries, Rent, Utilities). Each entry shows the account name, code, category, and current balance. Read-only — adding new accounts is reserved for the Owner.',
        },
        {
          id: 'daybook',
          heading: 'Daybook',
          body:
            'A chronological list of every journal entry within a date range. Each row shows: timestamp, account, debit / credit, amount, and the source (a collection, an expense, etc.). Filter by date range; export to Excel for deeper review.',
          tip:
            'When investigating a discrepancy ("my Cashbook says 12,000 but the bank shows 11,500"), Daybook is the first place to look. Filter the date in question and trace each entry.',
        },
        {
          id: 'trial-balance',
          heading: 'Trial Balance',
          body:
            'Total debits versus total credits across every account at a chosen date. If they don\'t match, something\'s wrong — the system normally keeps them equal automatically.',
          warning:
            'If Trial Balance does not balance, do not adjust numbers by hand. Call the Owner. A mismatch is a sign of corrupted data and needs investigating at the source.',
        },
        {
          id: 'profit-loss',
          heading: 'Profit & Loss (Income Statement)',
          body:
            'Income minus expenses for a date range — typically a month or a year-to-date. Income includes interest earned, processing fees, and penalties. Expenses include salaries, rent, utilities, etc.',
          example: {
            title: 'A simple month',
            body:
              'Interest income:        ₹85,000\nProcessing fees:        ₹12,500\nLess: salaries:        −₹40,000\nLess: rent + utilities: −₹15,000\nLess: travel:           −₹4,000\n────────────────────\nNet income:             ₹38,500',
          },
        },
        {
          id: 'balance-sheet',
          heading: 'Balance Sheet',
          body:
            'A snapshot at one moment in time: what you own (assets), what you owe (liabilities), and the difference (equity). Assets always equal Liabilities + Equity. The biggest line for a microfinance branch is usually Loans Receivable on the asset side.',
        },
        {
          id: 'close-period',
          heading: 'Closing a period',
          body:
            'At month-end or year-end, the Accountant locks the period so no further entries can be posted to it. After lock, any attempted transaction dated within that period shows "Account period closed". To reopen, the Owner must explicitly unlock.',
          warning:
            'Closing a period is not a casual act. Before locking, check Trial Balance is in balance and all expected handovers are verified. Mistakes after lock require an Owner-authorised reopen.',
        },
        {
          id: 'common-errors',
          heading: 'Common errors',
          body:
            '• "Account period closed" — see Cashbook chapter; the accountant has locked this date.\n• "Trial balance does not match" — escalate to Owner; do not patch.\n• Export hangs — large date ranges produce big files; try a narrower range.',
        },
      ],
    },
    hi: {
      title: 'अकाउंटिंग',
      intro:
        'हर कलेक्शन, वितरण, खर्च और हैंडओवर एक जर्नल एंट्री बनता है। अकाउंटिंग उन्हें चार रिपोर्टों में दिखाती है: Chart of Accounts, Daybook, Trial Balance, P&L, और Balance Sheet।',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER_AUDITOR],
      sections: [
        {
          id: 'hub',
          heading: 'अकाउंटिंग हब',
          body:
            'साइडबार → Accounting तीन टैब का पेज खोलता है: Chart of Accounts, Daybook, और तीन स्टेटमेंट्स (Trial Balance, P&L, Balance Sheet) के लिंक। यहाँ सीधे एंट्री नहीं डाली जातीं — Collections, Disbursements, Expenses, Handovers से अपने आप आती हैं।',
        },
        {
          id: 'chart-of-accounts',
          heading: 'Chart of Accounts',
          body:
            'सिस्टम के सभी खातों की सूची: संपत्तियाँ (Cash, Bank, Loans Receivable), देयताएँ (Customer Deposits, Payables), आय (Interest Income, Processing Fee), खर्च (Salaries, Rent, Utilities)। हर पंक्ति में नाम, कोड, श्रेणी, और मौजूदा बैलेंस। केवल देखने के लिए — नए खाते मालिक जोड़ते हैं।',
        },
        {
          id: 'daybook',
          heading: 'Daybook',
          body:
            'किसी तारीख रेंज की हर जर्नल एंट्री क्रम से। हर पंक्ति में: समय, खाता, डेबिट/क्रेडिट, रकम, और स्रोत। तारीख से फ़िल्टर; Excel एक्सपोर्ट।',
          tip:
            'विसंगति की जाँच ("Cashbook 12,000, बैंक 11,500") — पहले Daybook देखें। उस तारीख फ़िल्टर करें, हर एंट्री देखें।',
        },
        {
          id: 'trial-balance',
          heading: 'Trial Balance',
          body: 'चुनी तारीख पर कुल डेबिट बनाम कुल क्रेडिट। मेल नहीं — कुछ गड़बड़। सिस्टम सामान्यतः उन्हें बराबर रखता है।',
          warning: 'मेल नहीं हो तो हाथ से न मिलाएँ। मालिक को बुलाएँ। मेल न होना डेटा गड़बड़ी का संकेत है — जड़ से जाँचें।',
        },
        {
          id: 'profit-loss',
          heading: 'Profit & Loss (आय विवरण)',
          body:
            'किसी रेंज की आय घटाकर खर्च। आय: अर्जित ब्याज, प्रोसेसिंग फ़ी, पेनल्टी। खर्च: वेतन, किराया, बिजली, आदि।',
          example: {
            title: 'सरल महीना',
            body:
              'ब्याज आय:               ₹85,000\nप्रोसेसिंग फ़ी:           ₹12,500\nवेतन:                  −₹40,000\nकिराया + बिजली:        −₹15,000\nयात्रा:                  −₹4,000\n────────────────────\nशुद्ध आय:               ₹38,500',
          },
        },
        {
          id: 'balance-sheet',
          heading: 'Balance Sheet',
          body: 'एक पल का स्नैपशॉट: आपके पास क्या है (संपत्ति), क्या देना है (देयता), और अंतर (इक्विटी)। माइक्रोफ़ाइनेंस ब्रांच की सबसे बड़ी लाइन आमतौर पर Loans Receivable होती है।',
        },
        {
          id: 'close-period',
          heading: 'अवधि बंद करना',
          body:
            'महीने/वर्ष के अंत में अकाउंटेंट अवधि लॉक करता है — फिर उस अवधि की एंट्री नहीं हो सकती। लॉक के बाद "Account period closed" दिखेगा। खोलने के लिए मालिक से कहना होगा।',
          warning: 'अवधि बंद करना हल्का काम नहीं। पहले Trial Balance मेल खाए, और सारी हैंडओवर वेरिफ़ाई हों।',
        },
        {
          id: 'common-errors',
          heading: 'आम गलतियाँ',
          body:
            '• "Account period closed" — Cashbook अध्याय देखें।\n• "Trial balance does not match" — मालिक से कहें; ख़ुद न मिलाएँ।\n• एक्सपोर्ट लटका — बड़ी रेंज बड़ी फ़ाइल; छोटी करें।',
        },
      ],
    },
    hinglish: {
      title: 'Accounting',
      intro:
        'Har collection, disbursement, expense, aur handover ek journal entry banta hai. Accounting unhe 4 reports mein dikhata hai: Chart of Accounts, Daybook, Trial Balance, P&L, aur Balance Sheet.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER_AUDITOR],
      sections: [
        {
          id: 'hub',
          heading: 'Accounting hub',
          body:
            'Sidebar → Accounting teen tab ka page kholta hai: Chart of Accounts, Daybook, aur teen statements (Trial Balance, P&L, Balance Sheet) ke links. Yahan seedha entry nahi daalte — Collections, Disbursements, Expenses, Handovers se aati hain.',
        },
        {
          id: 'chart-of-accounts',
          heading: 'Chart of Accounts',
          body:
            'System ke saare accounts ki list: assets (Cash, Bank, Loans Receivable), liabilities (Customer Deposits, Payables), income (Interest Income, Processing Fee), expenses (Salaries, Rent, Utilities). Har row mein name, code, category, current balance. Read-only — naye accounts Owner add karta hai.',
        },
        {
          id: 'daybook',
          heading: 'Daybook',
          body:
            'Kisi date range ki har journal entry chronologically. Har row mein: timestamp, account, debit/credit, amount, source. Date se filter; Excel export.',
          tip: 'Discrepancy investigate karte time ("Cashbook 12,000, bank 11,500") — pehle Daybook dekho. Us date filter karo, har entry trace karo.',
        },
        {
          id: 'trial-balance',
          heading: 'Trial Balance',
          body: 'Chosen date par total debits vs total credits. Match nahi to kuch galat hai. System usually unhe equal rakhta hai.',
          warning: 'Match na ho to haath se mat milao. Owner ko bulao. Mismatch data corruption ka sign hai — source se investigate karo.',
        },
        {
          id: 'profit-loss',
          heading: 'Profit & Loss (Income Statement)',
          body: 'Kisi range ki income minus expenses. Income: earned interest, processing fees, penalties. Expenses: salaries, rent, utilities, etc.',
          example: {
            title: 'Simple month',
            body:
              'Interest income:        ₹85,000\nProcessing fees:        ₹12,500\nLess: salaries:        −₹40,000\nLess: rent + utilities: −₹15,000\nLess: travel:           −₹4,000\n────────────────────\nNet income:             ₹38,500',
          },
        },
        {
          id: 'balance-sheet',
          heading: 'Balance Sheet',
          body: 'Ek pal ka snapshot: kya hai aapke paas (assets), kya dena hai (liabilities), aur antar (equity). Microfinance branch ki sabse badi line usually Loans Receivable hoti hai.',
        },
        {
          id: 'close-period',
          heading: 'Period close karna',
          body:
            'Month-end / year-end par Accountant period lock karta hai — uske baad us period ki entry nahi ho sakti. Lock ke baad "Account period closed" dikhega. Reopen ke liye Owner se kehna padta hai.',
          warning: 'Period close karna casual nahi. Pehle Trial Balance match ho, aur saari handovers verified hon.',
        },
        {
          id: 'common-errors',
          heading: 'Common errors',
          body:
            '• "Account period closed" — Cashbook chapter dekho.\n• "Trial balance does not match" — Owner ko kaho; khud mat patch karo.\n• Export hang — bada range badi file; chhota range try karo.',
        },
      ],
    },
  },
};
