import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const loanProducts: ChapterContent = {
  id: 'loan-products',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    'what-is-a-product': {
      src: '/help/screenshots/loan-products/loan-products-list.png',
      alt: 'The Loan Products list showing columns for Name, Interest Type, Rate, Periodic Rate, Frequency, Principal Range, Status, with Edit and Deactivate buttons per row. Both Active and Inactive products are shown.',
      caption: 'The Loan Products list. Active products appear in the Loans → New dropdown; Inactive ones do not, but their existing loans keep running.',
    },
    create: {
      src: '/help/screenshots/loan-products/loan-product-new.png',
      alt: 'The Create Loan Product form with fields for Name, Interest Type (Flat or Reducing), Annual interest rate in basis points, Min and Max principal, Min and Max tenure, Frequency',
      caption: 'New product form. Bounds you set here become hard limits when a Field Officer creates a loan.',
    },
  },
  langs: {
    en: {
      title: 'Loan Products',
      intro:
        'A loan product is a template — interest type, rate, allowed principal range, allowed tenure. Every loan a Field Officer creates picks one. Get the products right and the loans take care of themselves.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER],
      sections: [
        {
          id: 'what-is-a-product',
          heading: 'What is a loan product?',
          body:
            'Think of it as a menu item. "Group Loan 24%, 12 months, ₹5,000 to ₹50,000" is one product; "Individual Business Loan 30%, 6 months, ₹10,000 to ₹100,000" is another. The Field Officer picks a product when creating a loan — they cannot type a rate or change interest type at loan time. That keeps every loan compliant with the branch\'s offering.',
        },
        {
          id: 'create',
          heading: 'Creating a loan product',
          body: 'Only Super Admin can add a new product. Sidebar → Loan Products → New Loan Product.',
          steps: [
            { text: 'Name — short and descriptive, e.g. "Group Loan 24% / 12mo".' },
            { text: 'Interest type — Flat or Reducing. (See the Glossary for the difference.)' },
            { text: 'Annual interest rate (basis points) — 2400 means 24% per year. The form usually shows a % helper.' },
            { text: 'Min and max principal (₹) — the smallest and largest loan amount allowed.' },
            { text: 'Min and max tenure (months) — the shortest and longest repayment period.' },
            { text: 'Repayment frequency — monthly is standard; some products run weekly or fortnightly.' },
            { text: 'Save. The product is now Active and visible in the loan-creation dropdown.' },
          ],
          warning:
            'The interest rate must fall within the global min/max set in Settings (default 1%–360%). If you try a rate outside that, the form rejects it. Talk to the Owner if you genuinely need to extend the global range.',
        },
        {
          id: 'flat-vs-reducing',
          heading: 'Flat vs Reducing — which to choose?',
          body:
            'Same nominal rate, very different effective cost to the borrower. Reducing calculates interest on the outstanding balance each month, so the interest portion shrinks as the loan is paid down. Flat charges the full annual interest on the original principal for the entire tenure.',
          example: {
            title: 'Comparing both on a ₹10,000 / 12-month / 24% loan',
            body:
              'Reducing: monthly EMI ≈ ₹944, total interest ≈ ₹1,328\nFlat: monthly EMI ≈ ₹1,033, total interest = ₹2,400\n\nBoth are legal. Flat is simpler to explain; Reducing is fairer to the borrower. Most regulated microfinance lenders use Reducing.',
          },
        },
        {
          id: 'edit-deactivate',
          heading: 'Editing or deactivating a product',
          body:
            'Open Loan Products → click the product → Edit. You can update display name, principal/tenure bounds, or the rate.',
          warning:
            'Editing a product affects FUTURE loans only. EMI schedules already generated do not change retroactively. If you cut a rate from 24% to 18%, existing borrowers stay at 24% until their loans close.',
          tip:
            'Deactivating hides the product from the loan-creation dropdown but keeps its existing loans active. Use Deactivate when you stop selling a product but still service old loans on it.',
        },
        {
          id: 'common-errors',
          heading: 'Common errors',
          body:
            '• "Rate out of range" — your rate is outside the global bounds. Edit Settings, or pick another rate.\n• "Min must be less than max" — principal or tenure bounds are inverted.\n• "Product cannot be deleted with active loans" — deactivate it instead.',
        },
      ],
    },
    hi: {
      title: 'लोन प्रोडक्ट्स',
      intro:
        'लोन प्रोडक्ट एक टेम्पलेट है — ब्याज प्रकार, दर, स्वीकृत मूलधन रेंज, अवधि। फील्ड ऑफिसर हर लोन के लिए कोई प्रोडक्ट चुनता है। प्रोडक्ट सही हों, तो लोन अपने आप साफ़ रहते हैं।',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER],
      sections: [
        {
          id: 'what-is-a-product',
          heading: 'लोन प्रोडक्ट क्या है?',
          body:
            'मेनू-आइटम समझिए। "Group Loan 24%, 12 महीने, ₹5,000–₹50,000" एक प्रोडक्ट है; "Individual Business Loan 30%, 6 महीने, ₹10,000–₹100,000" दूसरा। लोन बनाते समय फील्ड ऑफिसर प्रोडक्ट चुनता है — दर या ब्याज प्रकार नहीं बदल सकता। इससे हर लोन ब्रांच की पेशकश में रहता है।',
        },
        {
          id: 'create',
          heading: 'नया प्रोडक्ट बनाना',
          body: 'सिर्फ़ सुपर एडमिन। साइडबार → Loan Products → New Loan Product।',
          steps: [
            { text: 'नाम — छोटा और स्पष्ट, जैसे "Group Loan 24% / 12mo"।' },
            { text: 'ब्याज प्रकार — Flat या Reducing। (अंतर ग्लॉसरी में देखें।)' },
            { text: 'वार्षिक ब्याज दर (basis points) — 2400 = 24%/वर्ष। फ़ॉर्म % दिखाता है।' },
            { text: 'मूलधन की न्यूनतम और अधिकतम राशि (₹)।' },
            { text: 'अवधि की न्यूनतम और अधिकतम (महीने)।' },
            { text: 'भुगतान आवृत्ति — आमतौर पर मासिक; कुछ प्रोडक्ट साप्ताहिक/पाक्षिक होते हैं।' },
            { text: 'सेव करें। प्रोडक्ट अब सक्रिय है और लोन ड्रॉपडाउन में दिखेगा।' },
          ],
          warning:
            'दर सेटिंग्स की वैश्विक न्यूनतम/अधिकतम (डिफ़ॉल्ट 1%–360%) के बीच होनी चाहिए। बाहर हो तो फ़ॉर्म नहीं लेगा — मालिक से वैश्विक सीमा बढ़वाएँ।',
        },
        {
          id: 'flat-vs-reducing',
          heading: 'Flat या Reducing — क्या चुनें?',
          body:
            'दर समान दिखे, पर ग्राहक के लिए लागत बहुत अलग। Reducing हर महीने बचे मूलधन पर ब्याज लेता है — EMI भरते-भरते ब्याज घटता है। Flat पूरी अवधि के लिए मूल मूलधन पर पूरा ब्याज लेता है।',
          example: {
            title: '₹10,000 / 12 महीने / 24% पर तुलना',
            body:
              'Reducing: मासिक EMI ≈ ₹944, कुल ब्याज ≈ ₹1,328\nFlat: मासिक EMI ≈ ₹1,033, कुल ब्याज = ₹2,400\n\nदोनों वैध हैं। Flat समझाना आसान; Reducing ग्राहक के लिए सही। ज़्यादातर विनियमित माइक्रोफ़ाइनेंस Reducing इस्तेमाल करते हैं।',
          },
        },
        {
          id: 'edit-deactivate',
          heading: 'प्रोडक्ट संपादन या निष्क्रिय करना',
          body:
            'Loan Products → प्रोडक्ट पर क्लिक → Edit। नाम, बाउंड्स, दर अपडेट कर सकते हैं।',
          warning:
            'संपादन सिर्फ़ भविष्य के लोन पर लागू होता है। पहले बनी EMI शेड्यूल पीछे जाकर नहीं बदलती। 24% से 18% कर दें — चालू ग्राहक 24% पर ही रहेंगे जब तक लोन बंद नहीं होते।',
          tip: 'निष्क्रिय करने पर प्रोडक्ट लोन ड्रॉपडाउन में नहीं दिखेगा, मगर मौजूदा लोन चलते रहेंगे। नए विक्रय बंद करने पर इस्तेमाल करें।',
        },
        {
          id: 'common-errors',
          heading: 'आम गलतियाँ',
          body:
            '• "Rate out of range" — वैश्विक सीमा के बाहर है। सेटिंग्स बदलें या दूसरी दर चुनें।\n• "Min must be less than max" — बाउंड्स उल्टे हैं।\n• "Product cannot be deleted with active loans" — हटाने की जगह निष्क्रिय करें।',
        },
      ],
    },
    hinglish: {
      title: 'Loan Products',
      intro:
        'Loan product ek template hai — interest type, rate, allowed principal range, tenure. Field Officer har loan ke liye koi product chunta hai. Products sahi rakho — loans apne aap clean rehte hain.',
      whoCanDoThis: [UserRole.SUPER_ADMIN, UserRole.MANAGER],
      sections: [
        {
          id: 'what-is-a-product',
          heading: 'Loan product kya hai?',
          body:
            'Menu-item samjho. "Group Loan 24%, 12 months, ₹5,000–₹50,000" ek product hai; "Individual Business Loan 30%, 6 months, ₹10,000–₹100,000" doosra. Loan banate time Field Officer product chunta hai — rate ya interest type badal nahi sakta. Isse har loan branch ki offering mein rehta hai.',
        },
        {
          id: 'create',
          heading: 'Naya product banana',
          body: 'Sirf Super Admin. Sidebar → Loan Products → New Loan Product.',
          steps: [
            { text: 'Naam — chhota aur clear, jaise "Group Loan 24% / 12mo".' },
            { text: 'Interest type — Flat ya Reducing. (Difference glossary mein hai.)' },
            { text: 'Annual interest rate (basis points) — 2400 = 24%/year. Form % helper dikhata hai.' },
            { text: 'Principal ka min aur max (₹).' },
            { text: 'Tenure ka min aur max (months).' },
            { text: 'Repayment frequency — usually monthly; kuch products weekly/fortnightly.' },
            { text: 'Save. Product ab active hai aur loan dropdown mein dikhega.' },
          ],
          warning:
            'Rate Settings ke global min/max (default 1%–360%) ke beech honi chahiye. Bahar ho to form reject karega — Owner se global range badhwao.',
        },
        {
          id: 'flat-vs-reducing',
          heading: 'Flat ya Reducing — kya chuno?',
          body:
            'Rate same dikhe, par customer ke liye cost bahut alag. Reducing har mahine outstanding par interest leta hai — EMI bharte-bharte interest ghatata hai. Flat poori tenure original principal par poora interest leta hai.',
          example: {
            title: '₹10,000 / 12 mo / 24% par comparison',
            body:
              'Reducing: monthly EMI ≈ ₹944, total interest ≈ ₹1,328\nFlat: monthly EMI ≈ ₹1,033, total interest = ₹2,400\n\nDono valid hain. Flat samjhana easy; Reducing customer ke liye fair. Zyadatar regulated microfinance Reducing use karte hain.',
          },
        },
        {
          id: 'edit-deactivate',
          heading: 'Product edit ya deactivate',
          body: 'Loan Products → product par click → Edit. Naam, bounds, rate update kar sakte ho.',
          warning:
            'Edit sirf future loans par lagta hai. Pehle bani EMI schedules peeche jakar nahi badaltin. 24% se 18% kar do — current borrowers 24% par hi rahenge jab tak loan close nahi hote.',
          tip: 'Deactivate karne par product loan dropdown mein nahi dikhega, par existing loans chalte rahenge. Naye sales band karne par use karo.',
        },
        {
          id: 'common-errors',
          heading: 'Common errors',
          body:
            '• "Rate out of range" — global bounds ke bahar. Settings badlo ya doosri rate chuno.\n• "Min must be less than max" — bounds ulte hain.\n• "Product cannot be deleted with active loans" — delete ki jagah deactivate karo.',
        },
      ],
    },
  },
};
