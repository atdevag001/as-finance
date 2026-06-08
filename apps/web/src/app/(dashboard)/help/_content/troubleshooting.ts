import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const troubleshooting: ChapterContent = {
  id: 'troubleshooting',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  langs: {
    en: {
      title: 'Help & Troubleshooting',
      intro:
        'When something goes wrong, look here first. Below are the most common error messages, what they mean, and what to do.',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'menu-missing',
          heading: 'I can’t see a menu item that my colleague sees',
          body:
            'This is normal — not a bug. The sidebar only shows menu items your role has permission for. If you genuinely need access for your work, ask your manager — they can change your role.',
        },
        {
          id: 'approve-greyed-out',
          heading: 'Approve / Disburse button is greyed out',
          body:
            'This is the maker-checker rule: a person who created or submitted an action is not allowed to approve it. Ask a different manager to approve. (See Roles → Maker-checker for the full explanation.)',
        },
        {
          id: 'period-closed',
          heading: '"Account period closed"',
          body:
            'The accountant has finalized the books for this date. You cannot post a transaction dated to a closed day. Either pick today’s date instead, or ask the accountant to reopen the period.',
        },
        {
          id: 'session-expired',
          heading: '"Session expired" / sent back to login',
          body:
            'Sessions last 15 minutes for security. If you’ve been away from the screen, the system signs you out. Log in again and continue.',
        },
        {
          id: 'quote-expired',
          heading: '"Foreclosure quote expired"',
          body:
            'Quotes are valid for 24 hours. If the customer didn’t come in during that time, just generate a fresh quote — nothing is lost.',
        },
        {
          id: 'duplicate',
          heading: '"Duplicate Aadhaar"',
          body:
            'Someone with this Aadhaar (or mobile) is already registered. Open the existing customer first — most often that’s the right person. See Customers → Duplicate warning.',
        },
        {
          id: 'forgot-password',
          heading: 'I forgot my password',
          body:
            'There is no self-serve password reset. Ask an admin (your manager or system administrator) to reset it for you. They’ll give you a temporary password — change it on first login.',
        },
        {
          id: 'rate-limit',
          heading: '"Rate limited" on Reports',
          body: 'You can run up to 5 exports per minute. Wait a minute and try again — the limit resets.',
        },
        {
          id: 'spinner-stuck',
          heading: 'The screen spins forever after Submit',
          body:
            'For collections: tap Submit again. The system uses a unique ticket per submit and will not double-charge (see Collections → Safe to retry). For other actions: refresh the page and check whether the action went through before re-trying.',
        },
        {
          id: 'escalation',
          heading: 'Still stuck? Escalation',
          body:
            'In order:\n1. Your Branch Manager — for workflow questions and most permission requests.\n2. Your System Administrator — for password resets, new user accounts, and settings.\n3. AS-Finance support — for system bugs or anything urgent that the above can’t solve.\n\nThe support phone, hours, and languages spoken are on the Help home page.',
        },
      ],
    },
    hi: {
      title: 'मदद और समस्याएँ',
      intro:
        'कुछ गड़बड़ हो तो पहले यहाँ देखें। नीचे आम त्रुटि संदेश, उनका मतलब और क्या करें — सब है।',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'menu-missing',
          heading: 'सहकर्मी को मेनू दिखे, मुझे नहीं',
          body:
            'यह सामान्य है — बग नहीं। साइडबार सिर्फ़ आपकी अनुमति वाले मेनू दिखाता है। अगर सच में काम के लिए चाहिए, मैनेजर से कहें — रोल बदला जा सकता है।',
        },
        {
          id: 'approve-greyed-out',
          heading: 'Approve / Disburse बटन डिसएबल',
          body:
            'यह मेकर-चेकर नियम है: जिसने काम बनाया/सबमिट किया वही अप्रूव नहीं कर सकता। दूसरे मैनेजर से अप्रूव करवाएँ। (पूरी व्याख्या के लिए "आपकी भूमिका → मेकर-चेकर" देखें।)',
        },
        {
          id: 'period-closed',
          heading: '"Account period closed"',
          body:
            'अकाउंटेंट ने इस तारीख की किताबें अंतिम कर दी हैं। बंद तारीख पर लेन-देन नहीं हो सकता। आज की चुनें या अकाउंटेंट से अवधि खुलवाएँ।',
        },
        {
          id: 'session-expired',
          heading: '"Session expired" / लॉगिन पेज पर वापस',
          body: 'सुरक्षा के लिए सेशन 15 मिनट का है। दूर रहे तो सिस्टम साइन आउट कर देता है। फिर से लॉगिन करें।',
        },
        {
          id: 'quote-expired',
          heading: '"Foreclosure quote expired"',
          body: 'कोटेशन 24 घंटे के लिए है। ग्राहक उस समय में न आए तो नया कोटेशन बनाएँ — कुछ खोता नहीं।',
        },
        {
          id: 'duplicate',
          heading: '"Duplicate Aadhaar"',
          body:
            'इस आधार (या मोबाइल) पर कोई पहले से रजिस्टर्ड है। पहले मौजूदा ग्राहक खोलें — अक्सर वही सही व्यक्ति होते हैं। (ग्राहक → डुप्लिकेट चेतावनी देखें।)',
        },
        {
          id: 'forgot-password',
          heading: 'पासवर्ड भूल गए',
          body:
            'खुद से पासवर्ड रीसेट का तरीका नहीं है। एडमिन (मैनेजर या सिस्टम एडमिन) से रीसेट करवाएँ। अस्थायी पासवर्ड मिलेगा — पहले लॉगिन पर बदल लें।',
        },
        {
          id: 'rate-limit',
          heading: 'Reports पर "Rate limited"',
          body: 'एक मिनट में अधिकतम 5 एक्सपोर्ट। एक मिनट रुक कर फिर करें — सीमा रीसेट हो जाती है।',
        },
        {
          id: 'spinner-stuck',
          heading: 'Submit के बाद स्क्रीन हमेशा घूमती है',
          body:
            'कलेक्शन के लिए: फिर से Submit दबाएँ। सिस्टम हर सबमिट के लिए यूनिक टिकट इस्तेमाल करता है — दो बार चार्ज नहीं होगा (कलेक्शन → Safe to retry देखें)। बाक़ी क्रियाओं के लिए: पेज रिफ्रेश करें और देखें क्या हुआ, फिर दोबारा करें।',
        },
        {
          id: 'escalation',
          heading: 'फिर भी अटके हैं? एस्केलेशन',
          body:
            'क्रम से:\n1. आपके ब्रांच मैनेजर — वर्कफ़्लो और ज़्यादातर अनुमति के लिए।\n2. सिस्टम एडमिन — पासवर्ड रीसेट, नया यूज़र, सेटिंग्स।\n3. AS-Finance सपोर्ट — सिस्टम की बग या ज़रूरी मामला जो ऊपर वाले हल न कर पाए।\n\nसपोर्ट फ़ोन, समय, और भाषाएँ हेल्प के होम पेज पर हैं।',
        },
      ],
    },
    hinglish: {
      title: 'Help + Problems',
      intro:
        'Kuch galat ho to pehle yahan dekho. Niche common error messages, unka matlab, aur kya karna — sab hai.',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'menu-missing',
          heading: 'Colleague ko menu dikhe, mujhe nahi',
          body:
            'Ye normal hai — bug nahi. Sidebar sirf wahi items dikhata hai jinki aapke role ko permission hai. Kaam ke liye sach mein chahiye to manager se kaho — role badla ja sakta hai.',
        },
        {
          id: 'approve-greyed-out',
          heading: 'Approve / Disburse button disabled',
          body:
            'Ye maker-checker rule hai: jisne action banaya/submit kiya wahi approve nahi kar sakta. Doosre manager se approve karwao. (Poori explanation "Aapka Role → Maker-checker" mein hai.)',
        },
        {
          id: 'period-closed',
          heading: '"Account period closed"',
          body:
            'Accountant ne is date ki books final kar di hain. Closed date par transaction nahi ho sakta. Aaj ki date chuno ya accountant se period khulwao.',
        },
        {
          id: 'session-expired',
          heading: '"Session expired" / login page par wapas',
          body: 'Security ke liye session 15 minute ka hai. Door rahe to system sign-out kar deta hai. Phir se login karo.',
        },
        {
          id: 'quote-expired',
          heading: '"Foreclosure quote expired"',
          body: 'Quote 24 ghante ke liye valid hai. Customer us time mein nahi aaya to naya quote bana lo — kuch loss nahi.',
        },
        {
          id: 'duplicate',
          heading: '"Duplicate Aadhaar"',
          body:
            'Is Aadhaar (ya mobile) par koi pehle se register hai. Pehle existing customer kholo — zyadatar wahi sahi banda hota hai. (Customers → Duplicate warning dekho.)',
        },
        {
          id: 'forgot-password',
          heading: 'Password bhool gaye',
          body:
            'Khud se password reset ka tareeka nahi hai. Admin (manager ya system admin) se reset karwao. Temporary password milega — pehli login par change kar lo.',
        },
        {
          id: 'rate-limit',
          heading: 'Reports par "Rate limited"',
          body: 'Ek minute mein max 5 exports. Ek minute ruk ke phir karo — limit reset ho jaati hai.',
        },
        {
          id: 'spinner-stuck',
          heading: 'Submit ke baad screen hamesha ghoomti hai',
          body:
            'Collection ke liye: phir se Submit dabao. System har submit ke liye unique ticket use karta hai — double charge nahi hoga (Collections → Safe to retry dekho). Baaki actions ke liye: page refresh karo aur dekho kya hua, phir dobara karo.',
        },
        {
          id: 'escalation',
          heading: 'Phir bhi atke ho? Escalation',
          body:
            'Order se:\n1. Aapke Branch Manager — workflow aur zyadatar permission ke liye.\n2. System Administrator — password reset, naye users, settings.\n3. AS-Finance support — system bug ya urgent jo upar wale solve nahi kar paaye.\n\nSupport phone, hours, aur languages Help home page par hain.',
        },
      ],
    },
  },
};
