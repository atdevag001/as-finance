import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const receipts: ChapterContent = {
  id: 'receipts',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    find: {
      src: '/help/screenshots/receipts/receipts-list.png',
      alt: 'The Receipts list showing receipt number, loan number, customer, amount, collection date, payment mode, and status. A filter box at the top accepts a loan ID.',
      caption: 'The Receipts list. Use the eye icon on any row to open the printable detail.',
    },
  },
  langs: {
    en: {
      title: 'Receipts',
      intro:
        'Every collection produces a receipt — the customer\'s proof of payment and the branch\'s record. This chapter covers finding old receipts, printing, sharing on WhatsApp, and what happens when a collection is reversed.',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'what-is-a-receipt',
          heading: 'What is a receipt?',
          body:
            'A receipt is a numbered record of one collection. It carries: receipt number, date, customer name, loan number, amount, payment mode, and the staff who collected it. Once generated, the receipt number never changes — even if the collection is later reversed (see below).',
        },
        {
          id: 'find',
          heading: 'Finding a receipt',
          body:
            'Sidebar → Receipts. The list shows recent receipts first. To find a specific one:',
          steps: [
            { text: 'If you have the loan ID (a UUID), paste it into the filter box.' },
            { text: 'If you have the customer\'s phone, search them under Customers, open their profile, and scroll to Loans → the loan → Collections history. Each collection links to its receipt.' },
            { text: 'If you have the receipt number, the easiest path today is the customer/loan path above — direct receipt-number search is a planned enhancement.' },
          ],
        },
        {
          id: 'view',
          heading: 'Viewing a receipt',
          body:
            'Click the 👁 icon on any list row. The receipt opens in a printable layout — branch name, customer details, amount in words + figures, signature lines.',
        },
        {
          id: 'print',
          heading: 'Printing',
          body:
            'On the receipt detail page, click Print (or press Ctrl+P / Cmd+P). The browser print dialog opens with the receipt formatted for A5 paper. Pick "Save as PDF" if you don\'t have a printer handy.',
          tip:
            'If your receipts come out half-blank, set the print scale to 100% and margins to Default. Some browsers shrink content to fit the page, which can cut off the signature line.',
        },
        {
          id: 'share',
          heading: 'Sharing on WhatsApp',
          body:
            'Open the receipt detail page → copy the URL from the browser address bar → paste into WhatsApp. Customers without an account login still cannot open the link (it requires login), so for sharing with the borrower, "Print → Save as PDF → Share PDF" is the reliable path.',
        },
        {
          id: 'reversal-effect',
          heading: 'What happens to a receipt when the collection is reversed',
          body:
            'The original receipt stays on record forever — receipts are never deleted. The system writes a matching "reversal" receipt alongside, with the same amount in the opposite direction. Net effect on the customer\'s outstanding: zero. Audit-wise: complete trail of both the mistake and the correction.',
          reassure:
            'If you reversed a receipt by mistake, just post a new collection — the customer pays once, the books stay clean.',
        },
        {
          id: 'common-errors',
          heading: 'Common situations',
          body:
            '• "Receipt status: Reversed" — the matching collection was reversed; the customer\'s outstanding is back to what it was before.\n• "Invalid loan ID" in the filter — that\'s not a valid UUID. Try with the customer profile path instead.\n• Receipt count looks lower than expected — toggle the date range; the list defaults to the last 30 days.',
        },
      ],
    },
    hi: {
      title: 'रसीदें',
      intro:
        'हर कलेक्शन एक रसीद बनाती है — ग्राहक का भुगतान प्रमाण और ब्रांच का रिकॉर्ड। यह अध्याय पुरानी रसीदें ढूँढना, प्रिंट, WhatsApp पर साझा, और रिवर्सल पर असर बताता है।',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'what-is-a-receipt',
          heading: 'रसीद क्या है?',
          body:
            'एक कलेक्शन का क्रमांकित रिकॉर्ड। इसमें: रसीद नंबर, तारीख, ग्राहक नाम, लोन नंबर, रकम, भुगतान मोड, और कलेक्ट करने वाले स्टाफ़। एक बार बनी रसीद का नंबर कभी नहीं बदलता — रिवर्सल पर भी नहीं।',
        },
        {
          id: 'find',
          heading: 'रसीद ढूँढना',
          body: 'साइडबार → Receipts। नई रसीदें पहले दिखती हैं। ख़ास रसीद के लिए:',
          steps: [
            { text: 'लोन ID (UUID) हो तो फ़िल्टर बॉक्स में पेस्ट करें।' },
            { text: 'ग्राहक का फ़ोन हो — Customers में खोजें, प्रोफ़ाइल खोलें, Loans → लोन → Collections history देखें।' },
            { text: 'सिर्फ़ रसीद नंबर हो — फ़िलहाल ग्राहक/लोन वाला रास्ता आसान है (सीधा सर्च भविष्य की सुविधा है)।' },
          ],
        },
        {
          id: 'view',
          heading: 'रसीद देखना',
          body: 'किसी पंक्ति पर 👁 आइकन दबाएँ। प्रिंट-तैयार लेआउट खुलेगा — ब्रांच, ग्राहक, रकम (शब्दों और अंकों में), हस्ताक्षर लाइनें।',
        },
        {
          id: 'print',
          heading: 'प्रिंट',
          body:
            'रसीद डिटेल पर Print दबाएँ (या Ctrl+P / Cmd+P)। A5 के लिए ब्राउज़र प्रिंट डायलॉग खुलेगा। प्रिंटर न हो तो "Save as PDF" चुनें।',
          tip: 'रसीद आधी ख़ाली निकले तो Scale 100% और Margins Default रखें। कुछ ब्राउज़र सामग्री सिकोड़ देते हैं।',
        },
        {
          id: 'share',
          heading: 'WhatsApp पर साझा करना',
          body:
            'रसीद डिटेल खोलें → पता बार से URL कॉपी → WhatsApp में पेस्ट। ग्राहक के पास लॉगिन न हो तो लिंक नहीं खुलेगा (लॉगिन ज़रूरी है)। साझा करने के लिए "Print → Save as PDF → PDF साझा" बेहतर है।',
        },
        {
          id: 'reversal-effect',
          heading: 'रिवर्सल पर रसीद का क्या होता है',
          body:
            'मूल रसीद हमेशा रहती है — कभी नहीं मिटती। सिस्टम बराबर की उल्टी "reversal" रसीद डालता है। ग्राहक के आउटस्टैंडिंग पर प्रभाव शून्य। ऑडिट: ग़लती और सुधार दोनों का पूरा सबूत।',
          reassure: 'ग़लती से रिवर्स की हो — नई कलेक्शन डाल दीजिए। ग्राहक एक ही बार चुकाता है, किताबें साफ़ रहती हैं।',
        },
        {
          id: 'common-errors',
          heading: 'आम स्थितियाँ',
          body:
            '• "Receipt status: Reversed" — मेल खाती कलेक्शन रिवर्स हुई; आउटस्टैंडिंग पहले जैसा।\n• "Invalid loan ID" — UUID नहीं है। ग्राहक-प्रोफ़ाइल वाले रास्ते से करें।\n• रसीदें कम दिख रही हैं — तारीख रेंज बदलें; डिफ़ॉल्ट 30 दिन है।',
        },
      ],
    },
    hinglish: {
      title: 'Receipts',
      intro:
        'Har collection ek receipt banti hai — customer ka payment proof aur branch ka record. Ye chapter purani receipts dhundhna, print karna, WhatsApp par share, aur reversal par asar batata hai.',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'what-is-a-receipt',
          heading: 'Receipt kya hai?',
          body:
            'Ek collection ka numbered record. Mein: receipt number, date, customer name, loan number, amount, payment mode, collect karne wala staff. Ek baar bani receipt ka number kabhi nahi badalta — reversal par bhi nahi.',
        },
        {
          id: 'find',
          heading: 'Receipt dhundhna',
          body: 'Sidebar → Receipts. Nayi receipts pehle dikhti hain. Specific ke liye:',
          steps: [
            { text: 'Loan ID (UUID) ho to filter box mein paste karo.' },
            { text: 'Customer ka phone ho — Customers mein search karo, profile kholo, Loans → loan → Collections history dekho.' },
            { text: 'Sirf receipt number ho — abhi customer/loan wala raasta easy hai (seedha search future enhancement hai).' },
          ],
        },
        {
          id: 'view',
          heading: 'Receipt dekhna',
          body: 'Kisi row par 👁 icon dabao. Print-ready layout khulega — branch, customer, amount (words + figures), signature lines.',
        },
        {
          id: 'print',
          heading: 'Print',
          body:
            'Receipt detail par Print dabao (ya Ctrl+P / Cmd+P). A5 ke liye browser print dialog khulega. Printer na ho to "Save as PDF" chuno.',
          tip: 'Receipt aadhi blank nikle to Scale 100% aur Margins Default rakho. Kuch browsers content shrink kar dete hain.',
        },
        {
          id: 'share',
          heading: 'WhatsApp par share',
          body:
            'Receipt detail kholo → address bar se URL copy → WhatsApp mein paste. Customer ke paas login na ho to link nahi khulega (login zaroori hai). Share karne ke liye "Print → Save as PDF → PDF share" reliable hai.',
        },
        {
          id: 'reversal-effect',
          heading: 'Reversal par receipt ka kya hota hai',
          body:
            'Original receipt hamesha rehti hai — kabhi delete nahi hoti. System matching ulti "reversal" receipt daal deta hai. Customer ke outstanding par effect zero. Audit: galti aur correction dono ka poora trail.',
          reassure: 'Galti se reverse ki ho — nayi collection daal do. Customer ek hi baar bhare, books clean rahengi.',
        },
        {
          id: 'common-errors',
          heading: 'Common situations',
          body:
            '• "Receipt status: Reversed" — matching collection reverse hui; outstanding pehle jaisa.\n• "Invalid loan ID" — UUID nahi hai. Customer-profile waale raaste se karo.\n• Receipts kam dikh rahi hain — date range badlo; default 30 days hai.',
        },
      ],
    },
  },
};
