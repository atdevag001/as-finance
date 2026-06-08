# Help Content Authoring Guide

The audience is a non-technical branch employee — a field officer, branch manager, accountant, or auditor. Many work in tier-2/3 towns, on phones, in patchy signal. Write for them.

## The rules

1. **Tasks, not features.** Every section heading should be something the reader wants to *do*, not a feature description.
2. **Show the panic moment.** Include error-state screenshots and clear "what to do when X" copy. Don't only show the happy path.
3. **Reassure, don't threaten.** Use the `<Reassure>` callout for things like reversals and blacklists — "mistakes happen", not "this is logged."
4. **Worked numbers beat abstract rules.** When explaining EMI, GST, holidays, group splits — use a concrete ₹ example in an `<Example>` callout.
5. **Mobile-first.** Test every chapter at 390px wide. If a screenshot needs a phone variant, capture it.
6. **App labels stay in English.** Even in the Hindi and Hinglish versions. "Approve" stays "Approve" — that's what's on the button.

## Reading level

| Language | Target |
|---|---|
| **English (simple)** | 8th-grade. Avg ≤18 words per sentence. No acronyms on first use (expand once, then OK to abbreviate). Active voice. |
| **हिंदी** | Simple business Hindi, formal-warm (`आप`). Arabic numerals (123, not १२३). ₹ symbol. App labels in English. |
| **Hinglish** | Roman-script Hindi-English mix as Indian office staff actually message. Verbs in English when matching the button ("submit kar do", "approve karein"). |

## Hinglish — the anti-AI smell test

**Banned words** (these flag AI-generated copy):
- ❌ `kripaya`, `dhanyavaad`, `pradarshit`, `prakriya`, `kripya`
- ❌ Sanskrit transliteration: `vyavastha`, `anudesh`, `kriya`
- ❌ Double `aap`s ("aap aap please…")

**Preferred patterns**:
- ✅ Keep verbs in English where they match buttons: "submit kar do", "approve karein", "reject mat karo"
- ✅ Thanks → "thanks", please → "please" (or just drop)
- ✅ Imperatives:
  - `karein` — polite default ("padhein", "bharo", "click karein")
  - `kar do` — casual, peer-to-peer ("send kar do", "save kar do")
  - `karna hai` — instructional ("ye karna hai")

**Before/after examples**:

| ❌ Stiff (AI smell) | ✅ Real Hinglish |
|---|---|
| "Kripaya naye customer ki jaankari pradarshit karein" | "Naye customer ki details bhar do — Aadhaar aur mobile pakka check karein" |
| "Loan ko submit karne hetu Submit button ka prayog karein" | "Loan submit karne ke liye Submit dabao" |
| "Yadi koi truti dikhe to apne manager ko soochit karein" | "Kuch error dikhe to manager ko bata do" |
| "Vyavastha prati submit ke liye unique ticket utpann karta hai" | "System har submit ke liye unique ticket banata hai" |
| "Reversal prakriya ko sampann karne ke liye" | "Reversal complete karne ke liye" |

## File structure

```
_content/
├── _types.ts                  # ChapterContent, Section, Step types
├── chapters.ts                # Display order for home grid + sidebar
├── index.ts                   # Re-exports all chapters
├── glossary-terms.ts          # GLOSSARY map for <Term> component
├── getting-started.ts         # one file per chapter
├── roles.ts
└── …
```

Each chapter file exports a `ChapterContent` with `en`, `hi`, `hinglish` variants of the same structure. The structure must match across languages — translators only edit strings, never sections or steps.

## How to add a new chapter

1. Create `_content/<chapter-id>.ts` exporting a `ChapterContent`.
2. Add the import + entry in `_content/index.ts`.
3. Add an entry in `_content/chapters.ts` for the home grid.
4. Create `<chapter-id>/page.tsx` — just a thin wrapper that imports the content and renders `<HelpChapter chapter={content} />`.
5. If you reference a `HELP_TOPICS` entry that points to this chapter, ensure the section ids match.

## Components available in content

These do not exist in the content data model directly — the `<HelpChapter>` renderer translates section fields into them:

- `section.body` → plain paragraph
- `section.steps` → numbered `<StepList>`
- `section.tip` → `<Tip>` info box
- `section.warning` → `<Warning>` amber box
- `section.reassure` → `<Reassure>` green box (use for blame-free copy)
- `section.example` → `<ExampleBox>` violet box (use for worked numeric examples)
- `section.screenshot` → `<Screenshot>` with lazy-load + tap-to-zoom
- `section.errorGallery` → grid of "what error states look like"

In running prose, use `<Term id="emi">EMI</Term>` to underline a jargon term and link to the glossary tooltip.

## Maintenance metadata

Every chapter must have a `meta` block:
```ts
meta: {
  lastReviewed: '2026-06-08',   // ISO date — drives the >180d stale banner
  reviewedBy: 'username',        // who last touched the content
  appVersion: '1.0.0',           // version of AS-Finance at review time
}
```

Update `lastReviewed` whenever you make a meaningful change to the chapter.
