import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const penalties: ChapterContent = {
  id: 'penalties',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  langs: {
    en: {
      title: 'Penalties',
      intro:
        'When an EMI is paid late, the system charges a penalty automatically. Sometimes (illness, festival, genuine hardship) a Manager waives it. This chapter explains the calculation, when the grace period kicks in, and how a waiver works.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER_AUDITOR],
      sections: [
        {
          id: 'how-its-calculated',
          heading: 'How a penalty is calculated',
          body:
            'A penalty accrues on the unpaid EMI amount, starting AFTER the grace period (default 7 days, set in Settings → default_penalty_grace_days). The daily penalty rate is configured per product. A typical setting is 0.1% per day on the overdue portion.',
          example: {
            title: 'Worked example — EMI ₹1,000 paid 15 days late',
            body:
              'EMI due:                    1 Mar\nGrace period:               7 days (no penalty)\nPenalty starts:             9 Mar\nPaid:                      16 Mar (8 days into penalty period)\nPenalty rate:               0.1% per day\nPenalty amount:             ₹1,000 × 0.001 × 8 = ₹8\nTotal customer pays:        ₹1,008',
          },
        },
        {
          id: 'where-to-see',
          heading: 'Where to see penalties',
          body:
            'On any loan detail page, scroll to the EMI schedule / penalties section. Each overdue EMI shows the penalty amount and status (active, waived, or paid).',
        },
        {
          id: 'waive',
          heading: 'Waiving a penalty',
          body:
            'Only Manager or Super Admin can waive. Open the loan → click the penalty → Waive. Pick an approver (a different Manager — maker-checker applies) and enter a reason.',
          warning:
            'You cannot waive your own waiver request. Maker-checker: one person initiates, a different person approves. This is the same rule as loan approval.',
          tip:
            'Common acceptable waiver reasons: documented medical emergency, branch error (we collected the wrong amount last month), one-off festival closure not in the holiday calendar. "Customer is a good guy" is not enough — auditors review waivers.',
        },
        {
          id: 'after-waive',
          heading: 'What happens after a waiver',
          body:
            'The penalty\'s status changes to Waived. The customer\'s outstanding drops by the waived amount. The waiver is recorded in the Audit Log with the actor, approver, amount, reason, and timestamp. The customer\'s next SMS (if any) reflects the new outstanding.',
        },
        {
          id: 'errors',
          heading: 'Common errors',
          body:
            '• "You cannot approve your own action" — maker-checker. Pick a different approver.\n• "Penalty already waived" — someone else got there first.\n• "Penalty paid" — the customer already paid it; you can no longer waive.',
        },
      ],
    },
    hi: {
      title: 'पेनल्टी',
      intro:
        'EMI देर से भरने पर सिस्टम अपने आप पेनल्टी लगाता है। कभी (बीमारी, त्योहार, असली कठिनाई) मैनेजर माफ़ करता है। यह अध्याय गणना, ग्रेस अवधि, और माफ़ी समझाता है।',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER_AUDITOR],
      sections: [
        {
          id: 'how-its-calculated',
          heading: 'पेनल्टी कैसे गणना होती है',
          body:
            'पेनल्टी अदा न की EMI पर लगती है, ग्रेस अवधि के बाद से (डिफ़ॉल्ट 7 दिन, Settings → default_penalty_grace_days)। दैनिक दर प्रोडक्ट में तय। आमतौर पर 0.1% प्रति दिन।',
          example: {
            title: 'उदाहरण — EMI ₹1,000, 15 दिन देरी',
            body:
              'EMI तारीख:                  1 मार्च\nग्रेस:                       7 दिन (पेनल्टी नहीं)\nपेनल्टी शुरू:                 9 मार्च\nभुगतान:                     16 मार्च (पेनल्टी अवधि के 8 दिन)\nदर:                         0.1% प्रति दिन\nपेनल्टी:                     ₹1,000 × 0.001 × 8 = ₹8\nग्राहक देता:                  ₹1,008',
          },
        },
        {
          id: 'where-to-see',
          heading: 'पेनल्टी कहाँ दिखती हैं',
          body: 'किसी लोन डिटेल पेज पर EMI schedule / penalties सेक्शन तक स्क्रॉल। हर overdue EMI पर पेनल्टी रकम और स्थिति (active, waived, paid)।',
        },
        {
          id: 'waive',
          heading: 'पेनल्टी माफ़ करना',
          body:
            'सिर्फ़ मैनेजर या सुपर एडमिन। लोन खोलें → पेनल्टी दबाएँ → Waive। approver (दूसरा मैनेजर — मेकर-चेकर) चुनें और कारण लिखें।',
          warning: 'अपने ही माफ़ी अनुरोध को अप्रूव नहीं कर सकते। मेकर-चेकर वही नियम जैसा लोन अप्रूव में।',
          tip:
            'मान्य कारण: दस्तावेज़ी चिकित्सकीय आपात, ब्रांच त्रुटि (पिछले महीने ग़लत रकम ली), त्योहार बंदी जो छुट्टी सूची में नहीं। "ग्राहक अच्छा बंदा है" काफ़ी नहीं — ऑडिटर माफ़ी देखते हैं।',
        },
        {
          id: 'after-waive',
          heading: 'माफ़ी के बाद क्या होता है',
          body:
            'पेनल्टी स्थिति Waived। ग्राहक का आउटस्टैंडिंग माफ़ रकम जितना घटा। माफ़ी ऑडिट लॉग में दर्ज — actor, approver, रकम, कारण, समय। अगला SMS नया आउटस्टैंडिंग दिखाता है।',
        },
        {
          id: 'errors',
          heading: 'आम गलतियाँ',
          body:
            '• "You cannot approve your own action" — मेकर-चेकर। दूसरा approver चुनें।\n• "Penalty already waived" — पहले हो गया।\n• "Penalty paid" — ग्राहक पहले ही चुका चुका; अब माफ़ नहीं।',
        },
      ],
    },
    hinglish: {
      title: 'Penalties',
      intro:
        'EMI late bharne par system auto penalty lagata hai. Kabhi (illness, festival, genuine hardship) Manager waive karta hai. Ye chapter calculation, grace period, aur waiver samjhata hai.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER_AUDITOR],
      sections: [
        {
          id: 'how-its-calculated',
          heading: 'Penalty kaise calculate hoti hai',
          body:
            'Penalty unpaid EMI par lagti hai, grace period ke baad (default 7 din, Settings → default_penalty_grace_days). Daily rate product mein set. Typical 0.1% per day.',
          example: {
            title: 'Example — EMI ₹1,000, 15 din late',
            body:
              'EMI due:                    1 Mar\nGrace:                      7 din (penalty nahi)\nPenalty start:              9 Mar\nPaid:                      16 Mar (penalty period ke 8 din)\nRate:                       0.1% per day\nPenalty:                    ₹1,000 × 0.001 × 8 = ₹8\nCustomer deta hai:          ₹1,008',
          },
        },
        {
          id: 'where-to-see',
          heading: 'Penalties kahan dikhti hain',
          body: 'Kisi loan detail page par EMI schedule / penalties section. Har overdue EMI par penalty amount aur status (active, waived, paid).',
        },
        {
          id: 'waive',
          heading: 'Penalty waive karna',
          body: 'Sirf Manager ya Super Admin. Loan kholo → penalty dabao → Waive. Approver (doosra Manager — maker-checker) chuno aur reason likho.',
          warning: 'Apne hi waiver request ko approve nahi kar sakte. Maker-checker — wahi rule jaisa loan approval mein.',
          tip: 'Valid reasons: documented medical emergency, branch error (pichle mahine galat amount li), festival closure jo holiday list mein nahi. "Customer accha banda hai" kaafi nahi — auditors waivers review karte hain.',
        },
        {
          id: 'after-waive',
          heading: 'Waiver ke baad kya hota hai',
          body:
            'Penalty status Waived. Customer ka outstanding waived amount jitna ghata. Waiver Audit Log mein record — actor, approver, amount, reason, timestamp. Agla SMS naya outstanding dikhata hai.',
        },
        {
          id: 'errors',
          heading: 'Common errors',
          body:
            '• "You cannot approve your own action" — maker-checker. Doosra approver chuno.\n• "Penalty already waived" — pehle ho gaya.\n• "Penalty paid" — customer pehle hi bhar chuka; ab waive nahi.',
        },
      ],
    },
  },
};
