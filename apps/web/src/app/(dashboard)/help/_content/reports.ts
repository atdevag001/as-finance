import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const reports: ChapterContent = {
  id: 'reports',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    where: {
      src: '/help/screenshots/reports/reports-hub.png',
      alt: 'The Reports hub showing categories: Collections, Loans, Customers, Groups, Income, Accounting, Audit — each as a card you can click into',
      caption: 'Pick a category card to open the reports under it.',
    },
  },
  langs: {
    en: {
      title: 'Reports',
      intro:
        'Reports are how the branch tells itself the truth — who paid, who owes, where the money went. This chapter shows where reports live, how to filter them, and how to export.',
      whoCanDoThis: [
        UserRole.MANAGER,
        UserRole.ACCOUNTANT,
        UserRole.FIELD_OFFICER,
        UserRole.COLLECTION_OFFICER,
        UserRole.VIEWER_AUDITOR,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'where',
          heading: 'Where to find them',
          body:
            'Sidebar → Reports. The page is a grid grouped by category: Collections, Loans, Customers, Groups, Income, Accounting, Audit. Click a card to open that report.',
        },
        {
          id: 'common',
          heading: 'The seven most-used reports',
          body:
            '• Daily Collection — what came in today, officer by officer\n• Overdue Report — loans where EMI is late, grouped by days past due\n• Disbursement Report — what we paid out this week or month\n• Receipt Register — every receipt in a date range\n• Trial Balance / P&L / Balance Sheet — the accounting set\n• Audit Trail — who did what in the system\n• Officer Performance — collections per officer',
        },
        {
          id: 'filter-and-export',
          heading: 'Filtering and exporting',
          body:
            'Most reports take a date range plus optional filters (officer, status, product). Run the report on-screen, then click Export to download as PDF or Excel.',
          tip:
            'You can export at most 5 reports per minute. If you see "rate limited", wait a minute and try again — it’s not a bug, it’s the server protecting itself.',
        },
        {
          id: 'regulatory',
          heading: 'Regulatory / compliance reports',
          body:
            'If your branch is required to file reports to RBI, MFIN, or a credit bureau, your manager will tell you which AS-Finance reports correspond and the filing schedule. Until that is set up explicitly, no report here is automatically submitted to a regulator.',
        },
      ],
    },
    hi: {
      title: 'रिपोर्ट्स',
      intro:
        'रिपोर्ट्स से ब्रांच अपने आप से सच बोलती है — किसने भरा, किस पर बाक़ी है, पैसा कहाँ गया। यह अध्याय बताता है रिपोर्ट कहाँ हैं, फ़िल्टर कैसे करें, और एक्सपोर्ट कैसे।',
      whoCanDoThis: [
        UserRole.MANAGER,
        UserRole.ACCOUNTANT,
        UserRole.FIELD_OFFICER,
        UserRole.COLLECTION_OFFICER,
        UserRole.VIEWER_AUDITOR,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'where',
          heading: 'कहाँ मिलेंगी',
          body:
            'साइडबार → Reports. पेज पर श्रेणीवार ग्रिड: Collections, Loans, Customers, Groups, Income, Accounting, Audit. कार्ड पर क्लिक करें — वह रिपोर्ट खुल जाएगी।',
        },
        {
          id: 'common',
          heading: 'सबसे ज़्यादा इस्तेमाल होने वाली 7 रिपोर्ट्स',
          body:
            '• Daily Collection — आज क्या आया, ऑफिसर वार\n• Overdue Report — देरी से चल रही EMI, DPD बकेट के साथ\n• Disbursement Report — इस हफ्ते/महीने हमने क्या वितरण किया\n• Receipt Register — दी गई तारीख रेंज की हर रसीद\n• Trial Balance / P&L / Balance Sheet — अकाउंटिंग सेट\n• Audit Trail — सिस्टम में किसने क्या किया\n• Officer Performance — हर ऑफिसर की कलेक्शन',
        },
        {
          id: 'filter-and-export',
          heading: 'फ़िल्टर और एक्सपोर्ट',
          body:
            'ज़्यादातर रिपोर्ट तारीख रेंज और वैकल्पिक फ़िल्टर लेती हैं (ऑफिसर, स्थिति, प्रोडक्ट)। स्क्रीन पर चलाकर, फिर Export से PDF/Excel डाउनलोड।',
          tip: 'एक मिनट में अधिकतम 5 रिपोर्ट एक्सपोर्ट कर सकते हैं। "rate limited" दिखे — एक मिनट रुक कर फिर करें।',
        },
        {
          id: 'regulatory',
          heading: 'विनियामक / अनुपालन रिपोर्ट',
          body:
            'अगर ब्रांच को RBI, MFIN, या क्रेडिट ब्यूरो को रिपोर्ट जमा करनी हो, मैनेजर बताएगा कौन सी AS-Finance रिपोर्ट किसके लिए है और कब। जब तक स्पष्ट सेट नहीं हो, यहाँ की कोई रिपोर्ट अपने आप किसी रेगुलेटर को नहीं जाती।',
        },
      ],
    },
    hinglish: {
      title: 'Reports',
      intro:
        'Reports se branch apne aap se sach bolti hai — kisne bhara, kispar bakaya hai, paisa kahan gaya. Ye chapter batata hai reports kahan hain, filter kaise karein, aur export kaise.',
      whoCanDoThis: [
        UserRole.MANAGER,
        UserRole.ACCOUNTANT,
        UserRole.FIELD_OFFICER,
        UserRole.COLLECTION_OFFICER,
        UserRole.VIEWER_AUDITOR,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'where',
          heading: 'Kahan milengi',
          body:
            'Sidebar → Reports. Page par category-wise grid: Collections, Loans, Customers, Groups, Income, Accounting, Audit. Card par click karo — wo report khul jaayegi.',
        },
        {
          id: 'common',
          heading: 'Sabse zyada use hone wali 7 reports',
          body:
            '• Daily Collection — aaj kya aaya, officer-wise\n• Overdue Report — late EMIs, DPD buckets ke saath\n• Disbursement Report — is hafte/mahine humne kya disburse kiya\n• Receipt Register — di gayi date range ki har receipt\n• Trial Balance / P&L / Balance Sheet — accounting set\n• Audit Trail — system mein kisne kya kiya\n• Officer Performance — har officer ki collections',
        },
        {
          id: 'filter-and-export',
          heading: 'Filter aur export',
          body:
            'Zyadatar reports date range aur optional filters leti hain (officer, status, product). Screen par chala lo, phir Export se PDF/Excel download.',
          tip: 'Ek minute mein max 5 reports export kar sakte ho. "rate limited" dikhe — ek minute ruk ke phir karo. Bug nahi hai, server apni raksha karta hai.',
        },
        {
          id: 'regulatory',
          heading: 'Regulatory / compliance reports',
          body:
            'Agar branch ko RBI, MFIN, ya credit bureau ko reports file karni hain, manager batayega kaun-si AS-Finance report kis ke liye hai aur kab file karni hai. Jab tak explicit setup nahi ho, yahan ki koi report apne aap kisi regulator ko nahi jaati.',
        },
      ],
    },
  },
};
