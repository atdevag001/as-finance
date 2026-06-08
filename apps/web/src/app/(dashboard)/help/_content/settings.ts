import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const settings: ChapterContent = {
  id: 'settings',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    overview: {
      src: '/help/screenshots/settings/settings-page.png',
      alt: 'Settings page with System Settings (default_penalty_grace_days=7, max_annual_rate_bps=36000, max_group_size=15, min_annual_rate_bps=100, min_group_size=5) at the top and Holiday Calendar (with 25-Dec-2026 entry) at the bottom',
      caption: 'The Settings page. The values you change here apply to all future operations.',
    },
  },
  langs: {
    en: {
      title: 'Settings',
      intro:
        'Settings is where the Owner / Super Admin configures the rules every other page enforces — interest rate limits, group sizes, penalty grace period, holidays. A small change here can affect hundreds of loans.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER],
      sections: [
        {
          id: 'overview',
          heading: 'The Settings page',
          body:
            'Sidebar → Settings. The page has two main sections: System Settings (key-value bounds and defaults) and the Holiday Calendar. Managers can read everything; only Super Admin can save changes (Manager has read-only access by default).',
        },
        {
          id: 'system-settings',
          heading: 'System Settings — the bounds',
          body:
            'Each row is a single named setting. The most important ones are listed below. Edit a value, then click Save. The new value applies to all future operations; in-flight loans keep their original terms.',
          steps: [
            { text: '**max_annual_rate_bps** — maximum interest rate allowed on any loan product. 36000 = 360%. Cap this in line with regulations.' },
            { text: '**min_annual_rate_bps** — minimum interest rate. 100 = 1%. Below this is treated as a typo.' },
            { text: '**max_group_size** — most members a lending group can have. 15 is typical for self-help groups.' },
            { text: '**min_group_size** — least members. Below this and the group has too little joint-liability cushion. 5 is typical.' },
            { text: '**default_penalty_grace_days** — how many days after the EMI due date before penalty starts accruing. 7 is a common compromise.' },
          ],
        },
        {
          id: 'holidays',
          heading: 'Holiday Calendar',
          body:
            'Below System Settings, the Holiday Calendar lists every date the branch is closed. Add a date; future EMIs landing on that date shift to the next working day automatically.',
          warning:
            'Removing a holiday does NOT shift past EMI dates back. EMI schedules are calculated at disbursement time and saved — they do not re-evaluate when settings change. If you genuinely need to reschedule a specific loan, do it loan by loan.',
          example: {
            title: 'A holiday in action',
            body:
              'Customer disbursed: Fri 7 Jun 2026\nProduct default first EMI: Sun 7 Jul (a Sunday)\nSettings holiday: 8 Jul (Bank Holiday)\nFirst EMI ends up: Wed 9 Jul (next working day after both)\nAll later EMIs follow from 9 Jul.',
          },
        },
        {
          id: 'who-can-edit',
          heading: 'Who can change what',
          body:
            '• Reading Settings — Super Admin and Manager.\n• Saving / editing values — Super Admin only.\n• Adding / removing holidays — Super Admin only.\n• Changing a key\'s name or adding a new key — requires a code change, not settable from UI.',
        },
        {
          id: 'common-changes',
          heading: 'Common changes and when to make them',
          body:
            '• **New product line with a higher rate** — bump max_annual_rate_bps first, then create the product.\n• **Festival closure** — add the dates ahead of time (ideally early in the month) so the rest of the branch sees correct EMI schedules from day one.\n• **Stricter overdue policy** — drop default_penalty_grace_days from 7 → 3.',
        },
      ],
    },
    hi: {
      title: 'सेटिंग्स',
      intro:
        'सेटिंग्स में मालिक / सुपर एडमिन वो नियम तय करते हैं जो बाक़ी हर पेज पर लागू होते हैं — ब्याज सीमाएँ, समूह आकार, पेनल्टी ग्रेस, छुट्टियाँ। यहाँ छोटी सी बदली सैकड़ों लोनों को असर कर सकती है।',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER],
      sections: [
        {
          id: 'overview',
          heading: 'सेटिंग्स पेज',
          body:
            'साइडबार → Settings। दो भाग: System Settings (key-value बाउंड्स) और Holiday Calendar। मैनेजर पढ़ सकता है; सिर्फ़ सुपर एडमिन सहेज सकता है।',
        },
        {
          id: 'system-settings',
          heading: 'System Settings — सीमाएँ',
          body: 'हर पंक्ति एक नाम वाली सेटिंग। ज़रूरी:',
          steps: [
            { text: '**max_annual_rate_bps** — किसी प्रोडक्ट पर अधिकतम दर। 36000 = 360%। नियमों के अनुसार रखें।' },
            { text: '**min_annual_rate_bps** — न्यूनतम। 100 = 1%। नीचे टाइपो माना जाएगा।' },
            { text: '**max_group_size** — समूह में अधिकतम सदस्य। SHG के लिए 15।' },
            { text: '**min_group_size** — न्यूनतम; नीचे joint-liability कम। आमतौर पर 5।' },
            { text: '**default_penalty_grace_days** — EMI तारीख के बाद कितने दिन तक पेनल्टी नहीं। 7 आम है।' },
          ],
        },
        {
          id: 'holidays',
          heading: 'Holiday Calendar',
          body:
            'System Settings के नीचे, ब्रांच बंद की हर तारीख। तारीख जोड़ें; उस दिन की भविष्य की EMI अगले कार्य दिवस पर खिसक जाती है।',
          warning:
            'छुट्टी हटाने पर पिछली EMI तारीख वापस नहीं आती। EMI शेड्यूल वितरण समय बनकर सेव हो जाता है — सेटिंग्स बदलने पर पुनर्गणना नहीं।',
          example: {
            title: 'एक उदाहरण',
            body:
              'वितरण: शुक्र 7 जून 2026\nप्रोडक्ट डिफ़ॉल्ट: रवि 7 जुलाई\nछुट्टी: 8 जुलाई\nपहली EMI: बुध 9 जुलाई\nबाक़ी सब 9 जुलाई से।',
          },
        },
        {
          id: 'who-can-edit',
          heading: 'कौन क्या बदल सकता है',
          body:
            '• पढ़ना — सुपर एडमिन और मैनेजर।\n• सहेजना — सिर्फ़ सुपर एडमिन।\n• छुट्टी जोड़ना/हटाना — सिर्फ़ सुपर एडमिन।\n• नई key — कोड बदलाव, UI से नहीं।',
        },
        {
          id: 'common-changes',
          heading: 'आम बदलाव और कब करें',
          body:
            '• **उच्च दर वाली नई प्रोडक्ट लाइन** — पहले max_annual_rate_bps बढ़ाएँ, फिर प्रोडक्ट बनाएँ।\n• **त्योहार बंदी** — पहले से तारीख जोड़ें (महीने की शुरुआत में) ताकि सही EMI शेड्यूल बनें।\n• **सख़्त ओवरड्यू नीति** — default_penalty_grace_days 7 → 3।',
        },
      ],
    },
    hinglish: {
      title: 'Settings',
      intro:
        'Settings mein Owner / Super Admin wo rules tay karte hain jo baaki har page par lagte hain — interest limits, group sizes, penalty grace, holidays. Yahan chhota change saikdon loans ko affect kar sakta hai.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER],
      sections: [
        {
          id: 'overview',
          heading: 'Settings page',
          body:
            'Sidebar → Settings. Do main sections: System Settings (key-value bounds) aur Holiday Calendar. Manager sab padh sakta hai; sirf Super Admin save kar sakta hai.',
        },
        {
          id: 'system-settings',
          heading: 'System Settings — bounds',
          body: 'Har row ek named setting. Important:',
          steps: [
            { text: '**max_annual_rate_bps** — kisi product par max rate. 36000 = 360%. Regulations ke hisab se cap karo.' },
            { text: '**min_annual_rate_bps** — min rate. 100 = 1%. Niche typo manega.' },
            { text: '**max_group_size** — group mein max members. SHG ke liye 15 typical.' },
            { text: '**min_group_size** — min; niche joint-liability cushion kam. Usually 5.' },
            { text: '**default_penalty_grace_days** — EMI due date ke baad kitne din tak penalty nahi. 7 common.' },
          ],
        },
        {
          id: 'holidays',
          heading: 'Holiday Calendar',
          body:
            'System Settings ke neeche, branch band ki har date. Date add karo; us din ki future EMIs agle working day par auto shift.',
          warning:
            'Holiday hatane par past EMI dates wapas nahi shift hotin. EMI schedule disbursement time bana ke save hota hai — settings change par recalculate nahi.',
          example: {
            title: 'Ek example',
            body:
              'Disbursement: Fri 7 Jun 2026\nProduct default: Sun 7 Jul\nHoliday: 8 Jul\nFirst EMI: Wed 9 Jul\nBaaki sab 9 Jul se.',
          },
        },
        {
          id: 'who-can-edit',
          heading: 'Kaun kya badal sakta hai',
          body:
            '• Read — Super Admin aur Manager.\n• Save — sirf Super Admin.\n• Holidays add/remove — sirf Super Admin.\n• Nayi key — code change chahiye, UI se nahi.',
        },
        {
          id: 'common-changes',
          heading: 'Common changes aur kab karna',
          body:
            '• **High-rate product line** — pehle max_annual_rate_bps badhao, phir product banao.\n• **Festival closure** — dates pehle se add karo (mahine ke start mein) taki correct EMI schedules ban.\n• **Strict overdue policy** — default_penalty_grace_days 7 → 3.',
        },
      ],
    },
  },
};
