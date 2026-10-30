import { describe, expect, it } from "vitest";
import type { ModelUsage } from "../../../../libs/model-client/contract/model.models";
import type { CarrierView, PeriodView } from "../../../reconciliation/application/views/period-view";
import { DEFAULT_VOCABULARY } from "../../../reconciliation/domain/vocabulary";
import { signalsFor } from "../../application/health.service";

function carrier(overrides: Partial<CarrierView> & Pick<CarrierView, "name">): CarrierView {
  return {
    id: overrides.name.toLowerCase(),
    fileKind: "csv",
    state: "processed",
    outcome: "processed",
    hold: null,
    totals: null,
    counts: { clear: 9, dispute: 0, review: 1, missing: 0 },
    owedCents: 0,
    lines: Array.from({ length: 10 }, () => ({}) as CarrierView["lines"][number]),
    missing: [],
    ...overrides
  };
}

function period(carriers: CarrierView[], pdfReadings = 0): PeriodView {
  const reading = { task: "read-pdf-statement" } as ModelUsage;
  return {
    tenantName: "Test",
    period: "2026-09",
    ranAt: "",
    totals: { paidCents: 0, toAgenciesCents: 0, toNetworkCents: 0, heldCents: 0, owedCents: 0 },
    carriers,
    modelCalls: Array.from({ length: pdfReadings }, () => reading)
  };
}

const byLabel = (signals: ReturnType<typeof signalsFor>) =>
  Object.fromEntries(signals.map(signal => [signal.label, [signal.value, signal.status]]));

describe("signalsFor", () => {
  it("is all clear on a normal month", () => {
    const signals = signalsFor(
      period([carrier({ name: "A" }), carrier({ name: "B", fileKind: "pdf" })], 1),
      DEFAULT_VOCABULARY
    );
    expect(signals.every(signal => signal.status === "ok")).toBe(true);
    expect(byLabel(signals)["Commission statements that add up to the cent"]).toEqual(["2 of 2", "ok"]);
  });

  it("names a changed layout, a silent carrier and a switched-off one", () => {
    const signals = byLabel(
      signalsFor(
        period([
          carrier({ name: "A" }),
          carrier({ name: "B", state: "held", outcome: "format_drift" }),
          carrier({ name: "C", state: "not_received", outcome: "statement_missing" }),
          carrier({ name: "D", state: "held", outcome: "paused" })
        ]),
        DEFAULT_VOCABULARY
      )
    );
    expect(signals["Layouts that changed"]).toEqual(["B", "alert"]);
    expect(signals["Carriers that sent nothing"]).toEqual(["C", "alert"]);
    expect(signals["Switched off by a person"]).toEqual(["D", "alert"]);
  });

  it("flags a statement that does not add up", () => {
    const signals = byLabel(signalsFor(period([carrier({ name: "A", state: "held" })]), DEFAULT_VOCABULARY));
    expect(signals["Commission statements that add up to the cent"]).toEqual(["0 of 1", "alert"]);
  });

  it("flags more lines needing a person than the limit, and a retried reading", () => {
    const busy = carrier({ name: "A", fileKind: "pdf", counts: { clear: 7, dispute: 2, review: 1, missing: 0 } });
    const signals = byLabel(signalsFor(period([busy], 2), DEFAULT_VOCABULARY));
    expect(signals["Lines that need a person"]).toEqual(["3 of 10", "alert"]);
    expect(signals["Readings retried on the stronger model"]).toEqual(["1 of 1", "alert"]);
  });
});
