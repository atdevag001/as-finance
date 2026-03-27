---
inclusion: always
---

# AS Finance LMS — Security & Compliance Steering

## RBAC Expectations

- Role-based access control enforced at API level (NestJS guards) and route level (Next.js middleware)
- Roles: super_admin, manager, field_officer, collection_officer, accountant, office_staff, viewer_auditor
- Permissions are granular: per-module, per-action (create, read, update, delete, approve, reject, reverse, export)
- Permission matrix defined in shared constants, enforced server-side
- Frontend hides unauthorized UI elements but never relies on client-side enforcement alone
- Role assignment requires super_admin or manager authorization

## Permission Matrix Structure

Each permission entry defines:
- Module (customer, loan, collection, accounting, report, user, settings, audit)
- Action (create, read, update, delete, approve, reject, disburse, reverse, export, print)
- Allowed roles (array of role identifiers)
- Additional constraints (e.g., "own records only" for field officers)

## Sensitive Document Handling

- KYC documents (Aadhaar, PAN, photos) stored in S3-compatible storage with restricted access
- Document access via signed URLs with short expiry (15 minutes default)
- Document upload validates MIME type (image/jpeg, image/png, application/pdf only)
- File size limits: 5MB per document, configurable
- No direct public URL access to any document
- Document access logged in audit trail
- Optional encryption-at-rest for KYC documents (S3 server-side encryption)

## Secrets Handling

- All secrets (DB credentials, JWT secret, S3 keys, SMS API keys) via environment variables
- Never committed to repository
- .env.example with placeholder values only
- Startup validation fails fast on missing required secrets
- Secrets never logged, never included in error responses, never exposed in API responses

## Audit Logging Standards

Every audit log entry must include:
- `action_type`: Enum of all auditable actions
- `actor_id`: User who performed the action
- `actor_role`: Role at time of action
- `target_entity`: Entity type (customer, loan, collection, etc.)
- `target_id`: Entity identifier
- `timestamp`: UTC timestamp
- `ip_address`: Request source IP
- `request_id`: Correlation ID
- `before_state`: Relevant state before mutation (for updates)
- `after_state`: Relevant state after mutation (for updates)
- `remarks`: Optional reason/justification
- `approval_id`: Reference to approval record if maker-checker action

Finance-affecting actions are always audited. Audit logs are append-only and never deleted.

## Least Privilege

- Default deny: no access unless explicitly granted
- Field officers see only their assigned customers/loans unless manager overrides
- Collection officers see only their assigned collection routes/areas
- Accountants have read access to all finance data but limited write access
- Viewers/auditors have read-only access to everything including audit logs
- Super admin has full access but actions are still audited

## File Access Rules

- All file access goes through the document service, never direct storage access
- Signed URLs generated server-side with role verification
- Bulk download restricted to manager and above
- Document deletion is soft-delete only (mark as inactive, retain in storage)
- Access to documents of blocked/blacklisted customers requires manager authorization

## PII Masking Rules

- Aadhaar numbers: Show only last 4 digits in UI and logs (XXXX-XXXX-1234)
- PAN numbers: Show only last 4 characters in logs (XXXXXX1234)
- Mobile numbers: Full display in UI for authorized roles, masked in logs
- Customer photos: Not logged, access-controlled
- In API error responses: Never include PII
- In structured logs: PII fields automatically redacted

## Auth Standards

- JWT access tokens: Short-lived (15 minutes)
- Refresh tokens: httpOnly secure cookie, longer-lived (7 days), rotated on use
- Password hashing: bcrypt with cost factor 12+
- Password requirements: Minimum 8 characters, at least one uppercase, one lowercase, one digit
- Account lockout: After 5 failed login attempts, lock for 15 minutes
- Session invalidation on password change
- Logout invalidates refresh token

## IDOR Prevention

- All entity access verified against user's role and scope
- Never trust client-provided IDs without server-side ownership/permission check
- Collection officers can only post collections for their assigned loans
- Field officers can only access their assigned customers
- Use UUIDs for external-facing entity identifiers where practical

## Secure Upload Rules

- Validate MIME type server-side (not just file extension)
- Validate file size before processing
- Scan for common attack patterns (e.g., embedded scripts in images)
- Store with randomized filenames, never user-provided filenames
- Separate upload bucket/prefix from application assets

## Rate Limiting

- Auth endpoints: 10 requests per minute per IP
- API endpoints: 100 requests per minute per authenticated user
- File upload: 20 uploads per minute per user
- Report generation: 5 per minute per user
- SMS trigger: Rate limited by provider configuration

## Secure Error Messages

- Never expose stack traces, SQL queries, or internal paths in API responses
- Use typed error codes with user-friendly messages
- Log detailed errors server-side with correlation IDs
- Client receives error code + safe message + correlation ID for support reference

## Prevention Checklist

- XSS: React's default escaping + CSP headers + sanitize any dangerouslySetInnerHTML usage
- CSRF: SameSite cookie attribute + CSRF token for state-changing requests if using cookies
- SQL Injection: Prisma parameterized queries (never raw SQL without parameterization)
- IDOR: Server-side ownership verification on every request
- Pagination safety: Maximum page size enforced server-side (100 items default)
