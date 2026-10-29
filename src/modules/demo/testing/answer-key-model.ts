import type { PeriodLabels } from "../synthetic/planned-line";
import { PROPOSE_FORMAT_TASK } from "../../extraction/application/services/format-proposal.service";
import { READ_PDF_STATEMENT_TASK } from "../../extraction/application/services/pdf-statement-reader.service";
import { ScriptedModelClient, type ScriptedAnswer } from "../../../libs/model-client/testing/scripted-model.client";

/**
 * A stand-in model that answers like a perfect reader: PDF transcripts come straight from the
 * answer key. End-to-end tests use it to check everything around the model without depending on
 * the model; the evals measure the real model against the same answer key.
 */
export function answerKeyModel(labels: PeriodLabels, proposals: Record<string, unknown> = {}): ScriptedModelClient {
  return new ScriptedModelClient((request): ScriptedAnswer => {
    if (request.task === READ_PDF_STATEMENT_TASK) {
      const pdf = request.inputs.find(input => input.type === "pdf");
      const carrier = Object.values(labels.carriers).find(entry => entry.file === pdf?.name);
      if (!carrier?.transcript) return { declined: `No transcript in the answer key for ${pdf?.name}` };
      return { output: carrier.transcript };
    }
    if (request.task === PROPOSE_FORMAT_TASK) {
      const text = request.inputs.map(input => (input.type === "text" ? input.text : "")).join("\n");
      const match = Object.entries(proposals).find(([formatId]) => text.includes(`id: ${formatId}`));
      return match ? { output: match[1] } : { declined: "No scripted proposal for this format" };
    }
    return { declined: `Unexpected task ${request.task}` };
  });
}
