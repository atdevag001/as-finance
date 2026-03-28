-- AS Finance LMS — Initial Migration
-- This migration creates the database sequences used for generating
-- human-readable, sequential identifiers for receipts and loans.

-- Receipt number sequence: generates sequential numbers for receipt IDs
-- Format: RCP-{year}-{padded_number} (e.g., RCP-2024-00001)
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq;

-- Loan number sequence: generates sequential numbers for loan IDs
-- Format: LN-{year}-{padded_number} (e.g., LN-2024-00001)
CREATE SEQUENCE IF NOT EXISTS loan_number_seq;
