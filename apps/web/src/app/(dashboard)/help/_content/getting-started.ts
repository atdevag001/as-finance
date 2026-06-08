import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const gettingStarted: ChapterContent = {
  id: 'getting-started',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    dashboard: {
      src: '/help/screenshots/getting-started/dashboard.png',
      alt: 'The AS-Finance dashboard showing KPI cards for Total Customers, Active Loans, Overdue Loans, Pending Approvals, plus Total Outstanding, Today\'s Collections, and Today\'s Disbursements',
      caption: "The dashboard, as it looks for a Branch Manager. Numbers shown are seed-data examples.",
    },
    sidebar: {
      src: '/help/screenshots/getting-started/dashboard-mobile.png',
      alt: 'AS-Finance dashboard on a phone, showing three quick-action buttons (Post Collection, Find Customer, Groups) above the KPI cards, with the bottom navigation bar visible',
      caption: 'On a phone, the bottom bar gives you four shortcuts. "More" opens the full sidebar.',
    },
  },
  langs: {
    en: {
      title: 'Getting Started',
      intro:
        'AS-Finance is your branch’s loan management system. This chapter walks you through your first five minutes — logging in, finding your way around the dashboard, and getting comfortable.',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'what-is-as-finance',
          heading: 'What is AS-Finance?',
          body:
            'A loan management system (LMS) used by branch staff to register customers, give and track loans, collect payments, and run reports. Everything you used to write in a notebook now lives in one place — searchable, automatic, and shared with your team.',
        },
        {
          id: 'first-time',
          heading: 'First time? Your 5-minute path',
          body: 'New to AS-Finance? Walk through these in order:',
          steps: [
            { text: 'Read the "Logging in" section just below.' },
            { text: 'Open the Your Role chapter — find your job title and what you can do.' },
            { text: 'Read the chapter for your main daily task (Collections, Loans, or Customers).' },
            { text: 'Bookmark this help page in your browser.' },
            { text: 'You’re ready. If anything looks odd, the ? icon next to a button opens the right help section.' },
          ],
        },
        {
          id: 'logging-in',
          heading: 'Logging in',
          body:
            'Open the AS-Finance address your manager gave you. Type your username and password. Click Sign in.',
          tip: 'If the screen sends you back to the login page after a while, your session has expired. This is normal — sign in again. Sessions last 15 minutes for security.',
          warning:
            'Never share your password with anyone. If you forgot it, ask an admin to reset it for you (see Administration chapter).',
        },
        {
          id: 'dashboard',
          heading: 'The dashboard',
          body:
            'After login you land on the dashboard. The big numbers at the top are your branch’s pulse: total customers, active loans, overdue loans, and pending approvals. On a phone, you also see three big buttons — Post Collection, Find Customer, Groups — for the most common daily actions.',
        },
        {
          id: 'sidebar',
          heading: 'The sidebar — finding things',
          body:
            'On a computer the menu sits on the left. On a phone, tap the menu icon at the top-left to open it. You only see menu items you have permission for, so if a colleague’s screen looks different, that’s normal — they have a different role.',
          tip: 'On phone, the four buttons at the bottom of the screen are quick shortcuts to Home, Collect, Groups, and More.',
        },
        {
          id: 'help-everywhere',
          heading: 'Help is always within reach',
          body:
            'You don’t need to come to this Help section every time. Look for the small ? icon next to important buttons like Approve, Disburse, Reverse, and Day-End. Clicking it opens a side-panel with the exact step you need.',
        },
        {
          id: 'change-password',
          heading: 'Changing your password',
          body:
            'Open your profile (in the sidebar footer, click your name) → Change password. Enter the old password, then the new one twice. Once saved, you’ll be asked to log in again with the new password.',
          warning:
            'Pick a password at least 8 characters long, with one uppercase, one lowercase, and one number. Don’t reuse the password from any other website.',
        },
        {
          id: 'logging-out',
          heading: 'Logging out',
          body: 'Click Sign out in the sidebar footer. Always log out before handing the device to someone else.',
        },
      ],
    },
    hi: {
      title: 'शुरुआत',
      intro:
        'AS-Finance आपकी ब्रांच का लोन मैनेजमेंट सिस्टम है। यह अध्याय आपके पहले 5 मिनट के लिए है — लॉगिन, डैशबोर्ड और सिस्टम में सहज होना।',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'what-is-as-finance',
          heading: 'AS-Finance क्या है?',
          body:
            'एक लोन मैनेजमेंट सिस्टम (LMS), जिसका इस्तेमाल ब्रांच का स्टाफ़ करता है — ग्राहक रजिस्टर करना, लोन देना और ट्रैक करना, कलेक्शन लेना, रिपोर्ट देखना। पहले जो कुछ रजिस्टर पर लिखते थे, अब एक ही जगह — खोजने में आसान, अपने आप अपडेट, और पूरी टीम के साथ साझा।',
        },
        {
          id: 'first-time',
          heading: 'पहली बार? 5 मिनट का रास्ता',
          body: 'AS-Finance में नए हैं? इन्हें क्रम से देखें:',
          steps: [
            { text: 'नीचे "लॉगिन करना" सेक्शन पढ़ें।' },
            { text: '"आपकी भूमिका" अध्याय खोलें — अपना पद ढूँढें और देखें आप क्या कर सकते हैं।' },
            { text: 'अपने रोज़ के मुख्य काम का अध्याय पढ़ें (कलेक्शन, लोन, या ग्राहक)।' },
            { text: 'इस हेल्प पेज को ब्राउज़र में बुकमार्क कर लें।' },
            { text: 'अब आप तैयार हैं। अगर कुछ अजीब लगे, बटन के पास ? आइकन सही हेल्प पेज खोल देगा।' },
          ],
        },
        {
          id: 'logging-in',
          heading: 'लॉगिन करना',
          body: 'मैनेजर ने जो AS-Finance का पता दिया है, उसे ब्राउज़र में खोलें। यूज़रनेम और पासवर्ड डालें। Sign in दबाएँ।',
          tip:
            'अगर थोड़ी देर बाद स्क्रीन वापस लॉगिन पेज पर ले जाए, तो आपका सेशन खत्म हो गया है। यह सामान्य है — फिर से लॉगिन करें। सुरक्षा के लिए सेशन 15 मिनट का होता है।',
          warning: 'अपना पासवर्ड किसी से साझा न करें। भूल जाएँ तो किसी एडमिन से रीसेट करवाएँ (प्रशासन अध्याय देखें)।',
        },
        {
          id: 'dashboard',
          heading: 'डैशबोर्ड',
          body:
            'लॉगिन के बाद आप डैशबोर्ड पर पहुँचते हैं। ऊपर के बड़े आँकड़े आपकी ब्रांच की नब्ज़ हैं: कुल ग्राहक, चालू लोन, ओवरड्यू लोन, और पेंडिंग अप्रूवल। फ़ोन पर तीन बड़े बटन भी दिखते हैं — Post Collection, Find Customer, Groups — सबसे ज़्यादा होने वाले कामों के लिए।',
        },
        {
          id: 'sidebar',
          heading: 'साइडबार — चीज़ें ढूँढना',
          body:
            'कंप्यूटर पर मेनू बाईं तरफ़ है। फ़ोन पर, ऊपर बाएँ कोने का मेनू आइकन दबाएँ। आपको सिर्फ़ वही मेनू दिखेगा जिसकी अनुमति आपके रोल को है — अगर सहकर्मी की स्क्रीन अलग दिखे, यह सामान्य है।',
          tip: 'फ़ोन पर नीचे के चार बटन — Home, Collect, Groups, More — सबसे तेज़ शॉर्टकट हैं।',
        },
        {
          id: 'help-everywhere',
          heading: 'मदद हर जगह पास में है',
          body:
            'हर बार Help पर आने की ज़रूरत नहीं। ज़रूरी बटनों के पास ? आइकन देखें — Approve, Disburse, Reverse, Day-End के पास। उस पर क्लिक करते ही एक साइड पैनल में सही स्टेप खुलेगा।',
        },
        {
          id: 'change-password',
          heading: 'पासवर्ड बदलना',
          body:
            'अपनी प्रोफ़ाइल खोलें (साइडबार के नीचे अपने नाम पर क्लिक) → Change password। पुराना पासवर्ड, फिर नया पासवर्ड दो बार डालें। सेव होने पर नए पासवर्ड से दोबारा लॉगिन करना होगा।',
          warning:
            'कम-से-कम 8 अक्षर का पासवर्ड चुनें — एक बड़ा अक्षर, एक छोटा, एक नंबर। किसी और वेबसाइट का पासवर्ड यहाँ न दोहराएँ।',
        },
        {
          id: 'logging-out',
          heading: 'लॉगआउट',
          body: 'साइडबार के फ़ुटर में Sign out दबाएँ। डिवाइस किसी और को देने से पहले हमेशा लॉगआउट करें।',
        },
      ],
    },
    hinglish: {
      title: 'Shuruaat',
      intro:
        'AS-Finance aapki branch ka loan management system hai. Ye chapter aapke pehle 5 minutes ke liye hai — login, dashboard, aur system mein comfortable hona.',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'what-is-as-finance',
          heading: 'AS-Finance kya hai?',
          body:
            'Ek loan management system (LMS) jo branch staff use karta hai — customer register karna, loan dena aur track karna, collection lena, reports dekhna. Pehle jo register pe likhte the, ab ek hi jagah — search karne mein easy, auto-update, aur poori team ke saath shared.',
        },
        {
          id: 'first-time',
          heading: 'Pehli baar? 5-minute path',
          body: 'AS-Finance mein naye ho? Inhe order mein dekho:',
          steps: [
            { text: 'Niche "Login karna" section padho.' },
            { text: '"Aapka Role" chapter kholo — apna designation dhoondh kar dekho kya kar sakte ho.' },
            { text: 'Apne main daily task ka chapter padho (Collections, Loans, ya Customers).' },
            { text: 'Is Help page ko browser mein bookmark kar lo.' },
            { text: 'Bas, ready ho. Kuch ajeeb lage to button ke paas ? icon sahi help kholega.' },
          ],
        },
        {
          id: 'logging-in',
          heading: 'Login karna',
          body: 'Manager ne jo AS-Finance ka address diya hai, use browser mein kholo. Username aur password daalo. Sign in dabao.',
          tip:
            'Thodi der baad agar screen wapas login page par le jaaye, to session expire ho gaya hai. Ye normal hai — phir se login karo. Security ke liye session 15 minute ka hota hai.',
          warning:
            'Apna password kisi ke saath share mat karo. Bhool gaye to admin se reset karwa lo (Administration chapter dekho).',
        },
        {
          id: 'dashboard',
          heading: 'Dashboard',
          body:
            'Login ke baad dashboard pe pahunchte ho. Upar ke bade numbers branch ki pulse hain: total customers, active loans, overdue loans, pending approvals. Phone par teen bade buttons bhi dikhte hain — Post Collection, Find Customer, Groups — sabse common daily kaam ke liye.',
        },
        {
          id: 'sidebar',
          heading: 'Sidebar — cheezein dhundhna',
          body:
            'Computer par menu left side mein hota hai. Phone par, top-left ka menu icon tap karo. Aapko sirf wahi menu items dikhenge jinki permission aapke role ko hai — agar colleague ki screen alag dikhe, to normal hai.',
          tip: 'Phone par neeche ke 4 buttons — Home, Collect, Groups, More — sabse fast shortcuts hain.',
        },
        {
          id: 'help-everywhere',
          heading: 'Help har jagah paas hai',
          body:
            'Har baar Help section pe aane ki zaroorat nahi. Zaroori buttons ke paas ? icon dekho — Approve, Disburse, Reverse, Day-End ke paas. Click karte hi ek side-panel mein sahi step khulega.',
        },
        {
          id: 'change-password',
          heading: 'Password badalna',
          body:
            'Apni profile kholo (sidebar ke neeche apne name par click) → Change password. Purana password, phir naya do baar daalo. Save hone par naye password se dobara login karna hoga.',
          warning:
            'Kam se kam 8 characters ka password chuno — ek capital, ek small, ek number. Kisi aur website ka password yahan repeat mat karo.',
        },
        {
          id: 'logging-out',
          heading: 'Logout',
          body: 'Sidebar ke footer mein Sign out dabao. Device kisi aur ko dene se pehle hamesha logout karo.',
        },
      ],
    },
  },
};
