import { stringify } from "csv-stringify/sync";
import type { Cents } from "../../reconciliation/domain/money";
import type { TransactionType } from "../../reconciliation/domain/types";
import type { PlannedLine } from "./planned-line";

/*
 * Each carrier prints its statement its own way. These renderers are written by hand from what
 * each carrier's file looks like, not generated from the extraction formats, so the extraction
 * config is tested against data it did not produce.
 */

export function renderNorthwindStatement(lines: readonly PlannedLine[]): string {
  const products: Record<string, string> = { auto: "Personal Auto", home: "Homeowners", umbrella: "Personal Umbrella" };
  const transactions: Record<TransactionType, string> = {
    new: "New Business",
    renewal: "Renewal",
    cancellation: "Cancellation"
  };
  const plain = (amount: Cents) => (amount / 100).toFixed(2);

  const rows = lines.map(line => [
    line.showPolicyNumber ? line.policy.policyNumber.replace("-", "") : "",
    line.policy.insuredName,
    products[line.policy.product],
    transactions[line.transactionType],
    line.policy.effectiveDate,
    plain(line.premiumCents),
    `${(line.appliedRateBps / 100).toFixed(2)}%`,
    plain(line.commissionCents)
  ]);
  const total = lines.reduce((sum, line) => sum + line.commissionCents, 0);

  return stringify([
    [
      "Policy Number",
      "Insured Name",
      "Line of Business",
      "Transaction",
      "Effective Date",
      "Written Premium",
      "Commission Rate",
      "Commission Paid"
    ],
    ...rows,
    ["Statement Total", "", "", "", "", "", "", plain(total)]
  ]);
}

export function renderBluestemStatement(lines: readonly PlannedLine[]): string {
  const products: Record<string, string> = { auto: "PA", home: "HO", umbrella: "PU" };
  const transactions: Record<TransactionType, string> = { new: "NB", renewal: "RN", cancellation: "XC" };

  const rows = lines.map(line => {
    const name = line.policy.insuredName;
    const first = name.slice(0, name.indexOf(" "));
    const last = name.slice(name.indexOf(" ") + 1);
    const termSuffix = line.policy.term === "new" ? "-01" : "-02";
    const [year, month, day] = line.policy.effectiveDate.split("-");
    return [
      line.showPolicyNumber ? `${line.policy.policyNumber}${termSuffix}` : "",
      `${last}, ${first}`.toUpperCase(),
      products[line.policy.product],
      transactions[line.transactionType],
      `${month}/${day}/${year}`,
      dollars(line.premiumCents),
      dollars(line.commissionCents)
    ];
  });
  const total = lines.reduce((sum, line) => sum + line.commissionCents, 0);

  return stringify([
    ["POLICY_NO", "NAMED_INSURED", "PRODUCT_CD", "TXN_CD", "EFF_DT", "PREMIUM", "COMM_AMT"],
    ...rows,
    ["TOTAL", "", "", "", "", "", dollars(total)]
  ]);
}

export function renderBrightlineStatement(lines: readonly PlannedLine[]): string {
  const categories: Record<string, string> = { lash: "Lash", hair: "Hair Care", skin: "Skin Care" };
  const types: Record<TransactionType, string> = { new: "New Item", renewal: "Reorder", cancellation: "Return" };
  const plain = (amount: Cents) => (amount / 100).toFixed(2);

  const rows = lines.map(line => [
    line.showPolicyNumber ? line.policy.policyNumber : "",
    line.policy.insuredName,
    categories[line.policy.product],
    types[line.transactionType],
    line.policy.effectiveDate,
    plain(line.premiumCents),
    `${(line.appliedRateBps / 100).toFixed(2)}%`,
    plain(line.commissionCents)
  ]);
  const total = lines.reduce((sum, line) => sum + line.commissionCents, 0);

  return stringify([
    ["Invoice #", "Store", "Category", "Type", "Invoice Date", "Invoice Amount", "Net %", "Amount Paid"],
    ...rows,
    ["Remittance Total", "", "", "", "", "", "", plain(total)]
  ]);
}

export function renderMapleMainStatement(lines: readonly PlannedLine[]): string {
  const categories: Record<string, string> = { lash: "LS", hair: "HR", skin: "SK" };
  const types: Record<TransactionType, string> = { new: "NI", renewal: "RO", cancellation: "RT" };

  const rows = lines.map(line => {
    const [year, month, day] = line.policy.effectiveDate.split("-");
    return [
      line.showPolicyNumber ? line.policy.policyNumber.replace("-", "") : "",
      line.policy.insuredName.toUpperCase(),
      categories[line.policy.product],
      types[line.transactionType],
      `${month}/${day}/${year}`,
      dollars(line.premiumCents),
      dollars(line.commissionCents)
    ];
  });
  const total = lines.reduce((sum, line) => sum + line.commissionCents, 0);

  return stringify([
    ["INV_NO", "STORE_NAME", "CAT_CD", "DOC_TYPE", "INV_DT", "GROSS_AMT", "NET_PAID"],
    ...rows,
    ["TOTAL", "", "", "", "", "", dollars(total)]
  ]);
}

/** "$1,234.56", or "($1,234.56)" for negatives. */
function dollars(amount: Cents): string {
  const formatted = (Math.abs(amount) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return amount < 0 ? `($${formatted})` : `$${formatted}`;
}
