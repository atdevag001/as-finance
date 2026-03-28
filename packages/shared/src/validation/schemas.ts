import { z } from 'zod';

/** Aadhaar: exactly 12 digits */
export const aadhaarSchema = z.string().regex(/^\d{12}$/, 'Aadhaar must be exactly 12 digits');

/** PAN: 5 uppercase letters, 4 digits, 1 uppercase letter */
export const panSchema = z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Invalid PAN format');

/** Indian mobile: 10 digits starting with 6-9 */
export const mobileSchema = z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number');

/** Pincode: exactly 6 digits */
export const pincodeSchema = z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits');

/** Money in paise: positive integer */
export const paiseSchema = z.number().int().positive('Amount must be positive integer paise');

/** Password: min 8 chars, at least one uppercase, one lowercase, one digit */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one digit');

/** Create customer request schema — shared between frontend and backend */
export const createCustomerSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  fatherOrHusbandName: z.string().max(200).optional(),
  mobile: mobileSchema,
  alternateMobile: mobileSchema.optional(),
  aadhaarNumber: aadhaarSchema,
  panNumber: panSchema.optional(),
  dob: z.string().optional(),
  age: z.number().int().min(18).max(120).optional(),
  gender: z.enum(['male', 'female', 'other']),
  occupation: z.string().max(200).optional(),
  monthlyIncomePaise: paiseSchema.optional(),
  workOrBusinessDetails: z.string().optional(),
  addressLine1: z.string().min(1, 'Address is required').max(500),
  addressLine2: z.string().max(500).optional(),
  city: z.string().min(1, 'City is required').max(100),
  district: z.string().min(1, 'District is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pincode: pincodeSchema,
  notes: z.string().optional(),
});
