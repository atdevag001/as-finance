import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const loans: ChapterContent = {
  id: 'loans',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    create: {
      src: '/help/screenshots/loans/loan-new.png',
      alt: 'The New Loan Application form with Customer search, Loan Product dropdown, Principal Amount, Tenure (months), Group (optional), and Purpose fields',
      caption: "The new-loan form. The little (?) icon next to each risky action takes you straight to the relevant step.",
    },
    lifecycle: {
      src: '/help/screenshots/loans/loans-list.png',
      alt: 'The Loans list filtered by status, showing loan number, customer name, principal, status badge, and outstanding amount',
      caption: 'The Loans list — use the status pills at the top to find drafts, overdues, or approved loans.',
    },
  },
  langs: {
    en: {
      title: 'Loans — from application to closure',
      intro:
        'A loan in AS-Finance moves through clear stages, with different staff doing different parts. This chapter explains every stage, plus the maths your customers will ask about — EMI, processing fee, GST, and the EMI date shift caused by holidays.',
      whoCanDoThis: [
        UserRole.FIELD_OFFICER,
        UserRole.OFFICE_STAFF,
        UserRole.MANAGER,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'lifecycle',
          heading: 'The lifecycle at a glance',
          body:
            'Draft → Submitted → Under Review → Approved → Disbursed → Active → Closed. A field officer or office staff creates the draft. The manager reviews, approves, and disburses. After that the customer starts paying EMIs through collections.',
        },
        {
          id: 'create',
          heading: '1. Create a loan application',
          body:
            'From the sidebar go to Loans → New. Search the customer by name or mobile, pick the loan product (which fixes the interest type and rate), enter the principal amount and tenure in months, write the purpose, and click Create. The loan is now in Draft — no one else can act on it until you Submit.',
          tip:
            'The form blocks amounts and tenures outside the product’s limits — if you can’t type 24 months, it’s because the product caps at 18.',
        },
        {
          id: 'submit',
          heading: '2. Submit for approval',
          body:
            'Open the draft loan and click Submit for Approval. The loan moves to Submitted; a manager will pick it up.',
        },
        {
          id: 'approve',
          heading: '3. Manager: approve or reject',
          body:
            'Open the submitted loan. Read through the customer profile, KYC documents, and the requested amount. If anything is off, click Reject and enter a reason — the field officer will see it. If it looks good, click Approve. The system generates the EMI schedule immediately.',
          warning:
            'You cannot approve a loan you submitted. A different person must approve it — this is the maker-checker rule. If Approve is greyed out, ask another manager.',
        },
        {
          id: 'emi-calculation',
          heading: 'Understanding the EMI on the schedule',
          body:
            'Your branch uses one interest type per product — either flat or reducing. Both are calculated automatically, but the totals are very different.',
          example: {
            title: 'Worked example — ₹10,000 for 12 months at 24% annual',
            body:
              'Reducing interest:\n• Monthly rate: 24% / 12 = 2%\n• EMI = ₹944 (calculated from the reducing-balance formula)\n• Total interest over 12 months ≈ ₹1,328\n\nFlat interest:\n• Annual interest = ₹10,000 × 24% = ₹2,400\n• EMI = (₹10,000 + ₹2,400) / 12 = ₹1,033\n• Total interest = ₹2,400\n\nSame principal, same rate, very different cost. If a customer asks "why is my EMI higher than my neighbour’s", check which product they took.',
          },
        },
        {
          id: 'disburse',
          heading: '4. Disburse the loan',
          body:
            'On the Approved loan, click Disburse. Choose cash, bank transfer, or online. For non-cash, enter the reference number (cheque #, UTR, etc.). You can override the first EMI date if you need to — for example, if today is a Friday before a Monday holiday, set the first EMI to Tuesday. After confirmation the loan becomes Active.',
          warning:
            'Like Approve, you cannot disburse a loan you approved. A second person has to disburse.',
          example: {
            title: 'What gets deducted at disbursement',
            body:
              'Loan principal: ₹10,000\n− Processing fee (2%): ₹200\n− GST on processing fee (18%): ₹36\n────────────────────\nNet amount handed to customer: ₹9,764\n\nThe customer signs for ₹10,000 (the principal) — the EMI schedule is built on this amount. The deductions reduce only the cash they walk out with.',
          },
        },
        {
          id: 'holiday-shift',
          heading: 'First EMI date and holidays',
          body:
            'If the first EMI falls on a holiday or a Sunday, the system shifts it forward to the next working day. You can see the holiday list in Settings.',
          example: {
            title: 'Holiday-shift example',
            body:
              'Disbursement: Fri 7 Jun\nProduct default first EMI: 1 month later → Sun 7 Jul (holiday)\nSystem shifts to: Mon 8 Jul\nAll later EMIs follow from this new date.',
          },
        },
        {
          id: 'foreclose',
          heading: 'Foreclosure — closing a loan early',
          body:
            'If a customer wants to pay off a loan before its tenure ends, open the Active loan and click Foreclosure. The system gives you a quote — principal remaining plus accrued interest minus any rebate you choose. The quote is valid for 24 hours. The same person who generated the quote cannot execute it — maker-checker again.',
          reassure:
            'If the 24-hour quote expires before the customer comes in, just generate a fresh quote. Nothing is lost — the system tracks the latest one.',
        },
        {
          id: 'close',
          heading: 'Closing a fully-paid loan',
          body:
            'When the outstanding reaches zero (within ±1 paise) and there are no pending penalties, the Close Loan button activates. Click it and confirm — the loan moves to Closed and disappears from the active list.',
        },
        {
          id: 'rejection-and-errors',
          heading: 'Common errors and what they mean',
          body:
            '• "Account period closed" — the accountant has locked this date. Pick another date or ask the accountant to reopen.\n• "Quote expired" — generate a fresh foreclosure quote.\n• "You cannot approve your own action" — maker-checker. Ask a colleague.\n• "Outstanding not zero" — there are still EMIs or penalties due. Check the schedule.',
        },
      ],
    },
    hi: {
      title: 'लोन — आवेदन से बंद होने तक',
      intro:
        'AS-Finance में लोन साफ़ चरणों में आगे बढ़ता है — हर चरण अलग स्टाफ़ करता है। यह अध्याय हर चरण समझाता है, साथ ही वो हिसाब-किताब जो ग्राहक पूछेंगे — EMI, प्रोसेसिंग फ़ी, GST, और छुट्टी से होने वाला EMI तारीख का बदलाव।',
      whoCanDoThis: [
        UserRole.FIELD_OFFICER,
        UserRole.OFFICE_STAFF,
        UserRole.MANAGER,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'lifecycle',
          heading: 'पूरी यात्रा एक नज़र में',
          body:
            'Draft → Submitted → Under Review → Approved → Disbursed → Active → Closed। फील्ड ऑफिसर या ऑफिस स्टाफ़ Draft बनाता है। मैनेजर समीक्षा, अप्रूव और वितरण करता है। उसके बाद ग्राहक कलेक्शन के ज़रिए EMI भरना शुरू करता है।',
        },
        {
          id: 'create',
          heading: '1. लोन आवेदन बनाना',
          body:
            'साइडबार से Loans → New पर जाएँ। ग्राहक को नाम या मोबाइल से खोजें, लोन प्रोडक्ट चुनें (जो ब्याज प्रकार और दर तय करता है), मूलधन और महीनों में अवधि भरें, उद्देश्य लिखें, Create दबाएँ। लोन अब Draft में है — Submit करने तक कोई और कार्रवाई नहीं हो सकती।',
          tip:
            'फ़ॉर्म प्रोडक्ट की सीमाओं के बाहर अमाउंट/अवधि नहीं लेने देगा — अगर 24 महीने नहीं भर पा रहे, तो प्रोडक्ट की अधिकतम 18 है।',
        },
        {
          id: 'submit',
          heading: '2. अप्रूवल के लिए सबमिट',
          body: 'Draft लोन खोलें और Submit for Approval दबाएँ। लोन Submitted में चला जाएगा; एक मैनेजर इसे उठाएगा।',
        },
        {
          id: 'approve',
          heading: '3. मैनेजर: अप्रूव या रिजेक्ट',
          body:
            'Submitted लोन खोलें। ग्राहक की प्रोफ़ाइल, KYC, और माँगी गई रकम पढ़ें। कुछ गड़बड़ लगे तो Reject दबाएँ और कारण लिखें — फील्ड ऑफिसर को दिखेगा। ठीक लगे तो Approve दबाएँ। सिस्टम तुरंत EMI शेड्यूल बना देगा।',
          warning:
            'आप अपने सबमिट किए लोन को अप्रूव नहीं कर सकते। दूसरा व्यक्ति अप्रूव करेगा — यह मेकर-चेकर है। Approve डिसएबल दिखे तो किसी और मैनेजर से कहें।',
        },
        {
          id: 'emi-calculation',
          heading: 'शेड्यूल पर EMI का हिसाब',
          body:
            'आपकी ब्रांच हर प्रोडक्ट में एक ही ब्याज प्रकार रखती है — flat या reducing। दोनों अपने आप गणना होते हैं, पर कुल राशि बहुत अलग होती है।',
          example: {
            title: 'उदाहरण — ₹10,000, 12 महीने, 24% वार्षिक',
            body:
              'Reducing ब्याज:\n• मासिक दर: 24% / 12 = 2%\n• EMI = ₹944\n• कुल ब्याज ≈ ₹1,328\n\nFlat ब्याज:\n• वार्षिक ब्याज = ₹10,000 × 24% = ₹2,400\n• EMI = (₹10,000 + ₹2,400) / 12 = ₹1,033\n• कुल ब्याज = ₹2,400\n\nवही मूलधन, वही दर — पर लागत बहुत अलग। ग्राहक पूछे "मेरी EMI ज़्यादा क्यों" — देखें कौन-सा प्रोडक्ट लिया है।',
          },
        },
        {
          id: 'disburse',
          heading: '4. लोन वितरण',
          body:
            'Approved लोन पर Disburse दबाएँ। नकद, बैंक ट्रांसफ़र, या ऑनलाइन चुनें। नकद के अलावा के लिए, संदर्भ संख्या डालें (चेक #, UTR, आदि)। पहली EMI तारीख ज़रूरत पड़ने पर बदल सकते हैं — जैसे आज शुक्रवार और सोमवार छुट्टी, तो पहली EMI मंगलवार रखें। पुष्टि के बाद लोन Active हो जाता है।',
          warning: 'अप्रूव की तरह — आप अपने अप्रूव किए लोन का वितरण नहीं कर सकते। दूसरा व्यक्ति करेगा।',
          example: {
            title: 'वितरण के समय क्या-क्या कटता है',
            body:
              'लोन मूलधन: ₹10,000\n− प्रोसेसिंग फ़ी (2%): ₹200\n− प्रोसेसिंग फ़ी पर GST (18%): ₹36\n────────────────────\nग्राहक को नकद: ₹9,764\n\nग्राहक ₹10,000 (मूलधन) पर हस्ताक्षर करता है — EMI शेड्यूल इसी पर बनता है। कटौती सिर्फ़ हाथ में मिलने वाली नकद घटाती है।',
          },
        },
        {
          id: 'holiday-shift',
          heading: 'पहली EMI और छुट्टियाँ',
          body:
            'अगर पहली EMI छुट्टी या रविवार को पड़े, तो सिस्टम अगले कार्य दिवस पर खिसका देता है। छुट्टियों की सूची Settings में है।',
          example: {
            title: 'छुट्टी से EMI खिसकने का उदाहरण',
            body:
              'वितरण: शुक्र 7 जून\nप्रोडक्ट डिफ़ॉल्ट पहली EMI: 1 महीने बाद → रवि 7 जुलाई (छुट्टी)\nसिस्टम खिसकाता है: सोम 8 जुलाई\nबाकी सब EMI नई तारीख से।',
          },
        },
        {
          id: 'foreclose',
          heading: 'फोरक्लोज़र — समय से पहले लोन बंद करना',
          body:
            'अगर ग्राहक अवधि से पहले लोन बंद करना चाहे, Active लोन खोलें और Foreclosure दबाएँ। सिस्टम एक कोटेशन देगा — बचा मूलधन + अर्जित ब्याज − छूट (अगर दें)। कोटेशन 24 घंटे के लिए वैध है। कोटेशन बनाने वाला उसे लागू नहीं कर सकता — मेकर-चेकर फिर।',
          reassure:
            'अगर 24 घंटे का कोटेशन ग्राहक के आने से पहले ख़त्म हो जाए, तो नया बना लें। कुछ खोता नहीं — सिस्टम नवीनतम कोटेशन ही रखता है।',
        },
        {
          id: 'close',
          heading: 'पूरी तरह चुकाए हुए लोन को बंद करना',
          body:
            'जब आउटस्टैंडिंग शून्य (± 1 पैसा) हो और कोई पेनल्टी पेंडिंग नहीं हो, Close Loan बटन सक्रिय होगा। दबाएँ और पुष्टि करें — लोन Closed में चला जाएगा।',
        },
        {
          id: 'rejection-and-errors',
          heading: 'आम गलतियाँ और उनका मतलब',
          body:
            '• "Account period closed" — अकाउंटेंट ने यह तारीख लॉक की है। दूसरी तारीख चुनें या अकाउंटेंट से खुलवाएँ।\n• "Quote expired" — नया फोरक्लोज़र कोटेशन बनाएँ।\n• "You cannot approve your own action" — मेकर-चेकर। सहकर्मी से कहें।\n• "Outstanding not zero" — EMI/पेनल्टी अभी बकाया हैं। शेड्यूल देखें।',
        },
      ],
    },
    hinglish: {
      title: 'Loans — application se closure tak',
      intro:
        'AS-Finance mein loan clear stages mein aage badhta hai — har stage alag staff karta hai. Ye chapter har stage samjhata hai, plus wo hisab-kitab jo customers poochenge — EMI, processing fee, GST, aur holiday se EMI date shift.',
      whoCanDoThis: [
        UserRole.FIELD_OFFICER,
        UserRole.OFFICE_STAFF,
        UserRole.MANAGER,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'lifecycle',
          heading: 'Poori journey ek nazar mein',
          body:
            'Draft → Submitted → Under Review → Approved → Disbursed → Active → Closed. Field officer ya office staff Draft banata hai. Manager review, approve, aur disburse karta hai. Uske baad customer collections ke through EMI bharna shuru karta hai.',
        },
        {
          id: 'create',
          heading: '1. Loan application banao',
          body:
            'Sidebar se Loans → New. Customer ko name ya mobile se search karo, loan product chuno (jo interest type aur rate fix karta hai), principal aur tenure (months) bharo, purpose likho, Create dabao. Loan ab Draft mein hai — Submit hone tak koi aur action nahi.',
          tip:
            'Form product ki limits ke bahar amount/tenure nahi lene dega — agar 24 months nahi bhar pa rahe, to product max 18 hai.',
        },
        {
          id: 'submit',
          heading: '2. Approval ke liye submit',
          body: 'Draft loan kholo aur Submit for Approval dabao. Loan Submitted mein chala jaayega; manager isse uthayega.',
        },
        {
          id: 'approve',
          heading: '3. Manager: approve ya reject',
          body:
            'Submitted loan kholo. Customer profile, KYC, aur maangi gayi amount padho. Kuch galat lage to Reject dabao aur reason likho — field officer ko dikhega. Sahi lage to Approve dabao. System turant EMI schedule bana dega.',
          warning:
            'Aap apne submit kiye loan ko approve nahi kar sakte. Doosra banda approve karega — ye maker-checker hai. Approve disabled dikhe to kisi aur manager se kaho.',
        },
        {
          id: 'emi-calculation',
          heading: 'Schedule par EMI ka hisab',
          body:
            'Aapki branch har product mein ek hi interest type rakhti hai — flat ya reducing. Dono auto-calculate hote hain, par total bahut alag.',
          example: {
            title: 'Example — ₹10,000, 12 months, 24% annual',
            body:
              'Reducing interest:\n• Monthly rate: 24% / 12 = 2%\n• EMI = ₹944\n• Total interest ≈ ₹1,328\n\nFlat interest:\n• Annual interest = ₹10,000 × 24% = ₹2,400\n• EMI = (₹10,000 + ₹2,400) / 12 = ₹1,033\n• Total interest = ₹2,400\n\nSame principal, same rate — par cost bahut alag. Customer pooche "meri EMI zyada kyun" — dekho kaun-sa product liya hai.',
          },
        },
        {
          id: 'disburse',
          heading: '4. Loan disburse karo',
          body:
            'Approved loan par Disburse dabao. Cash, bank transfer, ya online chuno. Cash ke alawa ke liye reference number daalo (cheque #, UTR, etc.). Pehli EMI date zaroorat par badal sakte ho — jaise aaj Friday hai aur Monday holiday, to pehli EMI Tuesday rakho. Confirmation ke baad loan Active ho jaata hai.',
          warning: 'Approve ki tarah — apne approve kiye loan ka disburse nahi kar sakte. Doosra banda karega.',
          example: {
            title: 'Disbursement ke time kya-kya katta hai',
            body:
              'Loan principal: ₹10,000\n− Processing fee (2%): ₹200\n− Processing fee par GST (18%): ₹36\n────────────────────\nCustomer ko cash: ₹9,764\n\nCustomer ₹10,000 (principal) par sign karta hai — EMI schedule isi par banta hai. Cuts sirf hand mein milne wali cash ghatate hain.',
          },
        },
        {
          id: 'holiday-shift',
          heading: 'Pehli EMI aur holidays',
          body:
            'Agar pehli EMI holiday ya Sunday par padti hai, system aage ke working day par shift kar deta hai. Holiday list Settings mein hai.',
          example: {
            title: 'Holiday shift example',
            body:
              'Disbursement: Fri 7 Jun\nProduct default first EMI: 1 month baad → Sun 7 Jul (holiday)\nSystem shift karta hai: Mon 8 Jul\nBaaki sab EMIs nayi date se.',
          },
        },
        {
          id: 'foreclose',
          heading: 'Foreclosure — loan jaldi band karo',
          body:
            'Agar customer tenure se pehle loan band karna chahe, Active loan kholo aur Foreclosure dabao. System ek quote dega — bacha principal + accrued interest − rebate (agar dena ho). Quote 24 hours valid hai. Jo banda quote banata hai wo execute nahi kar sakta — maker-checker fir se.',
          reassure:
            'Agar 24-hour quote customer ke aane se pehle expire ho jaaye, naya bana lo. Kuch loss nahi — system latest quote rakhta hai.',
        },
        {
          id: 'close',
          heading: 'Poora bhare hue loan ko band karna',
          body:
            'Jab outstanding zero (± 1 paisa) ho aur koi penalty pending nahi ho, Close Loan button active hoga. Dabakar confirm karo — loan Closed ho jaayega.',
        },
        {
          id: 'rejection-and-errors',
          heading: 'Common errors aur unka matlab',
          body:
            '• "Account period closed" — accountant ne ye date lock ki hai. Doosri date chuno ya accountant se khulwao.\n• "Quote expired" — naya foreclosure quote banao.\n• "You cannot approve your own action" — maker-checker. Colleague se kaho.\n• "Outstanding not zero" — EMI/penalty abhi baaki hai. Schedule dekho.',
        },
      ],
    },
  },
};
