import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const workflows: ChapterContent = {
  id: 'workflows',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  langs: {
    en: {
      title: 'Common workflows',
      intro:
        'The other chapters cover individual screens. This one covers the journeys — the multi-step things you actually do at work, with the order written down so a new joiner can follow.',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'first-day-field-officer',
          heading: 'First day — Field Officer',
          body:
            'You\'ve been added as a user and logged in. Now what?',
          steps: [
            { text: 'Read Getting Started end-to-end. Sign out and back in once.' },
            { text: 'Read the Your Role chapter — find the Field Officer card.' },
            { text: 'Read the Customers chapter — try adding a real customer.' },
            { text: 'Read the Loans chapter — create a draft loan, submit it, watch the Manager approve.' },
            { text: 'Shadow a Collection Officer for a day; do not post collections yourself yet.' },
            { text: 'Read the Penalties chapter so you know what overdue EMIs cost.' },
          ],
        },
        {
          id: 'lending-cycle',
          heading: 'The lending cycle — start to finish',
          body:
            'One loan, from first contact to closure:',
          steps: [
            { text: '**Customer registration** (Field Officer / Office Staff) — Customers → New. Upload Aadhaar, PAN, photo.' },
            { text: '**Loan application** (same staff) — Loans → New. Pick a product, enter amount + tenure + purpose.' },
            { text: '**Submit for review** — opens the loan to a Manager.' },
            { text: '**Review and approve** (Manager) — read the application, verify KYC, click Approve.' },
            { text: '**Disburse** (another Manager — maker-checker) — pick mode, enter reference, set first EMI date.' },
            { text: '**Collect EMIs** (Collection Officer) — every meeting day, post each customer\'s payment.' },
            { text: '**Waive penalty if needed** (Manager) — for documented genuine reasons only.' },
            { text: '**Close the loan** (Manager) — when outstanding hits ₹0 and no penalty is pending.' },
          ],
        },
        {
          id: 'day-end-collection-officer',
          heading: 'Day-end — Collection Officer',
          body: 'Every evening before you go home:',
          steps: [
            { text: 'Count the cash in your bag.' },
            { text: 'Open Cashbook → today. The Closing Balance should equal your cash count.' },
            { text: 'If they match: create a Cash Handover for the full amount to the branch / bank.' },
            { text: 'If they do NOT match: do not handover yet. Open the cash shortage SOP in the Cashbook chapter and run through it with your Manager.' },
            { text: 'Logout.' },
          ],
        },
        {
          id: 'day-end-accountant',
          heading: 'Day-end — Accountant',
          body: 'Before locking the day:',
          steps: [
            { text: 'Cashbook → today. Total of Cash Inflows minus Outflows should explain the Closing Balance.' },
            { text: 'Verify all Cash Handovers reported by collectors — match each against bank deposit slips or counter cash.' },
            { text: 'Run Trial Balance for the day. It must balance to the rupee.' },
            { text: 'If everything checks: from the Accounting page, close the period for today\'s date.' },
            { text: 'If something does not check: leave the period open and escalate to the Manager.' },
          ],
        },
        {
          id: 'month-end',
          heading: 'Month-end — Branch Manager',
          body: 'On the 1st of every month for the previous month:',
          steps: [
            { text: 'Run the Overdue Report. Anything over 90 days past due needs a recovery plan.' },
            { text: 'Run the Disbursement Report. Compare against the branch target.' },
            { text: 'Run the Daily Collection Report (aggregated). Check officer-level totals.' },
            { text: 'Run Profit & Loss for the month. Save the PDF.' },
            { text: 'Confirm with the Accountant that the previous month\'s period is closed.' },
            { text: 'Send the P&L PDF to the Owner.' },
          ],
        },
        {
          id: 'audit-prep',
          heading: 'When an auditor visits',
          body: 'An auditor will spend most of their time on the Audit Logs and the three accounting statements.',
          steps: [
            { text: 'Give them a Viewer (Auditor) login — never share a Manager login.' },
            { text: 'Make sure all Cash Handovers from the audit period are Verified.' },
            { text: 'Print the Trial Balance, P&L, and Balance Sheet for the period; keep PDFs ready.' },
            { text: 'Be ready to walk through one or two flagged transactions in the Audit Log — they will pick samples.' },
          ],
        },
      ],
    },
    hi: {
      title: 'सामान्य कार्यप्रवाह',
      intro:
        'बाक़ी अध्याय अलग-अलग स्क्रीन बताते हैं। यह अध्याय यात्राएँ बताता है — काम पर वास्तव में होने वाली बहु-चरण प्रक्रियाएँ, क्रम सहित।',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'first-day-field-officer',
          heading: 'पहला दिन — फील्ड ऑफिसर',
          body: 'यूज़र बना दिए गए हैं, लॉगिन कर लिया है। अब?',
          steps: [
            { text: 'Getting Started पूरा पढ़ें। एक बार साइन आउट और इन।' },
            { text: 'Your Role पढ़ें — फील्ड ऑफिसर कार्ड।' },
            { text: 'Customers पढ़ें — एक असली ग्राहक जोड़ें।' },
            { text: 'Loans पढ़ें — एक draft बनाएँ, सबमिट करें, मैनेजर का अप्रूव देखें।' },
            { text: 'एक दिन कलेक्शन ऑफिसर के साथ — अभी ख़ुद कलेक्शन न करें।' },
            { text: 'Penalties पढ़ें — overdue की कीमत जानें।' },
          ],
        },
        {
          id: 'lending-cycle',
          heading: 'लेंडिंग चक्र — आरंभ से अंत',
          body: 'एक लोन, पहले संपर्क से बंद होने तक:',
          steps: [
            { text: '**ग्राहक पंजीकरण** — Customers → New। आधार, PAN, फ़ोटो।' },
            { text: '**लोन आवेदन** — Loans → New। प्रोडक्ट, रकम, अवधि, उद्देश्य।' },
            { text: '**समीक्षा के लिए सबमिट** — मैनेजर खोलेगा।' },
            { text: '**मैनेजर अप्रूव** — आवेदन पढ़ें, KYC सत्यापित, Approve।' },
            { text: '**वितरण** (दूसरा मैनेजर — मेकर-चेकर) — मोड, रेफ़रेंस, पहली EMI।' },
            { text: '**EMI लें** (कलेक्शन ऑफिसर) — हर बैठक दिन पर भुगतान दर्ज।' },
            { text: '**पेनल्टी माफ़ी** (मैनेजर) — सिर्फ़ दस्तावेज़ी असली कारण।' },
            { text: '**लोन बंद** (मैनेजर) — outstanding ₹0 और पेनल्टी नहीं।' },
          ],
        },
        {
          id: 'day-end-collection-officer',
          heading: 'दिन-समापन — कलेक्शन ऑफिसर',
          body: 'घर जाने से पहले:',
          steps: [
            { text: 'थैले की नक़द गिनें।' },
            { text: 'Cashbook → आज। Closing Balance आपकी गिनती से मेल खाए।' },
            { text: 'मेल खाए: पूरी रकम का Cash Handover बनाएँ।' },
            { text: 'न मेल खाए: handover न करें। Cashbook में shortage SOP खोलें, मैनेजर के साथ चलें।' },
            { text: 'लॉगआउट।' },
          ],
        },
        {
          id: 'day-end-accountant',
          heading: 'दिन-समापन — अकाउंटेंट',
          body: 'दिन बंद करने से पहले:',
          steps: [
            { text: 'Cashbook → आज। आवक और बहिर्गामी का योग Closing Balance समझाए।' },
            { text: 'सभी Cash Handovers सत्यापित करें — बैंक स्लिप / नकद से मिलाएँ।' },
            { text: 'Trial Balance चलाएँ। ठीक मेल खाए।' },
            { text: 'सब ठीक तो Accounting से आज की अवधि बंद करें।' },
            { text: 'कुछ अटके तो अवधि खुली रखें, मैनेजर को बढ़ाएँ।' },
          ],
        },
        {
          id: 'month-end',
          heading: 'महीना समापन — ब्रांच मैनेजर',
          body: 'हर महीने की 1 तारीख़ को पिछले महीने के लिए:',
          steps: [
            { text: 'Overdue Report चलाएँ। 90+ दिन — रिकवरी योजना।' },
            { text: 'Disbursement Report — ब्रांच लक्ष्य से तुलना।' },
            { text: 'Daily Collection Report (कुल) — ऑफिसर-वार।' },
            { text: 'P&L महीने का — PDF सेव।' },
            { text: 'अकाउंटेंट से पुष्टि — पिछला महीना बंद है।' },
            { text: 'P&L PDF मालिक को भेजें।' },
          ],
        },
        {
          id: 'audit-prep',
          heading: 'ऑडिटर के आने पर',
          body: 'ऑडिटर अधिकतर Audit Logs और तीन स्टेटमेंट पर समय बिताएगा।',
          steps: [
            { text: 'Viewer (Auditor) लॉगिन दें — कभी मैनेजर लॉगिन नहीं।' },
            { text: 'ऑडिट अवधि के सभी Cash Handovers सत्यापित हों।' },
            { text: 'Trial Balance, P&L, Balance Sheet प्रिंट / PDF तैयार।' },
            { text: 'ऑडिट लॉग में नमूना लेन-देन समझाने को तैयार रहें।' },
          ],
        },
      ],
    },
    hinglish: {
      title: 'Common workflows',
      intro:
        'Baaki chapters individual screens batate hain. Ye chapter journeys batata hai — multi-step kaam jo aap actually office mein karte ho, order ke saath.',
      whoCanDoThis: Object.values(UserRole) as UserRole[],
      sections: [
        {
          id: 'first-day-field-officer',
          heading: 'Pehla din — Field Officer',
          body: 'User ban gaye ho, login ho gaya. Ab kya?',
          steps: [
            { text: 'Getting Started end-to-end padho. Ek baar sign out aur in.' },
            { text: 'Your Role chapter padho — Field Officer card.' },
            { text: 'Customers padho — ek real customer add karo.' },
            { text: 'Loans padho — ek draft loan banao, submit karo, Manager ka approve dekho.' },
            { text: 'Ek din Collection Officer ke saath — abhi khud collection mat post karo.' },
            { text: 'Penalties chapter padho — overdue ki cost samajh lo.' },
          ],
        },
        {
          id: 'lending-cycle',
          heading: 'Lending cycle — start se end tak',
          body: 'Ek loan, pehle contact se closure tak:',
          steps: [
            { text: '**Customer registration** — Customers → New. Aadhaar, PAN, photo.' },
            { text: '**Loan application** — Loans → New. Product, amount, tenure, purpose.' },
            { text: '**Submit for review** — Manager ko khulta hai.' },
            { text: '**Manager approve** — application padho, KYC verify, Approve.' },
            { text: '**Disburse** (doosra Manager — maker-checker) — mode, reference, pehli EMI date.' },
            { text: '**EMIs collect** (Collection Officer) — har meeting day par payment post.' },
            { text: '**Penalty waive** (Manager) — sirf documented genuine reasons.' },
            { text: '**Loan close** (Manager) — outstanding ₹0 aur penalty pending nahi.' },
          ],
        },
        {
          id: 'day-end-collection-officer',
          heading: 'Day-end — Collection Officer',
          body: 'Har sham ghar jaane se pehle:',
          steps: [
            { text: 'Bag ka cash gino.' },
            { text: 'Cashbook → today. Closing Balance aapki count se match ho.' },
            { text: 'Match ho: poori amount ka Cash Handover banao.' },
            { text: 'Match nahi: handover abhi MAT karo. Cashbook chapter mein shortage SOP kholo, Manager ke saath chalao.' },
            { text: 'Logout.' },
          ],
        },
        {
          id: 'day-end-accountant',
          heading: 'Day-end — Accountant',
          body: 'Din lock karne se pehle:',
          steps: [
            { text: 'Cashbook → today. Inflows minus Outflows Closing Balance samjhaye.' },
            { text: 'Saari Cash Handovers verify karo — bank slip / counter cash se milao.' },
            { text: 'Trial Balance chalao. Rupee tak match karna chahiye.' },
            { text: 'Sab thik to Accounting se today ki period close karo.' },
            { text: 'Kuch atke to period open chhodo, Manager ko escalate karo.' },
          ],
        },
        {
          id: 'month-end',
          heading: 'Month-end — Branch Manager',
          body: 'Har mahine ki 1 tareeq ko pichle mahine ke liye:',
          steps: [
            { text: 'Overdue Report chalao. 90+ days — recovery plan.' },
            { text: 'Disbursement Report — branch target se compare.' },
            { text: 'Daily Collection Report (aggregated) — officer-wise totals.' },
            { text: 'P&L us mahine ka — PDF save.' },
            { text: 'Accountant se confirm — pichle mahine ka period closed hai.' },
            { text: 'P&L PDF Owner ko bhejo.' },
          ],
        },
        {
          id: 'audit-prep',
          heading: 'Jab auditor aaye',
          body: 'Auditor zyadatar time Audit Logs aur teen statements par bitayega.',
          steps: [
            { text: 'Viewer (Auditor) login do — kabhi Manager login share mat karo.' },
            { text: 'Audit period ke saare Cash Handovers Verified ho.' },
            { text: 'Trial Balance, P&L, Balance Sheet print / PDF tayar.' },
            { text: 'Audit log mein sample transactions samjhane ko ready raho.' },
          ],
        },
      ],
    },
  },
};
