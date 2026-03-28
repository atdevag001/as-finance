import { Decimal } from 'decimal.js';

// Configure Decimal.js for financial calculations: ROUND_HALF_UP
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Converts integer paise to Decimal rupees.
 * Rounding: none (exact division by 100).
 * @param paise - integer paise value
 * @returns Decimal representing rupees
 */
export function paiseToDec(paise: number): Decimal {
  return new Decimal(paise).dividedBy(100);
}

/**
 * Converts Decimal rupees to integer paise with ROUND_HALF_UP.
 * Rounding point: final conversion to integer paise.
 * @param dec - Decimal rupees value
 * @returns integer paise
 */
export function decToPaise(dec: Decimal): number {
  return dec.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Formats paise as INR with Indian comma grouping.
 * Indian grouping: last 3 digits, then groups of 2.
 * Example: 12345678 paise → "₹1,23,456.78"
 *
 * @param paise - integer paise value
 * @returns formatted INR string
 */
export function formatINR(paise: number): string {
  const rupees = paiseToDec(paise);
  const [intPart, decPart = '00'] = rupees.toFixed(2).split('.');

  // Handle negative numbers
  const isNegative = intPart!.startsWith('-');
  const absIntPart = isNegative ? intPart!.slice(1) : intPart!;

  // Indian comma grouping: last 3 digits, then groups of 2
  let formatted: string;
  if (absIntPart.length <= 3) {
    formatted = absIntPart;
  } else {
    const lastThree = absIntPart.slice(-3);
    const remaining = absIntPart.slice(0, -3);
    // Group remaining digits in pairs from right
    const pairs = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formatted = `${pairs},${lastThree}`;
  }

  const sign = isNegative ? '-' : '';
  return `${sign}₹${formatted}.${decPart}`;
}
