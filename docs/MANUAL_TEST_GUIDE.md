# Manual Test Guide — AS-Finance In-App User Guide (V1)

A click-by-click walkthrough you can do yourself in ~15 minutes. Tests every feature shipped in V1. Tick the boxes as you go.

---

## Before you start

**Open the app:** http://localhost:3000

**Login credentials** (all use the password `Admin@123`):

| Role | Username | Use this account to test… |
|---|---|---|
| Super Admin | `admin` | Anything — full access |
| Branch Manager | `manager1` | Approve / disburse / verify; full sidebar |
| Field Officer | `field1` | Narrower sidebar, can't see Cashbook/Users/Settings |
| Collection Officer | `collector1` | Posting collections, mobile-flow |
| Accountant | `accountant1` | Cashbook + Accounting access, no user management |
| Office Staff | `staff1` | Can create customers/loans but not approve |
| Auditor (read-only) | `auditor1` | Sees everything, can change nothing |

After login you land on the dashboard. The **Help** menu item is the bottom-most entry in the left sidebar (icon: ❓).

---

## Test 1 — Quick smoke (2 min)

Login as **manager1** and verify the basics:

1. [ ] You land on the dashboard. Top says "Welcome back, Branch Manager."
2. [ ] Sidebar shows: Customers, Loans, Loan Products, Collections, Receipts, Groups, Accounting, Cashbook, Reports, Notifications, Users, Audit Logs, Settings, **Help**.
3. [ ] Click **Help** in the sidebar. You land on `/help`.
4. [ ] Page greets you: "Hi Branch — how can we help?"
5. [ ] Three language buttons visible top-right: **English | हिंदी | Hinglish**.
6. [ ] Big card: "First day at AS-Finance?" with a "Start the 5-minute tour →" button.
7. [ ] Grid of 11 chapter cards: Getting Started, Your Role, Customers, Loans, Collections, Groups, Cashbook & Day-End, Reports, Administration, Help & Troubleshooting, Glossary.
8. [ ] Bottom card: "Stuck? Talk to a human." with phone, hours, languages.

---

## Test 2 — Language switching (2 min)

Still on `/help`:

1. [ ] Click **हिंदी**. Page text instantly switches to Devanagari (e.g. greeting becomes "नमस्ते Branch — हम क्या मदद कर सकते हैं?").
2. [ ] URL changes to include `?lang=hi`.
3. [ ] Click **Hinglish**. Greeting becomes "Hi Branch — kya help chahiye?" (Roman-script Hindi-English mix).
4. [ ] URL becomes `?lang=hinglish`.
5. [ ] **Refresh the page (Ctrl+R / Cmd+R).** Language preference sticks — page comes back in Hinglish.
6. [ ] Look at the browser DOM: `<html lang>` should be `hi` when Hindi is selected (you can check via DevTools → Elements, or trust me on this — the E2E test validates it).

---

## Test 3 — Open a chapter and explore the content (3 min)

Click the **Collections** chapter card. You land on `/help/collections`.

1. [ ] H1 reads "Collections — taking a payment" (in your selected language).
2. [ ] Under the H1: an intro paragraph, then a row of role badges saying "Who can do this: Collection Officer, Branch Manager, Super Admin".
3. [ ] **On this page** sub-TOC visible — clickable list of sections (Posting a collection, Safe to retry, Reversing, Receipts, How a payment is allocated, On your phone, Common errors).
4. [ ] Top-right: language switcher + "🖨️ Print this chapter" button.
5. [ ] Click the **Posting a collection** section anchor. Page smoothly scrolls to that section.
6. [ ] **A real screenshot of the Post Collection form is visible** inside this section, with caption.
7. [ ] **Hover the screenshot** → a zoom icon appears. Click it → fullscreen dialog opens with the zoomed image. Press Esc to close.
8. [ ] Scroll down to **"Safe to retry — when the screen freezes"**. You should see a 💚 green reassurance callout: *"Tap Submit again. The system uses a unique ticket…"*.
9. [ ] **Reversing a wrong collection** section: another green reassure box + an amber ⚠️ warning ("Only Managers and Super Admins can reverse").
10. [ ] **On your phone** section: a mobile-viewport screenshot of the form.
11. [ ] At the end of every section, a small **"Was this section helpful? Yes / No"** widget (we test this in Test 6).
12. [ ] Above each section heading, on the right: a **🔗 Copy link** button. Click it → "Copied" briefly appears. Paste somewhere — you get a deep link like `http://localhost:3000/help/collections?lang=hinglish#post`.
13. [ ] Scroll to the bottom — see "Last reviewed: 2026-06-08 · help-maintainer · v1.0.0".

