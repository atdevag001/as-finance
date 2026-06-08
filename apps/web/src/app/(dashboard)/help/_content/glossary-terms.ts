import type { HelpLang } from './_types';

/**
 * Glossary lookup used by the inline <Term id="..."> component AND rendered in the Glossary chapter.
 * Keep ids URL-safe (kebab-case) — they become anchors at /help/glossary#<id>.
 */
export const GLOSSARY: Record<string, Record<HelpLang, string>> = {
  emi: {
    en: 'EMI — Equated Monthly Installment. The fixed amount a borrower pays every month, made up of principal plus interest.',
    hi: 'EMI — मासिक किस्त। हर महीने ग्राहक एक तय रकम भरता है, जिसमें मूलधन और ब्याज दोनों होते हैं।',
    hinglish:
      'EMI — Equated Monthly Installment. Customer har mahine ek fixed amount bharta hai — principal + interest dono.',
  },
  dpd: {
    en: 'DPD — Days Past Due. How many days late an EMI payment is.',
    hi: 'DPD — Days Past Due। यह बताता है कि EMI कितने दिन देरी से हुई है।',
    hinglish: 'DPD — Days Past Due. EMI kitne din late hui, wo count.',
  },
  par: {
    en: 'PAR — Portfolio at Risk. The share of your loan book where at least one EMI is overdue. Standard buckets are PAR 30, 60, 90 days.',
    hi: 'PAR — पोर्टफोलियो ऐट रिस्क। आपके कुल लोन में वो हिस्सा जिसकी कोई EMI देर से है। बकेट: PAR 30/60/90 दिन।',
    hinglish:
      'PAR — Portfolio at Risk. Total loan ka wo hissa jismein koi EMI overdue hai. Buckets: PAR 30/60/90 din.',
  },
  foreclosure: {
    en: 'Foreclosure — closing a loan early by paying the remaining amount in one go, sometimes with a small rebate on future interest.',
    hi: 'फोरक्लोज़र — लोन को समय से पहले बंद करना — बचा हुआ पैसा एक साथ देकर, कभी-कभी बचे ब्याज पर छूट के साथ।',
    hinglish:
      'Foreclosure — loan ko time se pehle band karna. Bacha hua amount ek saath bhar do, kabhi-kabhi interest pe rebate milta hai.',
  },
  'maker-checker': {
    en: 'Maker-checker — a safety rule where one person creates an action and a different person approves it. Prevents a single user from both initiating and confirming risky transactions.',
    hi: 'मेकर-चेकर — सुरक्षा नियम: एक व्यक्ति काम शुरू करता है, दूसरा अप्रूव करता है। ज़रूरी लेन-देन में दो आँखों की जाँच।',
    hinglish:
      'Maker-checker — safety rule. Ek banda action create karta hai, doosra approve. Risky transactions mein do logon ki check.',
  },
  reversal: {
    en: 'Reversal — undoing a posted collection. The original receipt stays on record; the system writes a matching reversal entry alongside.',
    hi: 'रिवर्सल — दर्ज की गई कलेक्शन को रद्द करना। मूल रसीद रिकॉर्ड पर रहती है, सिस्टम बराबर का रिवर्सल एंट्री भी डाल देता है।',
    hinglish:
      'Reversal — posted collection ko undo karna. Original receipt rehti hai, system uske saath ek matching reversal entry bhi daal deta hai.',
  },
  rebate: {
    en: 'Rebate — a discount on future interest, sometimes given when a borrower pays off a loan early.',
    hi: 'रिबेट — आगे आने वाले ब्याज पर छूट। आमतौर पर तब दी जाती है जब लोन समय से पहले बंद हो।',
    hinglish: 'Rebate — future interest pe discount. Loan jaldi band karne par diya jaata hai.',
  },
  idempotency: {
    en: 'Idempotent / safe to retry — the system uses a unique ticket for each submit, so if your screen freezes and you tap again, no double-charge.',
    hi: 'सेफ़ रिट्राय — सिस्टम हर सबमिट के लिए एक यूनिक टिकट बनाता है, इसलिए स्क्रीन रुकने पर दोबारा दबाएँ — दो बार चार्ज नहीं होगा।',
    hinglish:
      'Safe to retry — system har submit ke liye ek unique ticket banata hai. Screen ruk gayi to dobara tap kar do — double charge nahi hoga.',
  },
  kyc: {
    en: 'KYC — Know Your Customer. Identity documents and personal details collected before a customer can take a loan: Aadhaar, PAN, address proof, photo.',
    hi: 'KYC — ग्राहक को जानें। लोन से पहले ली जाने वाली पहचान की जानकारी: आधार, PAN, पता, फ़ोटो।',
    hinglish: 'KYC — Know Your Customer. Loan se pehle li jaane wali ID details: Aadhaar, PAN, address, photo.',
  },
  outstanding: {
    en: 'Outstanding — the remaining amount on a loan that the customer still owes (principal + accrued interest + penalties).',
    hi: 'आउटस्टैंडिंग — लोन का बचा हुआ पैसा (मूलधन + ब्याज + पेनल्टी)।',
    hinglish: 'Outstanding — loan ka bacha hua amount (principal + interest + penalty).',
  },
  principal: {
    en: 'Principal — the original loan amount, before interest.',
    hi: 'मूलधन (Principal) — ब्याज से पहले लिया गया लोन का मूल अमाउंट।',
    hinglish: 'Principal — original loan amount, interest se pehle.',
  },
  tenure: {
    en: 'Tenure — how long the loan runs, usually in months.',
    hi: 'अवधि (Tenure) — लोन कितने महीने का है।',
    hinglish: 'Tenure — loan kitne mahine ka hai.',
  },
  disbursement: {
    en: 'Disbursement — the act of handing the loan amount to the customer (cash, bank transfer, or online).',
    hi: 'वितरण (Disbursement) — ग्राहक को लोन की रकम देना (नकद, बैंक, या ऑनलाइन)।',
    hinglish: 'Disbursement — customer ko loan amount dena (cash, bank transfer, ya online).',
  },
  'reducing-interest': {
    en: 'Reducing interest — interest charged only on the outstanding balance. As the customer pays EMIs, the interest portion shrinks.',
    hi: 'रिड्यूसिंग ब्याज — सिर्फ़ बचे हुए मूलधन पर ब्याज लगता है। जैसे-जैसे EMI भरती है, ब्याज घटता जाता है।',
    hinglish:
      'Reducing interest — sirf outstanding balance pe interest. Jaise-jaise EMI bharti hai, interest part kam hota jaata hai.',
  },
  'flat-interest': {
    en: 'Flat interest — interest charged on the full original principal for the entire tenure. Simple to calculate, but works out higher than reducing.',
    hi: 'फ़्लैट ब्याज — पूरे लोन पर पूरी अवधि का ब्याज, मूलधन घटे फिर भी। हिसाब आसान, पर रिड्यूसिंग से महँगा।',
    hinglish:
      'Flat interest — pura interest, pure principal pe, puri tenure ke liye. Calculation simple, par reducing se mehnga padta hai.',
  },
  'processing-fee': {
    en: 'Processing fee — a one-time charge deducted from the loan amount at disbursement to cover paperwork and credit checks.',
    hi: 'प्रोसेसिंग फ़ी — एकमुश्त शुल्क जो वितरण के समय लोन से कटता है — पेपरवर्क और क्रेडिट चेक के लिए।',
    hinglish:
      'Processing fee — ek baar ka charge jo disbursement ke time loan se kat-ta hai — paperwork aur credit check ke liye.',
  },
  gst: {
    en: 'GST — Goods and Services Tax. Applied on top of charges like the processing fee, at the rate notified by the government.',
    hi: 'GST — माल और सेवा कर। प्रोसेसिंग फ़ी जैसे चार्ज पर सरकार की दर से लगता है।',
    hinglish: 'GST — Goods and Services Tax. Processing fee jaise charges pe government rate par lagta hai.',
  },
  'group-lending': {
    en: 'Group lending — small loans given to individual members of a group who guarantee each other. Common in microfinance.',
    hi: 'ग्रुप लेंडिंग — किसी ग्रुप के सदस्यों को छोटे लोन, जहाँ सदस्य एक-दूसरे की गारंटी देते हैं।',
    hinglish:
      'Group lending — group ke members ko chhote loans, jahan members ek-doosre ki guarantee dete hain. Microfinance mein common.',
  },
};
