---
inclusion: always
---

# AS Finance — Loan Management System — Product Steering

## Product Purpose

AS Finance LMS is a production-grade, fullstack web application for managing the complete lending lifecycle of AS Finance, a lending company operating in small cities and villages in India. The system must be finance-safe, audit-friendly, field-usable, and operationally reliable.

## Target Users

| Persona | Context |
|---|---|
| Super Admin / Owner | Full system control, business oversight |
| Manager | Branch/area oversight, approvals, reports |
| Field Officer | Customer onboarding, loan applications, field visits |
| Collection Officer | Daily collections, receipt generation, cash handover |
| Accountant | Ledger, cashbook, expenses, reconciliation, reports |
| Office Staff / Data Entry | Data entry, document uploads, loan processing |
| Viewer / Auditor | Read-only access to all data, audit logs, reports |

## Operating Environment

- Small-city and village branches in India
- Unreliable network connectivity in field operations
- Mobile devices for collection officers (Android browsers primarily)
- Desktop/laptop for office staff and managers
- Low digital literacy among some operators — UI must be simple, explicit, forgiving

## Core Business Goals

1. Accurate and deterministic EMI/repayment schedule generation
2. Accurate outstanding balance tracking at all times
3. Safe and auditable collection posting with duplicate prevention
4. Explainable ledger that reconciles with loan events
5. Strong field usability for collection officers on mobile
6. Audit-grade mutation history for every finance-affecting action
7. Safe approval, reversal, and correction workflows
8. Reliable and traceable reports

## Risk Profile

- **High risk**: Money movement (disbursement, collection, reversal, penalty, foreclosure)
- **Medium risk**: Loan approval, schedule generation, accounting entries
- **Low risk**: Customer data entry, document uploads, notification dispatch

Every high-risk action must be transaction-safe, auditable, idempotent where applicable, and protected by authorization checks.

## Practical UX Expectations

- Mobile-first for collection workflows
- Desktop-optimized for office/accounting workflows
- Large touch-friendly buttons for field use
- Explicit success/failure messaging — no ambiguous states
- Confirm dialogs for all destructive or finance-affecting actions
- No optimistic UI for finance mutations — wait for authoritative server response
- Loading states for all remote actions
- Status badges and overdue highlighting throughout
- Fast data entry with keyboard-friendly forms
- Printable receipts

## Why Financial Correctness Matters

AS Finance handles real money from real people in economically vulnerable communities. A rounding error, a duplicate posting, a silent balance drift, or a missing audit trail can cause:
- Direct financial loss to the company or customer
- Regulatory risk
- Loss of trust in the community
- Unrecoverable accounting discrepancies

Every design and implementation decision must prioritize financial correctness over developer convenience.

## Customer-Facing Correctness vs Operator Usability

- **Customer-facing correctness**: Receipts, outstanding amounts, schedule views, and payment confirmations must be mathematically accurate and legally defensible.
- **Operator usability**: Workflows must be simple, forgiving of non-critical mistakes, and guide operators toward correct actions. But operator convenience must never compromise financial correctness.
