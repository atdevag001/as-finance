import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const roles: ChapterContent = {
  id: 'roles',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    manager: {
      src: '/help/screenshots/roles/sidebar-manager.png',
      alt: 'Sidebar as a Branch Manager sees it: every menu item from Customers through Help is visible',
      caption: "A Branch Manager's sidebar — full access.",
    },
    'field-officer': {
      src: '/help/screenshots/roles/sidebar-field-officer.png',
      alt: 'Sidebar as a Field Officer sees it: Customers, Loans, Loan Products, Collections, Receipts, Groups, Reports, Help — no Accounting, Cashbook, Users, Settings, or Audit Logs',
      caption: "A Field Officer's sidebar — narrower than the Manager's. If yours looks like this, that's normal.",
    },
    accountant: {
      src: '/help/screenshots/roles/sidebar-accountant.png',
      alt: 'Sidebar as an Accountant sees it: includes Accounting, Cashbook, Reports, Help — but no Users, Settings, Audit Logs, or Notifications',
      caption: "An Accountant's sidebar — full access to the books, none to user management.",
    },
  },
  langs: {
    en: {
      title: 'Your Role — What can I do?',
      intro:
        'AS-Finance has seven kinds of staff accounts. Find yours below — and read the three concepts at the bottom (Maker-checker, Audit trail, Aadhaar privacy). They apply to everyone.',
      sections: [
        {
          id: 'owner',
          heading: 'Owner / Super Admin',
          body:
            'The widest access. You can create users, define loan products, edit settings (holidays, organization details), see audit logs, and approve anything. With great power comes a habit of slow, careful clicks.',
        },
        {
          id: 'manager',
          heading: 'Branch Manager',
          body:
            'You run the branch day-to-day. Approve and disburse loans, manage staff, handle reversals, verify cash handovers from collectors, see reports and audit logs. You cannot edit loan products or change global settings — that’s the Owner.',
        },
        {
          id: 'field-officer',
          heading: 'Field Officer',
          body:
            'You bring in customers and create loan applications. You can see and edit only the customers and loans assigned to you. You cannot approve loans, disburse funds, or collect payments yourself — those go to the Manager and Collection Officer.',
        },
        {
          id: 'collection-officer',
          heading: 'Collection Officer',
          body:
            'You collect EMIs from customers and hand cash over to the branch at end of day. You can post collections, print receipts, and create cash handovers. You cannot register new customers or approve loans.',
        },
        {
          id: 'accountant',
          heading: 'Accountant',
          body:
            'You run the books. Manage the cashbook, record expenses, verify cash handovers, run all accounting reports (trial balance, P&L, balance sheet). You don’t create or approve loans, and you don’t collect from customers.',
        },
        {
          id: 'office-staff',
          heading: 'Office Staff',
          body:
            'You support the team — register customers, prepare loan applications, upload documents. You can submit a loan for review but not approve or disburse it.',
        },
        {
          id: 'auditor',
          heading: 'Auditor (read-only)',
          body:
            'You can see everything but change nothing. Useful for compliance and external reviews. All your viewing is invisible to other users — the system doesn’t flag who looked at what for read access.',
        },
        {
          id: 'maker-checker',
          heading: 'Maker-checker — why two people are needed',
          body:
            'For every risky action (approving a loan, disbursing money, foreclosing a loan), the person who initiated the action is NOT allowed to approve it. A second person — usually the manager — has to click Approve. This is a banking safety rule: no single person can both create and confirm a transaction.',
          tip:
            'If you see Approve greyed out with the tooltip "you cannot approve your own action", that’s maker-checker doing its job. Ask a colleague (with the right role) to approve.',
        },
        {
          id: 'audit-trail',
          heading: 'What the system records about your work',
          body:
            'The system keeps a clean record of important actions — when you log in, approve a loan, disburse, reverse a collection, blacklist a customer. This is not surveillance: it’s the same notebook your branch used to keep, just digital and tamper-proof. If something is ever questioned, the audit log shows exactly what happened, when, and by whom.',
        },
        {
          id: 'aadhaar-privacy',
          heading: 'Aadhaar and PAN — how we handle privacy',
          body:
            'Aadhaar numbers are stored masked in lists (you see only XXXX XXXX 1234). The full number is visible only on the customer detail page, and only to roles that need it for KYC verification. AS-Finance never shares Aadhaar or PAN with third parties, and the system logs anyone who views the full number.',
        },
      ],
    },
    hi: {
      title: 'आपकी भूमिका — मैं क्या कर सकता हूँ?',
      intro:
        'AS-Finance में सात तरह के स्टाफ़ अकाउंट हैं। नीचे अपना ढूँढें — और अंत में तीन ज़रूरी बातें (मेकर-चेकर, ऑडिट ट्रेल, आधार प्राइवेसी) ज़रूर पढ़ें। यह सबके लिए हैं।',
      sections: [
        {
          id: 'owner',
          heading: 'मालिक / सुपर एडमिन',
          body:
            'सबसे ज़्यादा अधिकार। आप यूज़र बना सकते हैं, लोन प्रोडक्ट तय कर सकते हैं, सेटिंग बदल सकते हैं (छुट्टियाँ, संस्था विवरण), ऑडिट लॉग देख सकते हैं, और कुछ भी अप्रूव कर सकते हैं। ज़िम्मेदारी बड़ी है — हर क्लिक सोच-समझकर।',
        },
        {
          id: 'manager',
          heading: 'ब्रांच मैनेजर',
          body:
            'आप रोज़मर्रा की ब्रांच चलाते हैं। लोन अप्रूव और वितरण करते हैं, स्टाफ़ संभालते हैं, रिवर्सल देखते हैं, कलेक्टर से कैश हैंडओवर वेरिफ़ाई करते हैं, रिपोर्ट और ऑडिट लॉग देखते हैं। लोन प्रोडक्ट और ग्लोबल सेटिंग्स में बदलाव मालिक का काम है।',
        },
        {
          id: 'field-officer',
          heading: 'फील्ड ऑफिसर',
          body:
            'आप ग्राहक लाते हैं और लोन आवेदन बनाते हैं। आप सिर्फ़ अपने को असाइन हुए ग्राहक और लोन देख-संपादित कर सकते हैं। लोन अप्रूव या वितरण आपका काम नहीं — वो मैनेजर और कलेक्शन ऑफिसर का है।',
        },
        {
          id: 'collection-officer',
          heading: 'कलेक्शन ऑफिसर',
          body:
            'आप ग्राहकों से EMI लेते हैं और दिन के अंत में कैश ब्रांच को सौंपते हैं। कलेक्शन दर्ज, रसीद प्रिंट, और कैश हैंडओवर बना सकते हैं। नए ग्राहक रजिस्टर या लोन अप्रूव नहीं कर सकते।',
        },
        {
          id: 'accountant',
          heading: 'अकाउंटेंट',
          body:
            'आप किताबें संभालते हैं। कैशबुक मैनेज, खर्च दर्ज, कैश हैंडओवर वेरिफ़ाई, सभी अकाउंटिंग रिपोर्ट (ट्रायल बैलेंस, P&L, बैलेंस शीट) देखते हैं। लोन बनाना/अप्रूव करना या कलेक्शन लेना आपका काम नहीं।',
        },
        {
          id: 'office-staff',
          heading: 'ऑफिस स्टाफ़',
          body:
            'आप टीम को सहयोग देते हैं — ग्राहक रजिस्टर, लोन आवेदन तैयार, दस्तावेज़ अपलोड। लोन समीक्षा के लिए सबमिट कर सकते हैं, पर अप्रूव/वितरण नहीं।',
        },
        {
          id: 'auditor',
          heading: 'ऑडिटर (केवल देखने का अधिकार)',
          body:
            'आप सब देख सकते हैं पर कुछ बदल नहीं सकते। कंप्लायंस और बाहरी समीक्षा के लिए। आपका देखना दूसरों को नहीं दिखता — सिस्टम रीड एक्सेस को हाइलाइट नहीं करता।',
        },
        {
          id: 'maker-checker',
          heading: 'मेकर-चेकर — दो लोगों की ज़रूरत क्यों',
          body:
            'हर ज़रूरी काम (लोन अप्रूव, पैसा वितरण, फोरक्लोज़र) के लिए — जिसने काम शुरू किया वही अप्रूव नहीं कर सकता। दूसरा व्यक्ति (आमतौर पर मैनेजर) Approve दबाता है। यह बैंकिंग सुरक्षा नियम है: एक ही व्यक्ति लेन-देन बनाए और कन्फ़र्म दोनों नहीं कर सकता।',
          tip:
            'अगर Approve बटन डिसएबल दिखे और "आप अपना ही काम अप्रूव नहीं कर सकते" लिखा हो — यह मेकर-चेकर का काम है। सही रोल वाले सहकर्मी से अप्रूव करवाएँ।',
        },
        {
          id: 'audit-trail',
          heading: 'सिस्टम आपके काम का क्या रिकॉर्ड रखता है',
          body:
            'सिस्टम ज़रूरी कामों का साफ़ रिकॉर्ड रखता है — कब लॉगिन हुए, लोन अप्रूव किया, वितरण किया, कलेक्शन रिवर्स किया, ग्राहक ब्लैकलिस्ट किया। यह निगरानी नहीं है — यह वही रजिस्टर है जो ब्रांच पहले रखती थी, बस अब डिजिटल और न मिटाने वाला। अगर कभी सवाल उठे, ऑडिट लॉग बताता है क्या हुआ, कब हुआ, और किसने किया।',
        },
        {
          id: 'aadhaar-privacy',
          heading: 'आधार और PAN — निजता कैसे रखते हैं',
          body:
            'लिस्ट में आधार नंबर छुपाकर दिखता है (सिर्फ़ XXXX XXXX 1234)। पूरा नंबर सिर्फ़ ग्राहक डिटेल पेज पर है, और उन्हीं रोल को दिखता है जिन्हें KYC के लिए चाहिए। AS-Finance आधार/PAN कभी किसी तीसरे को नहीं देता, और पूरा नंबर देखने वाले का रिकॉर्ड भी रखता है।',
        },
      ],
    },
    hinglish: {
      title: 'Aapka Role — Main kya kar sakta/sakti hoon?',
      intro:
        'AS-Finance mein saat tarah ke staff accounts hain. Niche apna dhundh lo — aur end mein teen zaroori cheezein (Maker-checker, Audit trail, Aadhaar privacy) zaroor padho. Ye sab par lagti hain.',
      sections: [
        {
          id: 'owner',
          heading: 'Owner / Super Admin',
          body:
            'Sabse zyada access. Aap users bana sakte ho, loan products define kar sakte ho, settings (holidays, organization details) badal sakte ho, audit logs dekh sakte ho, aur kuch bhi approve. Power ke saath dhyaan zaroori — har click soch-samajh ke.',
        },
        {
          id: 'manager',
          heading: 'Branch Manager',
          body:
            'Aap daily branch chalate ho. Loans approve aur disburse karte ho, staff sambhalte ho, reversals dekhte ho, collectors se cash handover verify karte ho, reports aur audit logs dekhte ho. Loan products aur global settings badalna Owner ka kaam hai.',
        },
        {
          id: 'field-officer',
          heading: 'Field Officer',
          body:
            'Aap customers laate ho aur loan applications banate ho. Sirf wahi customers aur loans dekh/edit kar sakte ho jo aapko assigned hain. Loan approve ya disburse aapka kaam nahi — wo Manager aur Collection Officer ke paas hai.',
        },
        {
          id: 'collection-officer',
          heading: 'Collection Officer',
          body:
            'Aap customers se EMI lete ho aur din ke end mein cash branch ko handover karte ho. Collections post kar sakte ho, receipts print, aur cash handovers create. Naye customers register ya loan approve nahi kar sakte.',
        },
        {
          id: 'accountant',
          heading: 'Accountant',
          body:
            'Aap kitaabein sambhalte ho. Cashbook manage, expenses record, cash handovers verify, saari accounting reports (Trial Balance, P&L, Balance Sheet) dekhte ho. Loan banana/approve ya collection lena aapka kaam nahi.',
        },
        {
          id: 'office-staff',
          heading: 'Office Staff',
          body:
            'Aap team ko support karte ho — customer register, loan application taiyaar, documents upload. Loan review ke liye submit kar sakte ho, par approve/disburse nahi.',
        },
        {
          id: 'auditor',
          heading: 'Auditor (sirf dekhne ka access)',
          body:
            'Aap sab dekh sakte ho par kuch bhi badal nahi sakte. Compliance aur external review ke liye. Aapka dekhna doosron ko nahi dikhta — system read access ko highlight nahi karta.',
        },
        {
          id: 'maker-checker',
          heading: 'Maker-checker — do log kyun chahiye',
          body:
            'Har risky action (loan approve, paisa disburse, foreclosure) ke liye — jisne kaam shuru kiya wahi approve nahi kar sakta. Doosra banda (usually manager) Approve dabata hai. Ye banking safety rule hai: ek hi banda transaction create aur confirm dono nahi kar sakta.',
          tip:
            'Agar Approve button disabled dikhe aur tooltip mein "you cannot approve your own action" likha ho — ye maker-checker ka kaam hai. Sahi role wale colleague se approve karwao.',
        },
        {
          id: 'audit-trail',
          heading: 'System aapke kaam ka kya record rakhta hai',
          body:
            'System zaroori kaamon ka clean record rakhta hai — kab login kiya, loan approve kiya, disburse kiya, collection reverse kiya, customer blacklist kiya. Ye surveillance nahi hai — ye wahi register hai jo branch pehle rakhti thi, ab digital aur tamper-proof. Agar kabhi sawaal uthe, audit log batata hai kya hua, kab hua, aur kisne kiya.',
        },
        {
          id: 'aadhaar-privacy',
          heading: 'Aadhaar aur PAN — privacy kaise rakhte hain',
          body:
            'List mein Aadhaar number masked dikhta hai (sirf XXXX XXXX 1234). Pura number sirf customer detail page par hai, aur unhi roles ko dikhta hai jinhe KYC ke liye chahiye. AS-Finance Aadhaar/PAN kabhi kisi teesre ko nahi deta, aur jo pura number dekhe uska bhi record rakhta hai.',
        },
      ],
    },
  },
};
