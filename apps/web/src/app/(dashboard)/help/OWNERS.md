# Help Section — Ownership and RACI

The user guide lives or rots based on whether someone keeps it current. Without explicit ownership, "someone" = nobody. This file makes ownership explicit.

## RACI

| Role | Who | What they do |
|---|---|---|
| **R**esponsible (does the work) | Engineer shipping the feature | Updates the relevant chapter and screenshots in the same PR as the feature change. |
| **A**ccountable (signs off) | Help maintainer | Reviews content PRs, runs the screenshot script periodically, addresses 👎 feedback. |
| **C**onsulted (advises) | Native Hindi/Hinglish reviewer | Reviews any PR touching `_content/**/{hi,hinglish}` strings for tone. |
| **I**nformed (kept in the loop) | Branch manager rep | Notified of major rewrites so they can pass along to staff. |

## CODEOWNERS

When `.github/CODEOWNERS` lands, this folder should be covered as:

```
apps/web/src/app/(dashboard)/help/                    @help-maintainer
apps/web/src/app/(dashboard)/help/_content/           @help-maintainer @hindi-reviewers
packages/shared/src/constants/help-topics.ts          @help-maintainer
```

(The teams `@help-maintainer` and `@hindi-reviewers` need to exist in the GitHub org — assign at least one human to each.)

## PR checklist (lives in .github/PULL_REQUEST_TEMPLATE.md)

Every PR template should include:
```
- [ ] User guide updated, or N/A — reviewer confirms
```

If a PR changes a route, button label, permission, or workflow, the box must be ticked. If not applicable, the reviewer marks N/A.

## Stale detection

- Each chapter has `meta.lastReviewed`. The `<LastReviewed>` footer shows it to readers.
- Anything older than 180 days renders an amber banner ("This chapter was last reviewed more than 6 months ago…").
- A planned CI check (V1.1) opens an issue once `lastReviewed` is older than 210 days — three weeks of grace before the banner reaches the reader.

## Screenshot cadence

- The capture script (`scripts/capture-help-screenshots.ts`) drives Playwright through every key screen using the seed-DB test users.
- Run on demand for the first ship.
- Planned (V1.1): monthly cron that re-captures and opens a draft PR if any hash differs from the committed `screenshots.manifest.json`. The maintainer reviews and merges.

## Translation review workflow

1. Engineer drafts English + Hindi + Hinglish in the content TS module.
2. PR is opened — the GH Action `lang-review-required` (V1.1) labels it and adds `@hindi-reviewers` as reviewer.
3. Hindi reviewer comments inline on tone/wording in `hi` and `hinglish` blocks.
4. Engineer edits in the TS file (no separate translation files — strings live with the structure).
5. Once Hindi reviewer approves, merge.

Until the GH Action lands (V1.1), the engineer flags `lang-review-required` in the PR description and pings the reviewer manually.

## Feedback handling

- `<Feedback>` posts to `/api/help/feedback` per section.
- V1: writes only; a weekly query of 👎 votes goes to the help maintainer.
- V1.1: admin dashboard at `/help/admin/feedback` for super-admin to triage.
