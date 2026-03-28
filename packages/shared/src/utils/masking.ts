/**
 * PII masking utilities.
 * These functions mask sensitive identifiers for display in UI and logs.
 */

/**
 * Masks an Aadhaar number, showing only the last 4 digits.
 * Input: 12-digit string → Output: "XXXX-XXXX-{last4}"
 */
export function maskAadhaar(aadhaar: string): string {
  const last4 = aadhaar.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

/**
 * Masks a PAN number, showing only the last 4 characters.
 * Input: AAAAA9999A → Output: "XXXXXX{last4}"
 */
export function maskPan(pan: string): string {
  const last4 = pan.slice(-4);
  return `XXXXXX${last4}`;
}

/**
 * Masks a mobile number, showing only the last 4 digits.
 * Input: 10-digit string → Output: "XXXXXX{last4}"
 */
export function maskMobile(mobile: string): string {
  const last4 = mobile.slice(-4);
  return `XXXXXX${last4}`;
}
