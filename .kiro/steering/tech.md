---
inclusion: always
---

# AS Finance LMS — Technology Steering

## Monorepo Architecture

- Package manager: pnpm with workspaces
- Root `pnpm-workspace.yaml` defines workspace packages

## Frontend Stack

- Framework: Next.js 14+ with App Router
- Language: TypeScript (strict mode)
- Styling: Tailwind CSS
- Component library: shadcn/ui
- Forms: React Hook Form + Zod validation
- Server state: TanStack Query (React Query)
- Route-level authorization enforced
- Mobile-first responsive design

## Backend Stack

- Framework: NestJS with modular architecture
- Language: TypeScript (strict mode)
- ORM: Prisma with PostgreSQL
- API style: RESTful with explicit action endpoints for state transitions
- API documentation: OpenAPI / Swagger auto-generated
- Auth: JWT with refresh token flow (access token short-lived, refresh token httpOnly cookie)
- Validation: class-validator + class-transformer on DTOs, Zod on shared schemas

## Database

- PostgreSQL 15+
- Prisma for schema management and migrations
- Explicit indexing strategy for query-heavy tables
- Referential integrity enforced at database level
- Soft delete only where explicitly safe; immutable finance history never soft-deleted

## Testing Stack

- Unit/Integration: Vitest
- E2E API: Supertest with Vitest
- E2E UI: Playwright
- Property-based: fast-check with Vitest
- Coverage: v8 provider via Vitest
- Test factories: custom factory helpers in packages/testing

## Infrastructure

- Docker + docker-compose for local development
- PostgreSQL container
- MinIO (S3-compatible) container for document storage
- Environment configuration via .env files with validation (Zod or envalid)

## Document Storage

- S3-compatible abstraction (works with MinIO locally, AWS S3 or equivalent in production)
- Signed URLs for secure document access with expiry
- MIME type and file size validation on upload
- Separate buckets or prefixes for KYC documents, loan documents, receipts

## SMS / Notification

- Pluggable SMS provider abstraction (interface-based)
- Async outbox pattern for notification dispatch
- SMS failure must never roll back valid finance posting
- Retry-safe design with dead-letter handling for persistent failures
- Template-based messages, English/Hindi-ready

## Logging & Observability

- Structured JSON logs (pino or winston structured)
- Request ID propagation on every request
- Audit ID and finance action correlation IDs on finance mutations
- Health check endpoints
- No sensitive data (PII, tokens, passwords) in logs

## Money & Decimal Rules

- **Persisted money**: integer paise (1 INR = 100 paise)
- **Intermediate calculations**: Decimal.js or equivalent safe decimal library
- **No binary floating point** for any persisted or calculated money value
- **Rounding**: explicit half-up (ROUND_HALF_UP), documented per calculation boundary
- Display formatting: INR with proper comma grouping (Indian numbering system)

## Timezone & Date Rules

- Server timezone: UTC internally
- Business date logic: Asia/Kolkata (IST)
- All user-facing dates displayed in IST
- Due date calculations use IST business dates
- Timestamps stored as UTC, converted for display

## Migration Rules

- Every schema change via Prisma migration
- Migrations must be reversible or have documented rollback strategy
- No data-destructive migrations without explicit approval
- Seed data for development and testing maintained separately
- Migration tests verify up/down safety

## CI Quality Gates

- TypeScript compilation: zero errors
- Lint (ESLint): zero errors
- Format (Prettier): consistent
- All unit tests pass
- All integration tests pass
- All critical e2e tests pass
- No float-based money persistence
- OpenAPI docs generated and valid
- Finance domain coverage meets threshold
- No failing migrations

## Environment Configuration

- Validated at startup (fail-fast on missing required config)
- Separate configs for development, test, staging, production
- Secrets never committed to repository
- Database URLs, JWT secrets, S3 credentials, SMS API keys via environment variables
