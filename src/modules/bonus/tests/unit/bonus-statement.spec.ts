import { describe, expect, it } from "vitest";
import { readBonusStatement } from "../../domain/bonus-statement";
import { program } from "../support/bonus-builders";

const statement = `Producer Code,Producer Name,Written Premium,Earned Premium,Incurred Losses
NW-1,One,"400,000.00","360,000.00","180,000.00"
NW-2,Two,"300,000.00","240,000.00","120,000.00"
Total,,"700,000.00","600,000.00","300,000.00"
Loss Ratio,50.00%
Bonus Rate,3.00%
Bonus Payable,"21,000.00"
`;

describe("readBonusStatement", () => {
  it("reads the lines, the totals and what the carrier says it applied", () => {
    const reading = readBonusStatement(statement, program());
    expect(reading.status).toBe("read");
    if (reading.status !== "read") return;
    expect(reading.statement).toMatchObject({
      writtenPremiumCents: 70_000_000,
      earnedPremiumCents: 60_000_000,
      incurredLossesCents: 30_000_000,
      statedLossRatioBps: 5_000,
      statedRateBps: 300,
      paidCents: 2_100_000
    });
    expect(reading.statement.lines.map(line => line.agencyId)).toEqual(["ag-1", "ag-2"]);
  });

  it("holds a statement whose lines do not add up to its total", () => {
    const reading = readBonusStatement(statement.replace('"700,000.00"', '"710,000.00"'), program());
    expect(reading).toEqual({
      status: "invalid",
      problems: ["The lines' written premium do not add up to the total row"]
    });
  });

  it("holds a producer code the program does not know", () => {
    const reading = readBonusStatement(statement.replace("NW-2,", "NW-9,"), program());
    expect(reading).toEqual({
      status: "invalid",
      problems: ['row 3: producer code "NW-9" is not in the program\'s list']
    });
  });

  it("reports a missing summary row", () => {
    const reading = readBonusStatement(statement.replace("Bonus Rate,3.00%\n", ""), program());
    expect(reading).toEqual({ status: "invalid", problems: ['The "Bonus Rate" row is missing'] });
  });
});
