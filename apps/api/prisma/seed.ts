/* eslint-disable no-console */
/**
 * Prisma seed script — idempotent (safe to run multiple times via upsert).
 *
 * Seeds:
 *  1. Chart of accounts (assets, income, expenses, equity)
 *  2. System settings (holiday calendar, rate bounds, penalty grace, group size)
 *  3. Sample users (one per role, bcrypt-hashed passwords)
 *  4. Sample customers
 *  5. Sample loan products with versions
 *
 * Run: pnpm --filter @as-finance/api db:seed
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── 1. Chart of Accounts ────────────────────────────────────────────────────

const CHART_OF_ACCOUNTS = [
  { code: '1001', name: 'Cash', category: 'asset' as const },
  { code: '1002', name: 'Bank', category: 'asset' as const },
  { code: '1100', name: 'Loans Receivable', category: 'asset' as const },
  { code: '4001', name: 'Interest Income', category: 'income' as const },
  { code: '4002', name: 'Processing Fee Income', category: 'income' as const },
  { code: '4003', name: 'Penalty Income', category: 'income' as const },
  { code: '4004', name: 'Other Income', category: 'income' as const },
  { code: '5001', name: 'Salary Expense', category: 'expense' as const },
  { code: '5002', name: 'Rent Expense', category: 'expense' as const },
  { code: '5003', name: 'Travel Expense', category: 'expense' as const },
  { code: '5004', name: 'Office Expense', category: 'expense' as const },
  { code: '5099', name: 'Other Expense', category: 'expense' as const },
  { code: '3001', name: "Owner's Equity", category: 'equity' as const },
];

async function seedChartOfAccounts() {
  console.log('Seeding chart of accounts...');
  for (const account of CHART_OF_ACCOUNTS) {
    await prisma.chart_of_accounts.upsert({
      where: { code: account.code },
      update: { name: account.name, category: account.category },
      create: {
        code: account.code,
        name: account.name,
        category: account.category,
        is_system: true,
        is_active: true,
      },
    });
  }
  console.log(`  ✓ ${CHART_OF_ACCOUNTS.length} accounts seeded`);
}


// ─── 2. System Settings ──────────────────────────────────────────────────────

const SYSTEM_SETTINGS = [
  {
    key: 'holiday_calendar',
    value: [] as string[],
    description: 'List of holiday dates (ISO format) — populated by admin',
  },
  {
    key: 'max_annual_rate_bps',
    value: 36000,
    description: 'Maximum annual interest rate in basis points (360%)',
  },
  {
    key: 'min_annual_rate_bps',
    value: 100,
    description: 'Minimum annual interest rate in basis points (1%)',
  },
  {
    key: 'default_penalty_grace_days',
    value: 7,
    description: 'Default grace period (days) before penalty applies',
  },
  {
    key: 'max_group_size',
    value: 15,
    description: 'Maximum members allowed in a lending group',
  },
  {
    key: 'min_group_size',
    value: 5,
    description: 'Minimum members required for a lending group',
  },
];

async function seedSettings() {
  console.log('Seeding system settings...');
  for (const setting of SYSTEM_SETTINGS) {
    await prisma.settings.upsert({
      where: { key: setting.key },
      update: { value: setting.value as any, description: setting.description },
      create: {
        key: setting.key,
        value: setting.value as any,
        description: setting.description,
      },
    });
  }
  console.log(`  ✓ ${SYSTEM_SETTINGS.length} settings seeded`);
}


// ─── 3. Sample Users ─────────────────────────────────────────────────────────

const DEFAULT_PASSWORD = 'Admin@123';
const BCRYPT_ROUNDS = 12;

interface SeedUser {
  username: string;
  fullName: string;
  mobile: string;
  email: string | null;
  role:
    | 'super_admin'
    | 'manager'
    | 'field_officer'
    | 'collection_officer'
    | 'accountant'
    | 'office_staff'
    | 'viewer_auditor';
}

const SAMPLE_USERS: SeedUser[] = [
  {
    username: 'admin',
    fullName: 'System Administrator',
    mobile: '9000000001',
    email: 'admin@asfinance.local',
    role: 'super_admin',
  },
  {
    username: 'manager1',
    fullName: 'Branch Manager',
    mobile: '9000000002',
    email: 'manager@asfinance.local',
    role: 'manager',
  },
  {
    username: 'field1',
    fullName: 'Field Officer One',
    mobile: '9000000003',
    email: null,
    role: 'field_officer',
  },
  {
    username: 'collector1',
    fullName: 'Collection Officer One',
    mobile: '9000000004',
    email: null,
    role: 'collection_officer',
  },
  {
    username: 'accountant1',
    fullName: 'Head Accountant',
    mobile: '9000000005',
    email: 'accountant@asfinance.local',
    role: 'accountant',
  },
  {
    username: 'staff1',
    fullName: 'Office Staff One',
    mobile: '9000000006',
    email: null,
    role: 'office_staff',
  },
  {
    username: 'auditor1',
    fullName: 'External Auditor',
    mobile: '9000000007',
    email: 'auditor@asfinance.local',
    role: 'viewer_auditor',
  },
];

async function seedUsers() {
  console.log('Seeding sample users...');
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  for (const user of SAMPLE_USERS) {
    await prisma.users.upsert({
      where: { username: user.username },
      update: {
        full_name: user.fullName,
        role: user.role,
        password_hash: passwordHash,
      },
      create: {
        username: user.username,
        password_hash: passwordHash,
        full_name: user.fullName,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        is_active: true,
      },
    });
  }
  console.log(`  ✓ ${SAMPLE_USERS.length} users seeded (password: ${DEFAULT_PASSWORD})`);
}


// ─── 4. Sample Customers ─────────────────────────────────────────────────────

async function seedCustomers() {
  console.log('Seeding sample customers...');

  // Get the field officer to assign as created_by / assigned_officer
  const fieldOfficer = await prisma.users.findUnique({ where: { username: 'field1' } });
  if (!fieldOfficer) {
    console.log('  ⚠ Skipping customers — field officer not found (seed users first)');
    return;
  }

  const customers = [
    {
      full_name: 'Rajesh Kumar',
      father_or_husband_name: 'Mohan Kumar',
      mobile: '9100000001',
      aadhaar_number_encrypted: 'encrypted_123456789012',
      aadhaar_last_four: '9012',
      pan_number_encrypted: 'encrypted_ABCDE1234F',
      pan_last_four: '234F',
      gender: 'male',
      occupation: 'Shopkeeper',
      monthly_income_paise: BigInt(3000000), // ₹30,000
      address_line1: '45 Market Road',
      city: 'Jaipur',
      district: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302001',
    },
    {
      full_name: 'Sunita Devi',
      father_or_husband_name: 'Ramesh Sharma',
      mobile: '9100000002',
      aadhaar_number_encrypted: 'encrypted_234567890123',
      aadhaar_last_four: '0123',
      pan_number_encrypted: null,
      pan_last_four: null,
      gender: 'female',
      occupation: 'Tailor',
      monthly_income_paise: BigInt(2000000), // ₹20,000
      address_line1: '12 Gandhi Nagar',
      city: 'Udaipur',
      district: 'Udaipur',
      state: 'Rajasthan',
      pincode: '313001',
    },
    {
      full_name: 'Amit Patel',
      father_or_husband_name: 'Suresh Patel',
      mobile: '9100000003',
      aadhaar_number_encrypted: 'encrypted_345678901234',
      aadhaar_last_four: '1234',
      pan_number_encrypted: 'encrypted_FGHIJ5678K',
      pan_last_four: '678K',
      gender: 'male',
      occupation: 'Farmer',
      monthly_income_paise: BigInt(2500000), // ₹25,000
      address_line1: '78 Village Road',
      city: 'Jodhpur',
      district: 'Jodhpur',
      state: 'Rajasthan',
      pincode: '342001',
    },
  ];

  for (const cust of customers) {
    const existing = await prisma.customers.findFirst({
      where: { mobile: cust.mobile },
    });
    if (!existing) {
      await prisma.customers.create({
        data: {
          ...cust,
          risk_level: 'medium',
          status: 'active',
          assigned_officer_id: fieldOfficer.id,
          created_by: fieldOfficer.id,
        },
      });
    }
  }
  console.log(`  ✓ ${customers.length} customers seeded`);
}


// ─── 5. Sample Loan Products ─────────────────────────────────────────────────

async function seedLoanProducts() {
  console.log('Seeding sample loan products...');

  const manager = await prisma.users.findUnique({ where: { username: 'manager1' } });
  if (!manager) {
    console.log('  ⚠ Skipping loan products — manager not found (seed users first)');
    return;
  }

  const products = [
    {
      name: 'Standard Flat Monthly',
      version: {
        interest_type: 'flat' as const,
        annual_rate_bps: 1200,
        min_principal_paise: BigInt(1000000), // ₹10,000
        max_principal_paise: BigInt(50000000), // ₹5,00,000
        min_tenure_months: 3,
        max_tenure_months: 36,
        repayment_frequency: 'monthly' as const,
        processing_fee_type: 'percentage' as const,
        processing_fee_value: 200, // 2% of principal
        penalty_grace_days: 7,
        penalty_type: 'flat_per_period' as const,
        penalty_value: 10000, // ₹100 flat per period
        penalty_frequency: 'monthly' as const,
        max_concurrent_loans: 2,
        allocation_order: ['penalty', 'interest', 'principal'],
      },
    },
    {
      name: 'Reducing Balance Monthly',
      version: {
        interest_type: 'reducing_balance' as const,
        annual_rate_bps: 1800,
        min_principal_paise: BigInt(5000000), // ₹50,000
        max_principal_paise: BigInt(100000000), // ₹10,00,000
        min_tenure_months: 6,
        max_tenure_months: 24,
        repayment_frequency: 'monthly' as const,
        processing_fee_type: 'fixed' as const,
        processing_fee_value: 50000, // ₹500 fixed
        penalty_grace_days: 7,
        penalty_type: 'percentage_of_overdue' as const,
        penalty_value: 200, // 2% of overdue amount
        penalty_frequency: 'monthly' as const,
        max_concurrent_loans: 1,
        allocation_order: ['penalty', 'interest', 'principal'],
      },
    },
  ];

  for (const prod of products) {
    // Check if product already exists
    const existing = await prisma.loan_products.findUnique({
      where: { name: prod.name },
    });

    if (existing) {
      console.log(`  → Product "${prod.name}" already exists, skipping`);
      continue;
    }

    // Create product and version in a transaction
    await prisma.$transaction(async (tx) => {
      const product = await tx.loan_products.create({
        data: {
          name: prod.name,
          is_active: true,
          created_by: manager.id,
        },
      });

      const version = await tx.loan_product_versions.create({
        data: {
          product_id: product.id,
          version_number: 1,
          ...prod.version,
          is_active: true,
        },
      });

      // Link current version
      await tx.loan_products.update({
        where: { id: product.id },
        data: { current_version_id: version.id },
      });
    });

    console.log(`  → Created product "${prod.name}"`);
  }
  console.log(`  ✓ Loan products seeded`);
}


// ─── SMS Templates ───────────────────────────────────────────────────────────

async function seedSmsTemplates() {
  console.log('📱 Seeding SMS templates...');

  const templates = [
    {
      event_type: 'loan_approved' as const,
      language: 'en',
      template_body:
        'Dear {{customerName}}, your loan {{loanNumber}} of Rs.{{amount}} has been approved by AS Finance. Please visit the branch for disbursement.',
    },
    {
      event_type: 'loan_rejected' as const,
      language: 'en',
      template_body:
        'Dear {{customerName}}, your loan application {{loanNumber}} has not been approved. Please visit the AS Finance branch for details.',
    },
    {
      event_type: 'disbursed' as const,
      language: 'en',
      template_body:
        'Dear {{customerName}}, Rs.{{amount}} has been disbursed for your loan {{loanNumber}} from AS Finance. Your first EMI of Rs.{{emiAmount}} is due on {{dueDate}}.',
    },
    {
      event_type: 'collection_receipt' as const,
      language: 'en',
      template_body:
        'Dear {{customerName}}, payment of Rs.{{amount}} received for loan {{loanNumber}}. Receipt: {{receiptNumber}}. Outstanding: Rs.{{outstanding}}. Thank you - AS Finance.',
    },
    {
      event_type: 'emi_reminder' as const,
      language: 'en',
      template_body:
        'Dear {{customerName}}, your EMI of Rs.{{emiAmount}} for loan {{loanNumber}} is due on {{dueDate}}. Please arrange payment. - AS Finance',
    },
    {
      event_type: 'overdue_reminder' as const,
      language: 'en',
      template_body:
        'Dear {{customerName}}, your EMI of Rs.{{emiAmount}} for loan {{loanNumber}} is overdue by {{dpd}} days. Please pay immediately to avoid penalty. - AS Finance',
    },
    {
      event_type: 'penalty_notice' as const,
      language: 'en',
      template_body:
        'Dear {{customerName}}, a penalty of Rs.{{amount}} has been applied to your loan {{loanNumber}} due to overdue payment. Please clear your dues. - AS Finance',
    },
    {
      event_type: 'daily_collection_summary' as const,
      language: 'en',
      template_body:
        'AS Finance Daily Summary: Collections today Rs.{{totalCollected}} across {{loanCount}} loans. Outstanding target: Rs.{{targetAmount}}. - AS Finance',
    },
  ];

  for (const tpl of templates) {
    await prisma.sms_templates.upsert({
      where: {
        idx_sms_templates_event_lang: {
          event_type: tpl.event_type,
          language: tpl.language,
        },
      },
      update: { template_body: tpl.template_body },
      create: tpl,
    });
  }

  console.log(`  ✓ ${templates.length} SMS templates seeded`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting seed...\n');

  await seedChartOfAccounts();
  await seedSettings();
  await seedUsers();
  await seedCustomers();
  await seedLoanProducts();
  await seedSmsTemplates();

  console.log('\n✅ Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
