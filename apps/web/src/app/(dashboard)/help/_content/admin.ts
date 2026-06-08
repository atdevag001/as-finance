import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const admin: ChapterContent = {
  id: 'admin',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    'create-user': {
      src: '/help/screenshots/admin/users-list.png',
      alt: 'The Users list showing each staff member with their name, mobile, role, and status badge, plus a "New User" button',
      caption: 'The Users list. Click a user to edit them, or "New User" to add staff.',
    },
    holidays: {
      src: '/help/screenshots/admin/settings.png',
      alt: 'Settings page with System Settings (interest rate bounds, group size, penalty grace days) at the top and a Holiday Calendar table at the bottom',
      caption: 'The Settings page. Holidays are at the bottom — each row is a date the branch is closed.',
    },
    'audit-log': {
      src: '/help/screenshots/admin/audit-log.png',
      alt: 'The Audit Log viewer with filters for actor, target entity, action type, and date range, showing rows of recorded actions',
      caption: 'The audit log records who did what, and when. Filter to investigate a specific incident.',
    },
  },
  langs: {
    en: {
      title: 'Administration',
      intro:
        'For Managers and Owners — creating staff accounts, configuring holidays, and reading the audit log.',
      whoCanDoThis: [UserRole.MANAGER, UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'create-user',
          heading: 'Creating a new staff user',
          body:
            'Sidebar → Users → New. Enter username (3-50 characters, unique), full name, mobile, optional email, and a starting password. Pick a role — see the Roles chapter for what each role can do. Save.',
          tip:
            'Send the username and starting password to the new joiner over a secure channel — never write it down in a shared group. Ask them to change the password on first login.',
        },
        {
          id: 'edit-user',
          heading: 'Editing or deactivating',
          body:
            'Open Users, click a user, and Edit. You can update their name, mobile, email, and role. To stop someone from logging in (left the branch, on leave), deactivate the account instead of deleting — this keeps their past actions traceable in the audit log.',
        },
        {
          id: 'reset-password',
          heading: 'Resetting someone’s password',
          body:
            'On the user edit screen, click Reset Password. Set a new temporary password and share it with them securely. They will be asked to change it on their next login.',
        },
        {
          id: 'holidays',
          heading: 'Configuring holidays',
          body:
            'Sidebar → Settings. The Holidays section lists every date the branch is closed. Add a date — and any EMI that would have fallen on that date is automatically shifted to the next working day. Remove a date if it was added by mistake; existing schedules already calculated will not retroactively change.',
        },
        {
          id: 'audit-log',
          heading: 'Reading the audit log',
          body:
            'Sidebar → Audit Logs. Every important action — login, loan approve, collection, reversal, blacklist — is here with a timestamp, the actor, and what changed. Filter by actor, target entity, action type, and date range when you’re investigating something specific.',
        },
      ],
    },
    hi: {
      title: 'प्रशासन',
      intro: 'मैनेजर और मालिक के लिए — स्टाफ़ अकाउंट बनाना, छुट्टियाँ तय करना, और ऑडिट लॉग पढ़ना।',
      whoCanDoThis: [UserRole.MANAGER, UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'create-user',
          heading: 'नया स्टाफ़ यूज़र बनाना',
          body:
            'साइडबार → Users → New। यूज़रनेम (3–50 अक्षर, अनूठा), पूरा नाम, मोबाइल, ईमेल (वैकल्पिक), और शुरुआती पासवर्ड भरें। रोल चुनें — "आपकी भूमिका" अध्याय में हर रोल का काम है। सेव करें।',
          tip:
            'नए सदस्य को यूज़रनेम और पासवर्ड सुरक्षित तरीके से भेजें — साझा ग्रुप में न लिखें। पहले लॉगिन पर पासवर्ड बदलने को कहें।',
        },
        {
          id: 'edit-user',
          heading: 'संपादन या निष्क्रिय करना',
          body:
            'Users खोलें, यूज़र पर क्लिक, Edit। नाम, मोबाइल, ईमेल, रोल अपडेट कर सकते हैं। किसी को लॉगिन से रोकना हो (ब्रांच छोड़ी, छुट्टी पर) — हटाने की जगह निष्क्रिय करें — पुराने काम ऑडिट लॉग में दिखते रहेंगे।',
        },
        {
          id: 'reset-password',
          heading: 'किसी का पासवर्ड रीसेट',
          body:
            'यूज़र एडिट स्क्रीन पर Reset Password दबाएँ। नया अस्थायी पासवर्ड तय करें और सुरक्षित तरीके से साझा करें। अगले लॉगिन पर बदलने को कहा जाएगा।',
        },
        {
          id: 'holidays',
          heading: 'छुट्टियाँ तय करना',
          body:
            'साइडबार → Settings। Holidays सेक्शन में हर बंद की तारीख है। तारीख जोड़ें — और उस दिन की EMI अगले कार्य दिवस पर खिसक जाती है। ग़लती से जुड़ी हटा सकते हैं; पहले बनी हुई शेड्यूल पीछे जाकर नहीं बदलती।',
        },
        {
          id: 'audit-log',
          heading: 'ऑडिट लॉग पढ़ना',
          body:
            'साइडबार → Audit Logs। हर ज़रूरी कार्य — लॉगिन, लोन अप्रूव, कलेक्शन, रिवर्सल, ब्लैकलिस्ट — समय, करने वाले और बदलाव के साथ यहाँ है। ख़ास जाँच के लिए ऐक्टर, टार्गेट, ऐक्शन और तारीख से फ़िल्टर करें।',
        },
      ],
    },
    hinglish: {
      title: 'Administration',
      intro: 'Managers aur Owners ke liye — staff accounts banana, holidays configure karna, aur audit log padhna.',
      whoCanDoThis: [UserRole.MANAGER, UserRole.SUPER_ADMIN],
      sections: [
        {
          id: 'create-user',
          heading: 'Naya staff user banana',
          body:
            'Sidebar → Users → New. Username (3–50 chars, unique), full name, mobile, email (optional), aur starting password bharo. Role chuno — "Aapka Role" chapter mein har role ka kaam likha hai. Save.',
          tip:
            'Naye joiner ko username aur password secure tareeke se bhejo — shared group mein mat likho. Pehli login par password change karne ko kaho.',
        },
        {
          id: 'edit-user',
          heading: 'Edit ya deactivate',
          body:
            'Users kholo, user par click, Edit. Name, mobile, email, role update kar sakte ho. Kisi ko login se rokna ho (branch chhod gaya, leave par) — delete ki jagah deactivate karo — purane kaam audit log mein dikhte rahenge.',
        },
        {
          id: 'reset-password',
          heading: 'Kisi ka password reset',
          body:
            'User edit screen par Reset Password dabao. Naya temporary password set karo aur securely share karo. Agle login par change karne ko kaha jaayega.',
        },
        {
          id: 'holidays',
          heading: 'Holidays configure karna',
          body:
            'Sidebar → Settings. Holidays section mein har band date hai. Date add karo — us din ki EMI agle working day par shift ho jaati hai. Galti se added date hatao; pehle se bani schedules peeche jaakar nahi badaltin.',
        },
        {
          id: 'audit-log',
          heading: 'Audit log padhna',
          body:
            'Sidebar → Audit Logs. Har zaroori action — login, loan approve, collection, reversal, blacklist — timestamp, actor, aur change ke saath yahan hai. Specific investigation ke liye actor, target, action aur date se filter karo.',
        },
      ],
    },
  },
};
