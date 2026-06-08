import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const collections: ChapterContent = {
  id: 'collections',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    post: {
      src: '/help/screenshots/collections/collection-new.png',
      alt: 'Post Collection form with Select Loan search at the top, then Payment Details: Amount, Payment Mode (Cash, Bank Transfer, Online), and Payment Date',
      mobileSrc: '/help/screenshots/collections/collection-new-mobile.png',
      caption: 'Post Collection — the (?) next to the title opens this guide. The floating button at the bottom-right does the same.',
    },
    'on-phone': {
      src: '/help/screenshots/collections/collection-new-mobile.png',
      alt: 'Post Collection on a phone — the same form, single-column, with a tap-friendly mode picker',
      caption: 'On a phone, the form fills the screen — three taps from the dashboard.',
    },
  },
  langs: {
    en: {
      title: 'Collections — taking a payment',
      intro:
        'This is the most common daily action. A customer pays their EMI; you post it, the system generates a receipt, and the loan’s outstanding goes down. Three taps on a phone, done.',
      whoCanDoThis: [UserRole.COLLECTION_OFFICER, UserRole.MANAGER, UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'post',
          heading: 'Posting a collection',
          steps: [
            { text: 'On the dashboard, tap Post Collection (mobile) or open Collections → New (desktop).' },
            { text: 'Search the loan by loan number. Only Active and Overdue loans appear — closed loans are hidden.' },
            { text: 'Enter the amount the customer is paying. You cannot enter more than the outstanding balance.' },
            { text: 'Pick payment mode: Cash, Bank Transfer, or Online.' },
            { text: 'Set the date — defaults to today, can be earlier if you are catching up, never future-dated.' },
            { text: 'Review the confirmation dialog and tap Post Collection.' },
            { text: 'A receipt appears. Share it with the customer or print it.' },
          ],
          tip: 'On your phone, the entire flow takes three taps from the home screen — try it once and the muscle memory kicks in.',
        },
        {
          id: 'safe-retry',
          heading: 'Safe to retry — when the screen freezes',
          body:
            'In bad signal, sometimes you tap Submit and the screen spins for a long time. You start to wonder if it went through.',
          reassure:
            'Tap Submit again. The system uses a unique ticket for each collection — even if your first tap reached the server, the second tap will not double-charge the customer. You will either see the receipt (it went through the first time) or the receipt for the second attempt (the first never landed). Either way, the customer pays once.',
        },
        {
          id: 'reverse',
          heading: 'Reversing a wrong collection',
          body:
            'Mistake happens. Wrong loan picked, wrong amount entered, a customer disputes a receipt — find the collection in the Collections list, open it, and click Reverse. Enter a short reason.',
          reassure:
            'Reversal is the correct fix — it keeps the books clean. The original receipt stays on record; the system writes a matching reversal entry alongside, so the trail is intact. The audit log records who corrected it, like a notebook entry. There is nothing to be afraid of.',
          warning: 'Only Managers and Super Admins can reverse. If you don’t have the permission, ask your manager.',
        },
        {
          id: 'receipts',
          heading: 'Receipts',
          body:
            'Every collection generates a receipt with a unique number. View the receipt from the Collections list or from the customer’s loan page. Tap Print on a connected printer, or share the receipt link on WhatsApp.',
        },
        {
          id: 'allocation',
          heading: 'How a payment is allocated',
          body:
            'The system applies the payment to the oldest unpaid EMI first. Penalties are settled before principal. Any extra amount above the current EMI carries forward to the next one. You don’t pick — the rules do it consistently for every loan.',
        },
        {
          id: 'on-phone',
          heading: 'On your phone — common situations',
          body:
            '• Receipt didn’t print: open the Collections list, find your collection, tap the receipt link, then tap Print.\n• Spinner stuck after submit: see the "Safe to retry" section above.\n• "No internet" message: the form will not submit until signal comes back. Don’t close the app — your entry is still in the form.',
        },
        {
          id: 'errors',
          heading: 'Common errors',
          body:
            '• "Loan closed" — the loan is fully paid or written off. Cannot accept more money on it.\n• "Amount exceeds outstanding" — you typed more than what is owed. Re-check the outstanding.\n• "Future date not allowed" — you set a date after today. Set it to today or earlier.\n• "Account period closed" — accountant has locked this date. Pick today or ask the accountant.',
        },
      ],
    },
    hi: {
      title: 'कलेक्शन — भुगतान दर्ज करना',
      intro:
        'यह रोज़ का सबसे आम काम है। ग्राहक EMI देता है; आप दर्ज करते हैं, सिस्टम रसीद बनाता है, और लोन का आउटस्टैंडिंग घटता है। फ़ोन पर तीन टैप, हो गया।',
      whoCanDoThis: [UserRole.COLLECTION_OFFICER, UserRole.MANAGER, UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'post',
          heading: 'कलेक्शन दर्ज करना',
          steps: [
            { text: 'डैशबोर्ड पर Post Collection दबाएँ (फ़ोन) या Collections → New खोलें (डेस्कटॉप)।' },
            { text: 'लोन नंबर से लोन खोजें। सिर्फ़ Active और Overdue लोन दिखेंगे — बंद लोन छुपे रहते हैं।' },
            { text: 'ग्राहक की भुगतान राशि भरें। आउटस्टैंडिंग से ज़्यादा नहीं भर सकते।' },
            { text: 'भुगतान मोड चुनें: Cash, Bank Transfer, या Online।' },
            { text: 'तारीख तय करें — डिफ़ॉल्ट आज, बाद में पकड़ने पर पहले की चुन सकते हैं, भविष्य की नहीं।' },
            { text: 'पुष्टि डायलॉग देखें और Post Collection दबाएँ।' },
            { text: 'रसीद बन जाती है। ग्राहक के साथ साझा करें या प्रिंट करें।' },
          ],
          tip: 'फ़ोन पर पूरा फ़्लो होम स्क्रीन से तीन टैप का है — एक बार करें, याद हो जाएगा।',
        },
        {
          id: 'safe-retry',
          heading: 'Safe to retry — स्क्रीन रुक जाए तो',
          body: 'खराब सिग्नल में कभी-कभी Submit के बाद स्क्रीन देर तक घूमती है। मन में सवाल — हुआ या नहीं?',
          reassure:
            'फिर से Submit दबाएँ। सिस्टम हर कलेक्शन के लिए एक यूनिक टिकट इस्तेमाल करता है — पहली बार सर्वर तक पहुँचा हो तब भी दूसरी बार दबाने से दो बार चार्ज नहीं होगा। या तो रसीद दिखेगी (पहली बार पहुँच गया था) या दूसरी कोशिश की रसीद। ग्राहक का भुगतान एक ही बार होगा।',
        },
        {
          id: 'reverse',
          heading: 'गलत कलेक्शन रिवर्स करना',
          body:
            'गलती होती है। ग़लत लोन चुन लिया, ग़लत अमाउंट भर दिया, ग्राहक रसीद पर सवाल उठाए — Collections लिस्ट में कलेक्शन ढूँढें, खोलें, Reverse दबाएँ। छोटा सा कारण लिखें।',
          reassure:
            'रिवर्सल सही तरीका है — किताबें साफ़ रखता है। मूल रसीद रिकॉर्ड पर रहती है, सिस्टम बराबर की रिवर्सल एंट्री भी डालता है — पूरा रिकॉर्ड बना रहता है। ऑडिट लॉग बस यह दिखाता है कि किसने सुधारा, जैसे रजिस्टर में नोट। डरने की बात नहीं।',
          warning: 'सिर्फ़ मैनेजर और सुपर एडमिन रिवर्स कर सकते हैं। अधिकार नहीं है, तो मैनेजर से कहें।',
        },
        {
          id: 'receipts',
          heading: 'रसीदें',
          body:
            'हर कलेक्शन की एक यूनिक रसीद बनती है। Collections लिस्ट से या ग्राहक के लोन पेज से देखें। प्रिंटर पर Print दबाएँ, या WhatsApp पर लिंक साझा करें।',
        },
        {
          id: 'allocation',
          heading: 'पैसा कैसे लगता है',
          body:
            'सिस्टम पहले सबसे पुरानी बकाया EMI पर पैसा लगाता है। पेनल्टी मूलधन से पहले चुकती है। मौजूदा EMI से ज़्यादा भरा हो तो बाक़ी अगली EMI में चला जाता है। आप चुनते नहीं — नियम हर लोन में एक जैसा चलते हैं।',
        },
        {
          id: 'on-phone',
          heading: 'फ़ोन पर — आम स्थितियाँ',
          body:
            '• रसीद प्रिंट नहीं हुई: Collections लिस्ट खोलें, अपनी कलेक्शन ढूँढें, रसीद लिंक टैप करें, फिर Print।\n• Submit के बाद स्पिनर रुका: ऊपर "Safe to retry" देखें।\n• "No internet" संदेश: सिग्नल आने तक फ़ॉर्म जमा नहीं होगा। ऐप बंद न करें — आपकी एंट्री फ़ॉर्म में सुरक्षित है।',
        },
        {
          id: 'errors',
          heading: 'आम गलतियाँ',
          body:
            '• "Loan closed" — लोन पूरा भर चुका या बट्टे खाते — और पैसा नहीं ले सकते।\n• "Amount exceeds outstanding" — आउटस्टैंडिंग से ज़्यादा भरा। दोबारा देखें।\n• "Future date not allowed" — आज के बाद की तारीख — आज या पहले की चुनें।\n• "Account period closed" — अकाउंटेंट ने यह तारीख लॉक की। आज की चुनें या अकाउंटेंट से कहें।',
        },
      ],
    },
    hinglish: {
      title: 'Collections — payment lena',
      intro:
        'Ye daily ka sabse common kaam hai. Customer EMI deta hai; aap post karte ho, system receipt banata hai, loan ka outstanding kam ho jaata hai. Phone par teen tap, ho gaya.',
      whoCanDoThis: [UserRole.COLLECTION_OFFICER, UserRole.MANAGER, UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'post',
          heading: 'Collection post karna',
          steps: [
            { text: 'Dashboard par Post Collection dabao (phone) ya Collections → New kholo (desktop).' },
            { text: 'Loan number se loan search karo. Sirf Active aur Overdue loans dikhenge — closed loans hidden hain.' },
            { text: 'Customer jo amount de raha hai bharo. Outstanding se zyada nahi bhar sakte.' },
            { text: 'Payment mode chuno: Cash, Bank Transfer, ya Online.' },
            { text: 'Date set karo — default aaj, peeche pakadne par pehle ki bhi chuni ja sakti hai, future date nahi.' },
            { text: 'Confirmation dialog dekho aur Post Collection dabao.' },
            { text: 'Receipt aa jaati hai. Customer ke saath share karo ya print karo.' },
          ],
          tip: 'Phone par poora flow home screen se 3 tap ka hai — ek baar kar lo, yaad ho jaata hai.',
        },
        {
          id: 'safe-retry',
          heading: 'Safe to retry — screen ruk jaaye to',
          body: 'Kharab signal mein kabhi-kabhi Submit ke baad screen der tak ghoomti hai. Mann mein sawaal — hua ya nahi?',
          reassure:
            'Phir se Submit dabao. System har collection ke liye ek unique ticket use karta hai — pehli baar server tak pahuncha bhi ho, to bhi doosri baar dabane se double charge nahi hoga. Ya to receipt dikhegi (pehli baar pahunch gaya tha), ya doosri attempt ki receipt. Customer ka payment ek hi baar hoga.',
        },
        {
          id: 'reverse',
          heading: 'Galat collection reverse karna',
          body:
            'Galti hoti hai. Galat loan chun liya, galat amount bhar diya, customer receipt par sawaal uthaye — Collections list mein collection dhundo, kholo, Reverse dabao. Chhota sa reason likho.',
          reassure:
            'Reversal correct fix hai — kitabein clean rakhta hai. Original receipt record par rehti hai, system uske saath ek matching reversal entry bhi daal deta hai — poora trail bana rehta hai. Audit log bas itna dikhata hai ki kisne theek kiya, jaise register mein note. Darne ki baat nahi.',
          warning: 'Sirf Manager aur Super Admin reverse kar sakte hain. Permission nahi hai to manager se kaho.',
        },
        {
          id: 'receipts',
          heading: 'Receipts',
          body:
            'Har collection ki ek unique receipt banti hai. Collections list se ya customer ke loan page se dekho. Printer par Print dabao, ya WhatsApp par link share karo.',
        },
        {
          id: 'allocation',
          heading: 'Payment kaise lagta hai',
          body:
            'System pehle sabse purani unpaid EMI par paisa lagata hai. Penalty principal se pehle settle hoti hai. Current EMI se zyada bhara ho to baaki agli EMI mein chala jaata hai. Aap choose nahi karte — rules har loan par same chalte hain.',
        },
        {
          id: 'on-phone',
          heading: 'Phone par — common situations',
          body:
            '• Receipt print nahi hui: Collections list kholo, apni collection dhundo, receipt link tap karo, phir Print.\n• Submit ke baad spinner ruka: upar "Safe to retry" dekho.\n• "No internet" message: signal aane tak form submit nahi hoga. App band mat karo — aapki entry form mein safe hai.',
        },
        {
          id: 'errors',
          heading: 'Common errors',
          body:
            '• "Loan closed" — loan poora bhar chuka ya write-off — aur paisa nahi le sakte.\n• "Amount exceeds outstanding" — outstanding se zyada bhara. Dobara check karo.\n• "Future date not allowed" — aaj ke baad ki date — aaj ya pehle ki chuno.\n• "Account period closed" — accountant ne ye date lock ki hai. Aaj ki chuno ya accountant se kaho.',
        },
      ],
    },
  },
};
