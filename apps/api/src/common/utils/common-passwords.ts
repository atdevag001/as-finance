/**
 * Common-passwords blocklist for password policy enforcement.
 * Stored lowercase for case-insensitive comparison.
 *
 * Source: top entries from public breach corpora (HIBP, RockYou, etc.)
 * plus app-domain variants (asfinance, manager, officer, etc.).
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  // Top global passwords
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword', 'p@ssw0rd',
  'welcome', 'welcome1', 'welcome123', 'qwerty', 'qwerty123', 'qwertyuiop',
  '123456', '12345678', '123456789', '1234567890', 'abc123', 'abcd1234',
  'iloveyou', 'admin', 'admin123', 'administrator', 'root', 'rootroot',
  'letmein', 'letmein1', 'monkey', 'dragon', 'master', 'sunshine',
  'princess', 'football', 'baseball', 'superman', 'batman', 'shadow',
  'michael', 'jennifer', 'jordan', 'jessica',
  // App-domain variants
  'asfinance', 'asfinance1', 'asfinance123', 'finance', 'finance1', 'finance123',
  'loan', 'loan123', 'manager', 'manager1', 'manager123',
  'officer', 'officer1', 'officer123', 'staff', 'staff123',
  'test', 'test123', 'testing', 'demo', 'demo123', 'guest', 'guest123',
  'changeme', 'changeme1', 'temp', 'temp123', 'temppass',
  // Indian-context common
  'india123', 'mumbai123', 'delhi123', 'pune123', 'chennai123',
]);

/**
 * Returns true if the candidate password is in the breach/common blocklist.
 * Case-insensitive.
 */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
