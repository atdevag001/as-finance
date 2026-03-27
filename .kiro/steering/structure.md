---
inclusion: always
---

# AS Finance LMS — Project Structure Steering

## Monorepo Layout

```
as-finance-lms/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/            # App Router pages and layouts
│   │   │   ├── components/     # Shared UI components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Client utilities, API client, auth helpers
│   │   │   ├── providers/      # Context providers (auth, query, theme)
│   │   │   └── types/          # Frontend-specific types
│   │   ├── public/
│   │   └── package.json
│   └── api/                    # NestJS backend
│       ├── src/
│       │   ├── modules/        # Domain modules (customer, loan, collection, etc.)
│       │   ├── common/         # Shared guards, interceptors, filters, decorators
│       │   ├── config/         # App configuration and validation
│       │   ├── database/       # Prisma service, migrations, seeds
│       │   └── main.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       ├── test/               # E2E and integration test setup
│       └── package.json
├── packages/
│   ├── shared/                 # Shared types, enums, constants, validation schemas
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── enums/
│   │   │   ├── constants/
│   │   │   ├── validation/     # Zod schemas shared between frontend and backend
│   │   │   └── utils/          # Pure utility functions (money formatting, date helpers)
│   │   └── package.json
│   ├── config/                 # Shared ESLint, TypeScript, Prettier configs
│   │   └── package.json
│   └── testing/                # Shared test helpers, factories, fixtures
│       ├── src/
│       │   ├── factories/      # Entity factory functions
│       │   ├── fixtures/       # Static test data
│       │   └── helpers/        # Test utility functions
│       └── package.json
├── docs/
│   ├── finance-invariants.md
│   ├── receipt-template.md
│   ├── sms-templates.md
│   └── api-notes.md
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── README.md
```

## File Naming Rules

- All files: kebab-case (e.g., `loan-product.service.ts`, `create-customer.dto.ts`)
- NestJS modules: `{domain}.module.ts`, `{domain}.controller.ts`, `{domain}.service.ts`
- DTOs: `{action}-{domain}.dto.ts` (e.g., `create-loan.dto.ts`, `post-collection.dto.ts`)
- Prisma: single `schema.prisma` file, table names snake_case plural
- React components: PascalCase files (e.g., `CustomerProfile.tsx`, `LoanDetail.tsx`)
- React hooks: camelCase with `use` prefix (e.g., `useLoans.ts`, `useAuth.ts`)
- Test files: co-located as `{name}.spec.ts` or `{name}.test.ts`
- Property tests: `{name}.property.spec.ts`
- E2E tests: in dedicated `test/` or `__tests__/` directories

## Module Boundaries

Each NestJS domain module is self-contained:

```
modules/{domain}/
├── {domain}.module.ts
├── {domain}.controller.ts
├── {domain}.service.ts
├── {domain}.repository.ts      # Prisma data access abstraction
├── dto/
│   ├── create-{domain}.dto.ts
│   ├── update-{domain}.dto.ts
│   └── {domain}-query.dto.ts
├── entities/                    # Response/domain types if needed
├── guards/                      # Domain-specific guards if any
└── __tests__/
    ├── {domain}.service.spec.ts
    ├── {domain}.controller.spec.ts
    └── {domain}.property.spec.ts
```

## DTO and Validation Conventions

- Backend DTOs use class-validator decorators for request validation
- Shared Zod schemas in `packages/shared` for cross-stack validation
- All money fields typed as `number` (integer paise) in DTOs, never `string` or `float`
- All date fields as ISO 8601 strings in API, converted to Date objects in service layer
- Enum values from `packages/shared/src/enums/`

## Repository / Service Separation

- **Repository**: Data access only. Prisma queries, no business logic.
- **Service**: Business logic, validation, orchestration. Calls repository for data.
- **Transaction services**: For multi-step finance mutations, dedicated orchestration services that manage Prisma transactions.
- No direct Prisma client usage in controllers.

## Test File Placement

- Unit tests: co-located with source files as `*.spec.ts`
- Integration tests: in module `__tests__/` directories
- E2E tests: in `apps/api/test/` and `apps/web/test/`
- Property tests: co-located as `*.property.spec.ts`
- Test factories: in `packages/testing/src/factories/`

## Domain Module Conventions

- No cross-module direct Prisma access (module A must not query module B's tables directly)
- Cross-module communication via exported service methods
- Finance-critical cross-module operations via transaction orchestration services
- Shared types and enums via `packages/shared`
- No finance calculation logic in controllers or repositories
