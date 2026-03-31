# AS Finance LMS — Playwright E2E Tests

## Setup

```bash
# Install dependencies (from monorepo root)
pnpm install

# Install browsers
npx playwright install

# Copy env file
cp test/.env.example test/.env
```

## Running Tests

```bash
# Run all E2E tests (headless)
pnpm --filter @as-finance/web test:e2e

# Run in headed mode (see the browser)
pnpm --filter @as-finance/web test:e2e:headed

# Run with Playwright UI (interactive)
pnpm --filter @as-finance/web test:e2e:ui

# Debug a specific test
pnpm --filter @as-finance/web test:e2e:debug

# View HTML report
pnpm --filter @as-finance/web test:e2e:report
```

## Architecture

```
test/
├── playwright.config.ts       # Config: timeouts, reporters, projects
├── e2e/                       # Test specs (Given/When/Then format)
├── support/
│   ├── fixtures/              # Playwright fixtures (composable via mergeTests)
│   │   ├── index.ts           # Merged fixture export
│   │   ├── auth-fixture.ts    # JWT auth via API (7 roles)
│   │   └── api-fixture.ts     # API helper (get/post/patch/delete)
│   └── helpers/
│       ├── seed-helpers.ts    # API-based test data seeding
│       ├── cleanup.ts         # Tracked entity cleanup
│       └── selectors.ts       # data-testid selector helpers
```

## Fixtures

Import from `support/fixtures` to get auth + API capabilities:

```typescript
import { test, expect } from '../support/fixtures';

test('example', async ({ page, loginAs, api }) => {
  await loginAs('manager');
  await page.goto('/customers');
  // ...
});
```

## Best Practices

- Use `data-testid` attributes for selectors (resilient to CSS/text changes)
- Seed test data via API, not UI (10-50x faster)
- Use factories with overrides for dynamic test data
- Clean up seeded data after tests
- Keep tests independent — no shared mutable state
- Use Given/When/Then format for readability

## CI

Tests run in CI with:
- 2 workers (parallel)
- 2 retries on failure
- HTML + JUnit reporters
- Traces/screenshots/video retained on failure
