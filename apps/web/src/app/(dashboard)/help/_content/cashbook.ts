import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const cashbook: ChapterContent = {
  id: 'cashbook',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    overview: {
      src: '/help/screenshots/cashbook/cashbook.png',
      alt: 'Cashbook page showing date picker, a red discrepancy alert when closing cash is negative, and four cards: Opening Balance, Cash Inflows, Cash Outflows, Closing Balance — plus the transaction count at the bottom',
      caption: 'The cashbook for a single date. The red banner appears when the day does not tally — see the shortage SOP below.',
    },
  },
  langs: {
    en: {
      title: 'Cashbook & Day-End',
      intro:
        'Every day starts and ends with reconciling cash — counting what came in, what went out, and what should be left. This chapter covers the daily summary, recording an expense, the cash handover to the bank, and what to do when the numbers don’t tally.',
      whoCanDoThis: [UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'overview',
          heading: 'What the cashbook page shows',
          body:
            'Open Cashbook from the sidebar. Pick a date — defaults to today. You see:\n• Opening balance (cash at start of day)\n• Inflows: collections posted today, other cash receipts\n• Outflows: expenses, disbursements, bank deposits\n• Closing balance: opening + inflows − outflows\nThe transaction count at the bottom tells you how many entries make up these numbers.',
        },
        {
          id: 'record-expense',
          heading: 'Recording an expense',
          body:
            'Branch costs — petrol, snacks, stationery, repairs — happen every day. Click Record Expense in the cashbook, pick a category, enter the amount and a short note, and save. The expense is reflected in today’s outflows immediately.',
          tip: 'Always attach a category (rent, utilities, travel, etc.) — categories drive the Expense Report at month-end. A wrong category makes the report harder to trust.',
        },
        {
          id: 'day-end',
          heading: 'Day-end — closing out the day',
          body:
            'At the end of the day, count the physical cash in the drawer and compare it with the Closing balance shown by the system. If they match, you’re done. If they don’t, see the next section.',
        },
        {
          id: 'shortage',
          heading: 'If cash doesn’t tally — the shortage SOP',
          body:
            'A mismatch between physical cash and the system closing balance is called a shortage (or sometimes a surplus). It is recoverable — but do not just adjust the number and move on. Follow these steps in order:',
          steps: [
            { text: 'Count the cash again, calmly. Most mismatches are counting errors.' },
            { text: 'Check the Collections list for any collection that may have been posted but not handed over yet — especially towards the end of the day.' },
            { text: 'Check Reversals — a reversal posted today reduces the system inflow but the original cash may still be in the drawer.' },
            { text: 'Look at expenses recorded today — was any paid from cash that hasn’t been deducted yet?' },
            { text: 'If still off, call your manager. Do NOT close the day with a forced match.' },
          ],
          warning:
            'Never alter past collections or expenses to make the numbers match. Always log the shortage with the manager’s knowledge — the audit log will protect you later.',
        },
        {
          id: 'handover',
          heading: 'Cash handover to the bank',
          body:
            'Collection officers hand over collected cash to the branch or directly to the bank. From Cashbook → Handovers, record each transfer: amount, mode (deposit slip or direct), date, recipient. The accountant later marks the handover as Verified once it appears in the bank statement.',
        },
        {
          id: 'period-closed',
          heading: 'What "Account period closed" means',
          body:
            'When the accountant has finalized the books for a day, week, or month, the system locks that period. After locking, you cannot post a collection, expense, or reversal dated to a locked day. If you genuinely need to backdate something, the accountant must reopen the period — go ask.',
        },
      ],
    },
    hi: {
      title: 'कैशबुक और दिन-समापन',
      intro:
        'हर दिन की शुरुआत और अंत कैश मिलाने से होता है — कितना आया, कितना गया, कितना बचना चाहिए। यह अध्याय बताता है दिन की समरी, खर्च दर्ज करना, बैंक हैंडओवर, और कैश न मिले तो क्या करें।',
      whoCanDoThis: [UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'overview',
          heading: 'कैशबुक पेज क्या दिखाता है',
          body:
            'साइडबार से Cashbook खोलें। तारीख चुनें — डिफ़ॉल्ट आज। आप देखते हैं:\n• ओपनिंग बैलेंस (दिन की शुरुआत का कैश)\n• आय: आज की कलेक्शन, अन्य नकद आय\n• खर्च: व्यय, वितरण, बैंक जमा\n• क्लोज़िंग बैलेंस: ओपनिंग + आय − खर्च\nनीचे की लेन-देन गिनती बताती है कितनी प्रविष्टियाँ इन आँकड़ों में हैं।',
        },
        {
          id: 'record-expense',
          heading: 'खर्च दर्ज करना',
          body:
            'ब्रांच के खर्च — पेट्रोल, नाश्ता, स्टेशनरी, मरम्मत — रोज़ होते हैं। कैशबुक पर Record Expense दबाएँ, श्रेणी चुनें, रकम और छोटा नोट डालें, सेव करें। आज के खर्च में तुरंत दिखेगा।',
          tip: 'श्रेणी ज़रूर डालें (किराया, बिजली, यात्रा आदि) — श्रेणियाँ महीने की Expense Report बनाती हैं। ग़लत श्रेणी रिपोर्ट पर भरोसा घटाती है।',
        },
        {
          id: 'day-end',
          heading: 'दिन-समापन — दिन बंद करना',
          body:
            'दिन के अंत में, ड्रॉर का असली कैश गिनें और सिस्टम के क्लोज़िंग बैलेंस से मिलाएँ। मिल जाए तो काम पूरा। न मिले तो अगला सेक्शन देखें।',
        },
        {
          id: 'shortage',
          heading: 'कैश न मिले — शॉर्टेज SOP',
          body:
            'असली कैश और सिस्टम के क्लोज़िंग में फ़र्क़ "शॉर्टेज" (या कभी "सरप्लस") कहलाता है। ठीक हो सकता है — पर सिर्फ़ नंबर बदलकर आगे न बढ़ें। इस क्रम में करें:',
          steps: [
            { text: 'शांत मन से कैश दोबारा गिनें। ज़्यादातर बार गिनती की ग़लती होती है।' },
            { text: 'Collections लिस्ट देखें — कोई कलेक्शन दर्ज हुई पर अभी हैंडओवर नहीं हुई?' },
            { text: 'Reversals देखें — आज का रिवर्सल सिस्टम की आय घटाता है, मगर असली कैश शायद अभी ड्रॉर में है।' },
            { text: 'आज के खर्च देखें — कोई कैश से दिया हो जो अभी घटाया नहीं?' },
            { text: 'फिर भी फ़र्क़ हो, तो मैनेजर को बुलाएँ। ज़बरदस्ती मिलाकर दिन बंद न करें।' },
          ],
          warning:
            'पुरानी कलेक्शन या खर्च को आँकड़े मिलाने के लिए कभी न बदलें। मैनेजर की जानकारी में शॉर्टेज लॉग करें — ऑडिट लॉग बाद में आपकी रक्षा करेगा।',
        },
        {
          id: 'handover',
          heading: 'बैंक को कैश हैंडओवर',
          body:
            'कलेक्शन ऑफिसर जमा की गई नकद ब्रांच या सीधे बैंक को सौंपते हैं। Cashbook → Handovers से हर ट्रांसफ़र दर्ज करें: रकम, मोड (डिपॉज़िट स्लिप या डायरेक्ट), तारीख, प्राप्तकर्ता। अकाउंटेंट बाद में बैंक स्टेटमेंट देखकर हैंडओवर को Verified करता है।',
        },
        {
          id: 'period-closed',
          heading: '"Account period closed" का मतलब',
          body:
            'अकाउंटेंट जब किसी दिन/सप्ताह/महीने की किताबें अंतिम कर देता है, सिस्टम वह अवधि लॉक कर देता है। लॉक के बाद उस तारीख की कलेक्शन/खर्च/रिवर्सल नहीं लग सकता। ज़रूरी पुरानी तारीख चाहिए तो अकाउंटेंट से अवधि खुलवाएँ।',
        },
      ],
    },
    hinglish: {
      title: 'Cashbook + Day-End',
      intro:
        'Har din ki shuruaat aur end cash milane se hota hai — kitna aaya, kitna gaya, kitna bachna chahiye. Ye chapter daily summary, expense record karna, bank handover, aur cash na mile to kya karna — sab cover karta hai.',
      whoCanDoThis: [UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'overview',
          heading: 'Cashbook page kya dikhata hai',
          body:
            'Sidebar se Cashbook kholo. Date chuno — default aaj. Aap dekhte ho:\n• Opening balance (din ki shuruaat ka cash)\n• Inflows: aaj ki collections, doosre cash receipts\n• Outflows: expenses, disbursements, bank deposits\n• Closing balance: opening + inflows − outflows\nNeeche transaction count batata hai kitni entries hain.',
        },
        {
          id: 'record-expense',
          heading: 'Expense record karna',
          body:
            'Branch ke kharche — petrol, snacks, stationery, repairs — daily hote hain. Cashbook par Record Expense dabao, category chuno, amount aur chhota note bharo, save. Aaj ke outflows mein turant dikhega.',
          tip: 'Category zaroor daalo (rent, utilities, travel, etc.) — categories month-end ki Expense Report banati hain. Galat category report ka bharosa kam karti hai.',
        },
        {
          id: 'day-end',
          heading: 'Day-end — din band karna',
          body:
            'Din ke end mein drawer ka actual cash gino aur system ke closing balance se milao. Match ho gaya to ho gaya. Nahi mila to next section dekho.',
        },
        {
          id: 'shortage',
          heading: 'Cash na mile — shortage SOP',
          body:
            'Actual cash aur system closing mein fark "shortage" (ya kabhi "surplus") kehlata hai. Theek ho sakta hai — par sirf number badalkar aage mat badho. Iss order mein karo:',
          steps: [
            { text: 'Shaant ho ke cash dobara gino. Zyadatar baar counting ki galti hoti hai.' },
            { text: 'Collections list dekho — koi collection post hui par handover abhi nahi hua?' },
            { text: 'Reversals dekho — aaj ka reversal system inflow ghatata hai, par actual cash drawer mein abhi ho sakta hai.' },
            { text: 'Aaj ke expenses dekho — koi cash se diya gaya hai jo abhi katha nahi?' },
            { text: 'Phir bhi fark ho, to manager ko bulao. Zabardasti match karke din band MAT karo.' },
          ],
          warning:
            'Purani collections ya expenses ko numbers milane ke liye kabhi mat badlo. Manager ki jaankari mein shortage log karo — audit log baad mein aapki raksha karega.',
        },
        {
          id: 'handover',
          heading: 'Bank ko cash handover',
          body:
            'Collection officers jama ki gayi cash branch ya seedha bank ko sompte hain. Cashbook → Handovers se har transfer record karo: amount, mode (deposit slip ya direct), date, recipient. Accountant baad mein bank statement dekh kar handover ko Verified karta hai.',
        },
        {
          id: 'period-closed',
          heading: '"Account period closed" ka matlab',
          body:
            'Accountant jab kisi din/week/month ki books final kar deta hai, system wo period lock kar deta hai. Lock ke baad us date par collection/expense/reversal nahi lag sakta. Zaroori backdate chahiye to accountant se period khulwao.',
        },
      ],
    },
  },
};