---

## Test 4 — Deep linking + copy link sharing (1 min)

1. [ ] Paste this URL into a new tab: `http://localhost:3000/help/loans?lang=hi#approve`
2. [ ] Page loads in **Hindi**, scrolled directly to the "3. मैनेजर: अप्रूव या रिजेक्ट" section.
3. [ ] Try `http://localhost:3000/help/cashbook?lang=hinglish#shortage` — lands at the cash-shortage SOP in Hinglish.

---

## Test 5 — Contextual help from inside the app (2 min)

This is the **biggest feature** — help reaching into the app at the dangerous buttons.

### Test 5a — On the Post Collection page
1. [ ] Click sidebar → **Collections** → **Post Collection** button (or directly visit `/collections/new`).
2. [ ] **Next to the "Post Collection" page title**, you should see a small **❓ icon** (the `<HelpLink>`).
3. [ ] Click it. You're navigated to `/help/collections#post` — the exact section explaining how to post a collection.
4. [ ] **Bottom-right corner**, you should also see a **floating ❓ button** (the `<HelpFab>`).
5. [ ] Click it. Same outcome: lands on `/help/collections#post`.

### Test 5b — On the Cashbook page (login as `manager1` or `accountant1`)
1. [ ] Sidebar → **Cashbook**.
2. [ ] Next to the **"Cashbook"** heading: an ❓ icon ("How day-end works"). Click → lands on `/help/cashbook#day-end`.
3. [ ] Next to the **"Handovers"** button (top-right): another ❓ icon ("If cash doesn't tally"). Click → lands on `/help/cashbook#shortage`.

### Test 5c — On a Loan detail page (login as `manager1`)
1. [ ] Sidebar → **Loans** → click any loan that's in **Submitted** or **Under Review** status.
2. [ ] Look at the action bar at the top. Next to the **Approve**, **Disburse**, or **Foreclosure** buttons, you should see ❓ icons.
3. [ ] Click the ❓ next to **Approve** → lands on the Loans chapter, Approve section, with all the maker-checker explanation.

