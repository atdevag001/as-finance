import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const customers: ChapterContent = {
  id: 'customers',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    create: {
      src: '/help/screenshots/customers/customer-new.png',
      alt: 'The Register Customer form with fields for Full Name, Mobile, Aadhaar, Father/Husband Name, PAN, DOB, Gender, Occupation, Work/Business details, and Monthly Income',
      caption: 'The new-customer form. Fields marked with * are required.',
    },
    find: {
      src: '/help/screenshots/customers/customers-list.png',
      alt: 'The Customers list showing names, mobile numbers, and status badges, with a search box at the top',
    },
  },
  langs: {
    en: {
      title: 'Customers',
      intro:
        'Everything starts with a customer record. This chapter covers adding a new customer, finding existing ones, uploading documents, and what to do when the system warns about a duplicate.',
      whoCanDoThis: [
        UserRole.FIELD_OFFICER,
        UserRole.OFFICE_STAFF,
        UserRole.MANAGER,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'create',
          heading: 'Adding a new customer',
          body:
            'From Customers → New, fill in full name, mobile, Aadhaar, gender, address, and occupation. Date of birth auto-calculates the age. PAN is optional unless the customer wants a loan above the PAN-required threshold (your manager will tell you the current limit).',
          tip:
            'Aadhaar and mobile are checked for duplicates as you type. If the system finds a match, it warns you before submission — read the next section.',
        },
        {
          id: 'duplicate-warning',
          heading: 'When the system warns "duplicate Aadhaar"',
          body:
            'If the Aadhaar or mobile you entered already exists in the system, you’ll see a dialog showing the existing customer. This protects against double-registration.',
          steps: [
            { text: 'Click View existing customer to open their profile.' },
            { text: 'If it’s genuinely the same person, work with the existing record — do not create a duplicate.' },
            { text: 'If it’s a different person with the same Aadhaar (rare — usually a typo), recheck the number with the customer.' },
            { text: 'If you’re sure it’s a separate person, click Continue with new — the manager will review.' },
          ],
        },
        {
          id: 'find',
          heading: 'Finding a customer',
          body:
            'On the Customers list, type a name or mobile number — the list filters as you type. You can also filter by status (Active, Blacklisted). The list shows phone numbers on mobile that are tappable to call directly.',
        },
        {
          id: 'documents',
          heading: 'Uploading KYC documents',
          body:
            'Open a customer’s profile and click Upload Document. Pick the type (photo, Aadhaar, PAN, address proof, signature) and choose a file. Each document is stored against the customer and visible to staff with KYC access.',
          warning:
            'Don’t upload photos of Aadhaar cards taken in shared WhatsApp groups. Use the camera in the AS-Finance app or upload directly from the customer’s file.',
        },
        {
          id: 'blacklist',
          heading: 'Blacklist and reinstate',
          body:
            'If a customer repeatedly defaults or commits fraud, a Manager can blacklist them — they cannot take new loans until reinstated. Open the profile, click Blacklist, enter a reason. To reinstate, click Reinstate from the same screen.',
          reassure:
            'Blacklisting is reversible. If the customer’s situation changes (the dispute was resolved, money was paid), reinstating them is the right move — there is no permanent mark.',
        },
        {
          id: 'family-and-guarantors',
          heading: 'Family members and guarantors',
          body:
            'From the customer profile, add family members (helpful for joint loans) and guarantors (people who promise to pay if the borrower can’t). These show up later on the loan application screen.',
        },
      ],
    },
    hi: {
      title: 'ग्राहक',
      intro:
        'सब कुछ ग्राहक के रिकॉर्ड से शुरू होता है। यह अध्याय बताता है — नया ग्राहक जोड़ना, मौजूदा को ढूँढना, दस्तावेज़ अपलोड, और डुप्लिकेट चेतावनी पर क्या करें।',
      whoCanDoThis: [
        UserRole.FIELD_OFFICER,
        UserRole.OFFICE_STAFF,
        UserRole.MANAGER,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'create',
          heading: 'नया ग्राहक जोड़ना',
          body:
            'Customers → New से पूरा नाम, मोबाइल, आधार, लिंग, पता, और काम भरें। जन्म तिथि से उम्र अपने आप गणना होती है। PAN तभी ज़रूरी जब लोन निश्चित सीमा से ऊपर हो (मैनेजर वर्तमान सीमा बताएगा)।',
          tip: 'टाइप करते ही आधार और मोबाइल पर डुप्लिकेट की जाँच होती है। मेल मिले तो सबमिशन से पहले चेतावनी मिलेगी — अगला सेक्शन देखें।',
        },
        {
          id: 'duplicate-warning',
          heading: '"डुप्लिकेट आधार" चेतावनी पर',
          body:
            'अगर डाला हुआ आधार या मोबाइल पहले से सिस्टम में है, तो मौजूदा ग्राहक दिखाने वाला डायलॉग खुलेगा। यह डबल-रजिस्ट्रेशन से बचाता है।',
          steps: [
            { text: 'View existing customer पर दबाएँ — उनकी प्रोफ़ाइल खुलेगी।' },
            { text: 'अगर वही व्यक्ति हैं, तो मौजूदा रिकॉर्ड पर काम करें — डुप्लिकेट न बनाएँ।' },
            { text: 'अगर अलग व्यक्ति पर वही आधार (दुर्लभ — आमतौर पर टाइपो) — ग्राहक से दोबारा नंबर पूछें।' },
            { text: 'सच में अलग व्यक्ति लगें, तो Continue with new पर दबाएँ — मैनेजर समीक्षा करेगा।' },
          ],
        },
        {
          id: 'find',
          heading: 'ग्राहक ढूँढना',
          body:
            'Customers लिस्ट में नाम या मोबाइल टाइप करें — लिस्ट साथ-साथ छँटती जाती है। स्थिति से भी फ़िल्टर कर सकते हैं (Active, Blacklisted)। मोबाइल पर फ़ोन नंबर टैप करके सीधे कॉल भी कर सकते हैं।',
        },
        {
          id: 'documents',
          heading: 'KYC दस्तावेज़ अपलोड',
          body:
            'ग्राहक की प्रोफ़ाइल खोलें और Upload Document दबाएँ। प्रकार चुनें (फ़ोटो, आधार, PAN, पते का प्रमाण, हस्ताक्षर) और फ़ाइल चुनें। हर दस्तावेज़ ग्राहक से जुड़ा संग्रहीत होगा, KYC अधिकार वाले स्टाफ़ को दिखेगा।',
          warning: 'साझा WhatsApp ग्रुप से खींची आधार फ़ोटो अपलोड न करें। AS-Finance ऐप के कैमरे से लें या सीधे ग्राहक की फ़ाइल से।',
        },
        {
          id: 'blacklist',
          heading: 'ब्लैकलिस्ट और बहाली',
          body:
            'अगर ग्राहक बार-बार चूके या धोखाधड़ी करे, मैनेजर ब्लैकलिस्ट कर सकता है — बहाली तक नया लोन नहीं ले सकते। प्रोफ़ाइल खोलें, Blacklist दबाएँ, कारण लिखें। बहाली के लिए उसी जगह Reinstate दबाएँ।',
          reassure:
            'ब्लैकलिस्ट पलट सकता है। ग्राहक की स्थिति बदले (विवाद सुलझा, पैसा चुकाया) तो Reinstate सही कदम है — कोई स्थायी निशान नहीं।',
        },
        {
          id: 'family-and-guarantors',
          heading: 'परिवार और गारंटर',
          body:
            'प्रोफ़ाइल से परिवार के सदस्य (साझा लोन के लिए उपयोगी) और गारंटर (जो वादा करते हैं कि ज़रूरत पड़ी तो भरेंगे) जोड़ सकते हैं। लोन आवेदन पर ये बाद में दिखेंगे।',
        },
      ],
    },
    hinglish: {
      title: 'Customers',
      intro:
        'Sab kuch customer ke record se shuru hota hai. Ye chapter cover karta hai — naya customer add karna, existing ko dhundhna, documents upload, aur duplicate warning par kya karna.',
      whoCanDoThis: [
        UserRole.FIELD_OFFICER,
        UserRole.OFFICE_STAFF,
        UserRole.MANAGER,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'create',
          heading: 'Naya customer add karna',
          body:
            'Customers → New se full name, mobile, Aadhaar, gender, address, aur occupation bharo. DOB se age auto-calculate hoti hai. PAN tabhi zaroori jab loan certain limit se upar ho (manager current limit batayega).',
          tip: 'Aadhaar aur mobile par type karte hi duplicate check hota hai. Match mile to submission se pehle warning milegi — agla section dekho.',
        },
        {
          id: 'duplicate-warning',
          heading: '"Duplicate Aadhaar" warning par',
          body:
            'Agar daala hua Aadhaar ya mobile pehle se system mein hai, to existing customer dikhane wala dialog khulega. Ye double-registration se bachata hai.',
          steps: [
            { text: 'View existing customer dabao — unki profile khulegi.' },
            { text: 'Agar wahi banda hai, to existing record par kaam karo — duplicate mat banao.' },
            { text: 'Alag banda par same Aadhaar (rare — usually typo) — customer se number dobara pooch lo.' },
            { text: 'Sach mein alag banda lage to Continue with new dabao — manager review karega.' },
          ],
        },
        {
          id: 'find',
          heading: 'Customer dhundhna',
          body:
            'Customers list mein naam ya mobile type karo — list saath-saath filter hoti hai. Status se bhi filter kar sakte ho (Active, Blacklisted). Mobile par phone number tap karke seedha call bhi kar sakte ho.',
        },
        {
          id: 'documents',
          heading: 'KYC documents upload',
          body:
            'Customer ki profile kholo aur Upload Document dabao. Type chuno (photo, Aadhaar, PAN, address proof, signature) aur file chuno. Har document customer se linked store hota hai, KYC access wale staff ko dikhta hai.',
          warning: 'Shared WhatsApp group se uthayi Aadhaar photo upload mat karo. AS-Finance app ke camera se lo ya seedha customer ki file se.',
        },
        {
          id: 'blacklist',
          heading: 'Blacklist aur reinstate',
          body:
            'Agar customer baar-baar default kare ya fraud kare, Manager blacklist kar sakta hai — reinstate hone tak naya loan nahi le sakta. Profile kholo, Blacklist dabao, reason likho. Wahin se Reinstate dabakar reinstate karo.',
          reassure:
            'Blacklist reversible hai. Customer ki situation badle (dispute resolve hua, paisa bhar diya) to Reinstate sahi step hai — permanent daag nahi.',
        },
        {
          id: 'family-and-guarantors',
          heading: 'Family aur guarantors',
          body:
            'Profile se family members (joint loans ke liye useful) aur guarantors (jo promise karte hain ki borrower nahi de paya to wo denge) add kar sakte ho. Loan application par ye baad mein dikhte hain.',
        },
      ],
    },
  },
};
