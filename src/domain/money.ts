/**
 * Money and rates as integers.
 *
 * Every amount in this codebase is an integer number of cents, and every rate is an integer number
 * of basis points (1 bp = 0.01%). Floating-point dollars never enter the domain, so totals tie out
 * to the cent and the same inputs always produce the same outputs.
 */

export type Cents = number;
export type BasisPoints = number;

const BASIS_POINTS_IN_ONE = 10_000;

/** Applies a rate to an amount, rounding to the nearest cent with halves away from zero. */
export function applyRate(amount: Cents, rate: BasisPoints): Cents {
  const product = amount * rate;
  const quotient = Math.trunc(product / BASIS_POINTS_IN_ONE);
  const remainder = product - quotient * BASIS_POINTS_IN_ONE;
  const roundsAwayFromZero = Math.abs(remainder) * 2 >= BASIS_POINTS_IN_ONE;
  return roundsAwayFromZero ? quotient + Math.sign(product) : quotient;
}

export function sumCents(amounts: readonly Cents[]): Cents {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/**
 * Parses the money formats carriers actually send: "1234.56", "1,234.56", "$1,234.56",
 * "-12.30" and "(12.30)" for negatives.
 */
export function parseMoney(text: string): Cents {
  const trimmed = text.trim();
  const isParenthesized = trimmed.startsWith("(") && trimmed.endsWith(")");
  const digitsOnly = trimmed.replace(/[()$,\s]/g, "");
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(digitsOnly);
  if (!match) {
    throw new Error(`Not a money amount: "${text}"`);
  }

  const [, minusSign, dollars = "0", fraction = ""] = match;
  const magnitude = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  const isNegative = isParenthesized || minusSign === "-";
  return isNegative && magnitude !== 0 ? -magnitude : magnitude;
}

const dollarFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Formats cents for people to read. Display only; never parse this back. */
export function formatMoney(amount: Cents): string {
  return dollarFormat.format(amount / 100);
}

/** Formats a rate for people to read, for example 1150 bp as "11.50%". */
export function formatRate(rate: BasisPoints): string {
  return `${(rate / 100).toFixed(2)}%`;
}

/** Formats cents as a plain decimal for files, for example -1230 as "-12.30". */
export function formatMoneyPlain(amount: Cents): string {
  const sign = amount < 0 ? "-" : "";
  const magnitude = Math.abs(amount);
  return `${sign}${Math.trunc(magnitude / 100)}.${String(magnitude % 100).padStart(2, "0")}`;
}
