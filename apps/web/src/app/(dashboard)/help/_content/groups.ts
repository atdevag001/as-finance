import { UserRole } from '@as-finance/shared';
import type { ChapterContent } from './_types';

export const groups: ChapterContent = {
  id: 'groups',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  screenshots: {
    create: {
      src: '/help/screenshots/groups/groups-list.png',
      alt: 'Groups list showing group name, leader, member count, and status, with a "New Group" button at the top',
      caption: 'The Groups list. "New Group" creates an empty group; members are added from the group detail page.',
    },
  },
  langs: {
    en: {
      title: 'Groups',
      intro:
        'Many of your customers belong to self-help groups that meet on a fixed day each week. AS-Finance lets you create a group, add members, and collect from all of them in one go.',
      whoCanDoThis: [
        UserRole.FIELD_OFFICER,
        UserRole.MANAGER,
        UserRole.COLLECTION_OFFICER,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'create',
          heading: 'Creating a group',
          body:
            'From Groups → New, give the group a name, pick the weekly meeting day, write the branch/area, and select a Group Leader from existing customers. Save. The group is now live but empty.',
        },
        {
          id: 'add-members',
          heading: 'Adding members',
          body:
            'Open the group and click Add Member. Search a customer by name or mobile. Repeat for every member. Members can have individual loans linked to the group, or you can use group lending products.',
        },
        {
          id: 'group-collect',
          heading: 'Collecting from the whole group',
          body:
            'On meeting day, open the group and click Collect. The screen shows every member with an active group loan. Enter the amount each member is paying (leave 0 for those not paying today). The total at the bottom should match the cash in hand. Confirm — the system creates one receipt per member.',
          example: {
            title: 'Group collection — three members at once',
            body:
              'Members and EMIs:\n• Sita — EMI ₹500\n• Ravi — EMI ₹500\n• Asha — EMI ₹500\n\nYou enter ₹500 + ₹500 + ₹500 = ₹1,500 total. Tap Post. Three separate receipts are generated, each member’s outstanding goes down by ₹500. The cash you hand to the accountant is one envelope of ₹1,500 — the books trace exactly where each rupee went.',
          },
          tip:
            'If a member is short today, enter what they actually paid (e.g. ₹300 instead of ₹500). The system handles partial payments — the rest becomes overdue.',
        },
      ],
    },
    hi: {
      title: 'समूह',
      intro:
        'आपके बहुत से ग्राहक स्वयं-सहायता समूहों के सदस्य हैं जो हर हफ़्ते एक तय दिन मिलते हैं। AS-Finance पर समूह बनाइए, सदस्य जोड़िए, और सबसे एक साथ कलेक्शन लीजिए।',
      whoCanDoThis: [
        UserRole.FIELD_OFFICER,
        UserRole.MANAGER,
        UserRole.COLLECTION_OFFICER,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'create',
          heading: 'समूह बनाना',
          body:
            'Groups → New से समूह का नाम दें, साप्ताहिक मीटिंग का दिन चुनें, ब्रांच/इलाक़ा लिखें, और मौजूदा ग्राहकों में से ग्रुप लीडर चुनें। सेव करें। समूह बना — पर अभी ख़ाली है।',
        },
        {
          id: 'add-members',
          heading: 'सदस्य जोड़ना',
          body:
            'समूह खोलें और Add Member दबाएँ। नाम या मोबाइल से ग्राहक ढूँढें। हर सदस्य के लिए दोहराएँ। सदस्य के लोन समूह से जुड़े हो सकते हैं, या समूह-लोन प्रोडक्ट इस्तेमाल कर सकते हैं।',
        },
        {
          id: 'group-collect',
          heading: 'पूरे समूह से कलेक्शन',
          body:
            'मीटिंग के दिन समूह खोलें और Collect दबाएँ। हर सदस्य जिसकी कोई चालू समूह-लोन है दिखेगा। हर एक की भुगतान राशि भरें (न देने वाले के लिए 0 छोड़ें)। नीचे का कुल आपके हाथ की नकद से मेल खाना चाहिए। पुष्टि करें — सिस्टम हर सदस्य के लिए अलग रसीद बना देगा।',
          example: {
            title: 'समूह कलेक्शन — तीन सदस्य एक साथ',
            body:
              'सदस्य और EMI:\n• सीता — EMI ₹500\n• रवि — EMI ₹500\n• आशा — EMI ₹500\n\nभरें ₹500 + ₹500 + ₹500 = कुल ₹1,500। Post दबाएँ। तीन अलग रसीदें बनेंगी, हर सदस्य का आउटस्टैंडिंग ₹500 घटेगा। अकाउंटेंट को आप ₹1,500 का एक लिफ़ाफ़ा देंगे — किताबें ठीक-ठीक बताती हैं हर रुपया कहाँ गया।',
          },
          tip: 'कोई सदस्य आज कम दे, तो जितना दिया उतना भरें (₹500 की जगह ₹300)। सिस्टम आंशिक भुगतान संभालता है — बचा हुआ overdue हो जाएगा।',
        },
      ],
    },
    hinglish: {
      title: 'Groups',
      intro:
        'Aapke kayi customers self-help groups ke members hain jo har hafte fixed din milte hain. AS-Finance par group banao, members add karo, aur sab se ek saath collection lo.',
      whoCanDoThis: [
        UserRole.FIELD_OFFICER,
        UserRole.MANAGER,
        UserRole.COLLECTION_OFFICER,
        UserRole.SUPER_ADMIN,
      ],
      sections: [
        {
          id: 'create',
          heading: 'Group banana',
          body:
            'Groups → New se group ka naam do, weekly meeting day chuno, branch/area likho, aur existing customers mein se Group Leader chuno. Save karo. Group ban gaya — par abhi khaali hai.',
        },
        {
          id: 'add-members',
          heading: 'Members add karna',
          body:
            'Group kholo aur Add Member dabao. Naam ya mobile se customer dhundo. Har member ke liye repeat karo. Members ke individual loans group se linked ho sakte hain, ya group-lending products use kar sakte ho.',
        },
        {
          id: 'group-collect',
          heading: 'Poore group se collection',
          body:
            'Meeting day par group kholo aur Collect dabao. Har member jiska koi active group loan hai dikhega. Har ek ka amount bharo (jo aaj nahi de raha uska 0 chhodo). Neeche ka total aapke haath ki cash se match hona chahiye. Confirm — system har member ke liye alag receipt bana dega.',
          example: {
            title: 'Group collection — teen members ek saath',
            body:
              'Members aur EMIs:\n• Sita — EMI ₹500\n• Ravi — EMI ₹500\n• Asha — EMI ₹500\n\nBharo ₹500 + ₹500 + ₹500 = total ₹1,500. Post dabao. Teen alag receipts banengi, har member ka outstanding ₹500 ghatega. Accountant ko ek envelope ₹1,500 ka doge — books exactly batati hain har rupee kahan gaya.',
          },
          tip: 'Koi member aaj kam de to actual amount bharo (₹500 ki jagah ₹300). System partial payment handle karta hai — bacha hua overdue ho jaayega.',
        },
      ],
    },
  },
};
