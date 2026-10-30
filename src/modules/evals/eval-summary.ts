/** The eval result the admin reads, written beside the Markdown report as report.json. */
export interface EvalSummary {
  ranAt: string;
  passed: boolean;
  scores: { measure: string; label: string; score: number; floor: number }[];
  /** PDF readings that needed the escalation model. A rising count means the default model is struggling. */
  escalations: number;
  statements: number;
  calls: number;
  replayed: number;
  costUsd: number;
}

export const MEASURE_LABELS: Record<string, string> = {
  fieldAccuracy: "PDF fields read correctly",
  tieOutRate: "PDF statements that tie out",
  findingAccuracy: "Findings correct after reading",
  proposalsCorrect: "Layout proposals correct",
  bonusRulesCorrect: "Bonus rules read correctly"
};
