import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const notifications: ChapterContent = {
  id: 'notifications',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    'what-gets-queued': {
      src: '/help/screenshots/notifications/notifications-list.png',
      alt: 'Notifications list with columns Created, Event (Collection Receipt, Disbursed, etc.), Recipient (phone number), Message, Status (Sent), Retries (e.g. 0/3), and Actions',
      caption: 'The notifications queue. Each row is one SMS, with status and retry count.',
    },
  },
  langs: {
    en: {
      title: 'Notifications',
      intro:
        'When a customer takes a loan or pays an EMI, the system queues an SMS to them. This chapter is for Managers and Admins keeping an eye on that queue — most users do not need to read it.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER],
      sections: [
        {
          id: 'what-gets-queued',
          heading: 'What gets queued',
          body:
            'Each business event creates one outbox message: loan approved, loan disbursed, EMI received, EMI overdue, password changed. The message body is templated from the event. The recipient is the customer\'s registered mobile number.',
        },
        {
          id: 'statuses',
          heading: 'Status meanings',
          body:
            '• **Pending** — queued; the SMS worker has not picked it up yet (usually <1 minute).\n• **Processing** — the worker is actively sending right now.\n• **Sent** — the SMS gateway accepted the message. Delivery to the phone is the gateway\'s responsibility, not ours.\n• **Failed** — the gateway rejected it. Retry queues another attempt.\n• **Dead letter** — multiple retries failed. Needs human intervention.',
        },
        {
          id: 'retry',
          heading: 'Retrying a failed message',
          body:
            'Sidebar → Notifications. Filter to Failed or Dead letter. Click the retry icon on a row — the message moves back to Pending and the worker picks it up.',
          tip:
            'Retrying makes sense if the failure was transient (network blip, gateway timeout). If the recipient phone is permanently wrong (a Land line, an invalid format), fix the customer\'s mobile under Customers first, then retry.',
        },
        {
          id: 'when-to-escalate',
          heading: 'When to escalate',
          body:
            'A handful of failures per day is normal — gateways have hiccups. Escalate to the Owner / support if you see:\n• A flood of Failed in a short window (your SMS gateway may be down).\n• Repeated Dead letter for the same customer (bad mobile on file — fix the customer record).\n• Zero messages moving from Pending → Sent for >10 minutes (the SMS worker may be stuck).',
        },
        {
          id: 'common-errors',
          heading: 'Common reasons SMS fail',
          body:
            '• **Invalid mobile** — fewer than 10 digits, or starts with the wrong country code.\n• **DND** — the customer registered "Do Not Disturb"; transactional SMS may still go through depending on category.\n• **Gateway rate limit** — too many messages in a short burst; the worker spaces them out automatically on retry.\n• **Account balance** — your SMS gateway account is out of credit (check with Owner).',
        },
        {
          id: 'privacy',
          heading: 'A note on content',
          body:
            'The SMS templates do NOT include the customer\'s Aadhaar, PAN, or full account number. They include just enough — name, loan number, amount, branch contact — for the customer to recognize the message as theirs.',
        },
      ],
    },
    hi: {
      title: 'नोटिफिकेशन',
      intro:
        'जब ग्राहक लोन लेता है या EMI भरता है, सिस्टम उन्हें SMS कतार में डालता है। यह अध्याय मैनेजर/एडमिन के लिए है — ज़्यादातर यूज़र को पढ़ने की ज़रूरत नहीं।',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER],
      sections: [
        {
          id: 'what-gets-queued',
          heading: 'क्या क़तार में जाता है',
          body:
            'हर बिज़नेस इवेंट एक आउटबॉक्स संदेश बनाता है: लोन अप्रूव, वितरण, EMI प्राप्त, EMI overdue, पासवर्ड बदला। मेसेज टेम्पलेट से बनता है। प्राप्तकर्ता ग्राहक का दर्ज मोबाइल नंबर।',
        },
        {
          id: 'statuses',
          heading: 'स्थितियों का अर्थ',
          body:
            '• **Pending** — क़तार में; अभी भेजा नहीं गया (आमतौर पर 1 मिनट से कम)।\n• **Processing** — अभी भेजा जा रहा है।\n• **Sent** — SMS गेटवे ने स्वीकार किया। फ़ोन तक पहुँचाना गेटवे का काम।\n• **Failed** — गेटवे ने अस्वीकार किया। Retry फिर कोशिश करता है।\n• **Dead letter** — कई कोशिशों के बाद विफल। मानवीय हस्तक्षेप चाहिए।',
        },
        {
          id: 'retry',
          heading: 'विफल संदेश दोबारा भेजना',
          body:
            'साइडबार → Notifications। Failed या Dead letter फ़िल्टर करें। पंक्ति पर retry आइकन — मेसेज वापस Pending, वर्कर उठाएगा।',
          tip:
            'अस्थायी विफलता (नेटवर्क, टाइमआउट) पर retry सही है। फ़ोन नंबर ही ग़लत हो — पहले Customers में मोबाइल ठीक करें, फिर retry।',
        },
        {
          id: 'when-to-escalate',
          heading: 'कब बढ़ाना',
          body:
            'रोज़ कुछ विफल सामान्य हैं। मालिक/सपोर्ट को बुलाएँ अगर:\n• कम समय में बहुत सारे Failed (गेटवे डाउन हो सकता)।\n• एक ही ग्राहक के लिए बार-बार Dead letter (मोबाइल ग़लत — ग्राहक रिकॉर्ड सुधारें)।\n• Pending → Sent 10 मिनट से नहीं हुआ (वर्कर अटका हो)।',
        },
        {
          id: 'common-errors',
          heading: 'SMS विफल होने के सामान्य कारण',
          body:
            '• **अमान्य मोबाइल** — 10 अंक से कम, या ग़लत कंट्री कोड।\n• **DND** — ग्राहक का "Do Not Disturb" है; ट्रांज़ैक्शनल SMS कभी फिर भी जा सकते हैं।\n• **गेटवे रेट लिमिट** — एक साथ बहुत; वर्कर अपने आप समय फ़ैला देता है।\n• **खाता बैलेंस** — SMS गेटवे क्रेडिट ख़त्म (मालिक से जाँचें)।',
        },
        {
          id: 'privacy',
          heading: 'सामग्री पर एक नोट',
          body:
            'SMS टेम्पलेट में ग्राहक का आधार, PAN या पूरा खाता नंबर नहीं होता। बस इतना — नाम, लोन नंबर, रकम, ब्रांच संपर्क — ताकि ग्राहक मेसेज पहचान सके।',
        },
      ],
    },
    hinglish: {
      title: 'Notifications',
      intro:
        'Jab customer loan leta hai ya EMI bharta hai, system unhe SMS queue mein daalta hai. Ye chapter Managers aur Admins ke liye hai — zyadatar users ko padhne ki zaroorat nahi.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER],
      sections: [
        {
          id: 'what-gets-queued',
          heading: 'Kya queue mein jata hai',
          body:
            'Har business event ek outbox message banata hai: loan approved, disbursed, EMI received, EMI overdue, password changed. Message template se banta hai. Recipient customer ka registered mobile.',
        },
        {
          id: 'statuses',
          heading: 'Statuses ka matlab',
          body:
            '• **Pending** — queue mein; abhi nahi bheja (usually <1 min).\n• **Processing** — abhi bheja ja raha hai.\n• **Sent** — SMS gateway ne accept kiya. Phone tak pahunchana gateway ka kaam.\n• **Failed** — gateway ne reject kiya. Retry phir try karta hai.\n• **Dead letter** — multiple retries fail. Human intervention chahiye.',
        },
        {
          id: 'retry',
          heading: 'Failed message dobara bhejna',
          body:
            'Sidebar → Notifications. Failed ya Dead letter filter karo. Row par retry icon — message wapas Pending, worker uthayega.',
          tip:
            'Transient failure (network blip, timeout) par retry sahi hai. Phone number hi galat ho — pehle Customers mein mobile theek karo, phir retry.',
        },
        {
          id: 'when-to-escalate',
          heading: 'Kab escalate karna',
          body:
            'Daily kuch failures normal hain. Owner/support ko bulao agar:\n• Short window mein Failed ki flood (gateway down ho sakta).\n• Ek hi customer ke liye baar-baar Dead letter (galat mobile — customer record fix karo).\n• Pending → Sent 10 min se nahi hua (worker stuck ho).',
        },
        {
          id: 'common-errors',
          heading: 'SMS fail hone ke common reasons',
          body:
            '• **Invalid mobile** — 10 digit se kam, ya galat country code.\n• **DND** — customer ka "Do Not Disturb" hai; transactional SMS phir bhi ja sakte hain category par.\n• **Gateway rate limit** — short burst mein bahut messages; worker space out kar deta hai.\n• **Account balance** — SMS gateway credit khatam (Owner se check karo).',
        },
        {
          id: 'privacy',
          heading: 'Content par ek note',
          body:
            'SMS templates mein customer ka Aadhaar, PAN, ya full account number nahi hota. Bas itna — name, loan number, amount, branch contact — taki customer message pehchan sake.',
        },
      ],
    },
  },
};