### Test 5d — Where the floating ❓ does NOT appear
1. [ ] Sidebar → **Receipts**. The floating ❓ should be **absent** (this is a non-stake page).
2. [ ] Sidebar → **Help**. The floating ❓ should be **absent** (you're already in help).

---

## Test 6 — Feedback widget (1 min)

1. [ ] Open any chapter, e.g. `/help/loans`.
2. [ ] Scroll to any section's end. Find: *"Was this section helpful?"* with **Yes** / **No** buttons.
3. [ ] Click **Yes** (or **No**).
4. [ ] Within a second, the buttons should be replaced with: **✓ Thanks for the feedback!**.
5. [ ] (Optional) Open DevTools → Network tab → filter "feedback" → repeat. You should see a `POST /help/feedback` returning **204 No Content**.
6. [ ] (Optional) Tail the API logs: `pm2 logs asfinance-api --lines 20`. You should see a structured `help.feedback` event with the chapter, sectionId, lang, vote.

---

## Test 6.5 — Glossary + 404 page

1. [ ] Click sidebar → **Help** → **Glossary** card. Page shows definitions of EMI, DPD, PAR, Foreclosure, Maker-checker, etc. — each as its own anchored section.
2. [ ] In the URL bar type `/help/typo` and Enter. You should see a friendly **"We couldn't find that page"** page with suggestions linking to each real chapter (NOT the bare Next.js 404).

---

## Test 7 — Print preview (30 sec)

1. [ ] Open any chapter, e.g. `/help/collections`.
2. [ ] Click the **🖨️ Print this chapter** button top-right (or press Ctrl+P / Cmd+P).
3. [ ] In the print preview: sidebar gone, language switcher gone, feedback widgets gone, copy-link icons gone. Content fills the page. Each H2 starts on a fresh page where possible.
4. [ ] Close the print dialog without printing.

---

## Test 8 — Role-based visibility (3 min)

Logout from manager1. The "Sign out" link is at the bottom-left of the sidebar.

### As `field1` (Field Officer)
1. [ ] Login → dashboard says "Welcome back, Field Officer One."
2. [ ] **Sidebar is shorter**: no Accounting, no Cashbook, no Notifications, no Users, no Audit Logs, no Settings. **Help is still visible**.
3. [ ] Click **Help** → Help home opens — same content as everyone else.
4. [ ] Open the **Your Role** chapter. The role explanations make sense from a Field Officer's POV.

### As `accountant1` (Accountant)
1. [ ] Logout → login as `accountant1` → dashboard says "Welcome back, Head Accountant."
2. [ ] Sidebar includes **Cashbook** and **Accounting** but NOT Users/Settings.
3. [ ] Open **Cashbook**. Both ❓ icons (day-end + shortage) are visible.

### As `auditor1` (read-only Auditor)
1. [ ] Logout → login as `auditor1`.
2. [ ] Sidebar shows view-only menus including **Help** and **Audit Logs**.
3. [ ] Confirm you can browse `/help/*` freely.

---

## Test 9 — Mobile / phone size (2 min)

1. [ ] Stay logged in. Open DevTools (F12). Click the **Toggle device toolbar** button (📱 icon, or press Ctrl+Shift+M / Cmd+Shift+M).
2. [ ] Pick "iPhone 14 Pro" or set width to 390px manually.
3. [ ] Refresh the page. The desktop sidebar should collapse into a **menu button (☰)** at the top-left.
4. [ ] At the **bottom of the screen**: a tab bar with Home / Collect / Groups / More.
5. [ ] Tap **More**. The sidebar slides in. Tap **Help** → Help home loads.
6. [ ] Open any chapter, e.g. Collections. The chapter sub-TOC stacks vertically and is collapsible.
7. [ ] Navigate to `/collections/new`. The floating ❓ button is **above the bottom nav** (so it doesn't get hidden behind it).
8. [ ] In the **On your phone** subsection of the Collections chapter, the embedded mobile screenshot should look natural at this width.

Turn off the device emulator when done (Ctrl+Shift+M again).

---

## Test 10 — Cross-language sanity (1 min)

Pick a chapter you haven't read yet, e.g. **Cashbook**:

1. [ ] Visit `/help/cashbook?lang=en`. Read the **"If cash doesn't tally — the shortage SOP"** section. It should make sense in plain English, with 5 numbered steps.
2. [ ] Switch to **हिंदी**. Same section — same 5 steps, same screenshot, but in Hindi.
3. [ ] Switch to **Hinglish**. Same again, in casual Hinglish. The text should NOT feel AI-translated — it should read like a colleague wrote it (e.g. *"Shaant ho ke cash dobara gino. Zyadatar baar counting ki galti hoti hai."*).

If any Hindi or Hinglish phrasing feels stiff or unnatural, that's the place to flag — those strings live at `apps/web/src/app/(dashboard)/help/_content/cashbook.ts` and can be edited freely.

---

## Done!

If every box above ticked, V1 of the User Guide is shippable.

### What you'd see if something broke
- **Login page suddenly shown** mid-test → auth issue, restart with `pm2 restart all`.
- **❓ icon next to a button missing** → the page may need a refresh after a code change.
- **Screenshot doesn't load (broken image)** → check `apps/web/public/help/screenshots/<chapter>/<slug>.png` exists; re-run capture if not.
- **"This page could not be found" (bare Next.js 404)** instead of the custom 404 → the catch-all `help/[...slug]/page.tsx` is missing or broken.

### Where to file improvements
- **Content fixes (typo, awkward phrase):** edit the matching file under `apps/web/src/app/(dashboard)/help/_content/`.
- **New chapter:** create `_content/<slug>.ts` exporting a `ChapterContent`, add to `_content/index.ts` and `_content/chapters.ts`, then add the page at `(dashboard)/help/<slug>/page.tsx`. The catch-all in `[...slug]/page.tsx` will also auto-pick it up.
- **New ❓-icon attachment:** add a `HELP_TOPICS` entry in `packages/shared/src/constants/help-topics.ts`, then `<HelpLink topic="…">` anywhere in the app. The build test (`pnpm test src/app/\(dashboard\)/help`) fails if the topic points at a non-existent section.

### Automated tests (for the curious)
- **44 E2E tests** in `apps/web/test/e2e/help.playwright.spec.ts` cover everything above + the 7 new chapters + the new HelpLink sprinkles. Run: `cd apps/web/test && npx playwright test e2e/help.playwright.spec.ts`.
- **117 unit/coverage tests** in `apps/web/src/app/(dashboard)/help/__tests__/help-link-coverage.spec.ts` guarantee every `<HelpLink>` topic resolves and translations stay in parity across all 19 chapters.

---

## V1.5 additions — 7 new chapters covering every sidebar feature

The original V1 had 11 chapters and left 6 sidebar items underdocumented. V1.5 adds dedicated chapters for each.

### New chapters to test (in all three languages)
1. **`/help/loan-products`** — flat vs reducing examples, creating products, editing impact on existing loans.
2. **`/help/receipts`** — finding, viewing, printing, sharing on WhatsApp, what reversals do.
3. **`/help/accounting`** — Chart of Accounts, Daybook, Trial Balance, P&L, Balance Sheet, closing periods.
4. **`/help/notifications`** — SMS outbox statuses, retry, when to escalate.
5. **`/help/audit`** — reading entries, filter patterns, three real investigation walkthroughs.
6. **`/help/settings`** — every key explained, holiday-shift example, who can edit.
7. **`/help/penalties`** — calculation example, waiver workflow, maker-checker for waivers.
8. **`/help/workflows`** — six end-to-end journeys (first day for Field Officer, full lending cycle, day-end for Collection Officer, day-end for Accountant, month-end, audit-prep).

### New (?) HelpLink icons to look for
| Page | What to click |
|---|---|
| **`/loan-products`** | "How loan products work" ❓ next to "Loan Products" title |
| **`/users`** | "How to create a user" ❓ next to "User Management" title |
| **`/notifications`** | "What these statuses mean" ❓ next to "Notifications" title |
| **`/settings`** | "What each setting affects" + "Holiday calendar" ❓ next to "Settings" title (two icons) |
| **`/audit`** | "How to read and investigate" + "Filtering tips" ❓ next to "Audit Log" title |

Each click should open the corresponding new chapter at the right section.

### V1.5 quick check (5 minutes)
1. Login as `manager1` → sidebar → **Help**.
2. Confirm the chapter grid now shows **19 cards** (up from 11). The newcomers: Common Workflows, Loan Products, Receipts, Accounting, Penalties, Settings, Notifications, Audit Logs.
3. Open **Common Workflows** → switch through all 3 languages → confirm the six numbered journeys render with steps.
4. Open **Penalties** → confirm the worked example (`EMI ₹1,000 paid 15 days late = ₹8 penalty`) renders in the violet "Worked example" box.
5. Open **Accounting** → check the P&L example (₹85,000 interest, ₹38,500 net) appears.
6. Visit `/loan-products` (login as `admin` or `manager1`) → confirm ❓ next to title → click → lands at "Creating a loan product".
7. Visit `/settings` (login as `admin`) → confirm TWO ❓ icons next to title.
8. Visit `/audit` (login as `admin`) → confirm TWO ❓ icons → click "How to read and investigate" → lands at the investigation-patterns section.

If the chapter grid shows 19 cards and every ❓ above leads to the right place, V1.5 is healthy.
