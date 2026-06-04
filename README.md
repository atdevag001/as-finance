# AS-Finance LMS

Production-grade microfinance loan management system built with NestJS (API) and Next.js (Web).

## Features

- **Loan Lifecycle**: Draft → Approval → Disbursement → Active → Closed/Foreclosed
- **Collections**: Cash/bank payments with real-time allocation to penalty/interest/principal
- **Group Lending**: Joint liability groups with atomic multi-member collections
- **Accounting**: Double-entry ledger, journal entries, trial balance, period close
- **Scheduling**: EMI generation (flat/reducing balance, daily/weekly/monthly)
- **Penalties**: Configurable overdue penalties with grace periods
- **Foreclosure**: Early settlement with pro-rata interest calculation
- **RBAC**: 7 roles (super_admin, manager, field_officer, collection_officer, accountant, office_staff, viewer_auditor)
- **Audit Trail**: Immutable audit logs for all sensitive operations

## Tech Stack

| Layer | Technology |
|-------|------------|
| API | NestJS 10, Prisma 5, PostgreSQL 15 |
| Web | Next.js 14, React 18, TailwindCSS, React Query |
| Auth | JWT (access + refresh tokens), bcrypt, CSRF protection |
| Storage | S3-compatible (MinIO for dev) |
| Testing | Vitest (unit/integration), Playwright (E2E) |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL and MinIO)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd as-finance
pnpm install

# Start databases
docker compose up -d

# Configure environment
cp .env.example .env
# Edit .env with your values

# Run migrations and seed
pnpm db:migrate
pnpm db:seed

# Start development servers
pnpm dev:api   # API at http://localhost:3001
pnpm dev:web   # Web at http://localhost:3000
```

### Default Credentials (Development)

| Role | Username | Password |
|------|----------|----------|
| Super Admin | admin | Admin@123 |
| Manager | manager | Manager@123 |
| Field Officer | officer1 | Officer@123 |

## Project Structure

```
as-finance/
├── apps/
│   ├── api/                 # NestJS backend
│   │   ├── prisma/          # Schema and migrations
│   │   └── src/
│   │       ├── common/      # Guards, filters, interceptors, utils
│   │       └── modules/     # Feature modules (loan, collection, etc.)
│   └── web/                 # Next.js frontend
│       └── src/
│           ├── app/         # App router pages
│           ├── components/  # UI components
│           ├── hooks/       # React Query hooks
│           └── lib/         # API client, utils
├── packages/
│   ├── shared/              # Shared types, validation, utils
│   ├── config/              # ESLint, TypeScript configs
│   └── testing/             # Test utilities
└── docs/                    # Additional documentation
```

## Scripts

```bash
# Development
pnpm dev:api              # Start API with hot reload
pnpm dev:web              # Start web with hot reload

# Testing
pnpm test                 # Run all tests
pnpm --filter @as-finance/api test:unit        # API unit tests
pnpm --filter @as-finance/api test:integration # API integration tests
pnpm --filter @as-finance/web test:e2e         # Playwright E2E tests

# Database
pnpm db:migrate           # Run migrations (dev)
pnpm db:migrate:deploy    # Run migrations (prod)
pnpm db:seed              # Seed development data
pnpm db:studio            # Open Prisma Studio

# Build
pnpm build                # Build all packages
```

## API Documentation

Swagger UI available at `http://localhost:3001/api/docs` when running the API.

## Environment Variables

See [.env.example](.env.example) for all available variables.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret for JWT signing (min 64 chars in production)
- `CORS_ORIGINS` — Comma-separated allowed origins
- `S3_*` — Object storage configuration

## Deployment

```bash
# Build for production
pnpm build

# Run with PM2
pm2 start ecosystem.config.cjs

# Or run directly
NODE_ENV=production node apps/api/dist/main.js
NODE_ENV=production npx next start -p 3000
```

## Architecture Notes

### Money Handling
- All monetary values stored as integer paise (1 INR = 100 paise)
- BigInt used for aggregates to prevent overflow
- Decimal.js for calculations with ROUND_HALF_UP

### Date Handling
- All dates stored as UTC in PostgreSQL
- IST conversion at application layer for Indian business logic
- Date-only fields (due dates, DOB) use `@db.Date` to avoid timezone issues

### Transaction Isolation
- Critical operations (loan approval, collection, reversal) wrapped in Prisma transactions
- FOR UPDATE locks on loan rows during concurrent writes
- Idempotency keys on mutation endpoints

## License

Proprietary — All rights reserved.
