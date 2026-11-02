import { getDocument } from "pdfjs-dist";
import { FileText, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAgreementPdf } from "@/api/client";
import type { BonusRules } from "@/api/types";
import { Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { money, rate } from "@/lib/format";
import { findWhere, type LineMark } from "@/lib/pdf";
import { cn } from "@/lib/utils";

/** How long each rule takes to appear. */
const STEP_MS = 1_100;

/** One thing read from the agreement: a rule code applies, or a term left for the reviewer. */
interface Step {
  label: string;
  value: string;
  clause: string;
  kind: "rule" | "note";
  /** Highlighted as this year's step. */
  emphasis?: boolean;
  /** Finds the text this step was read from on the page. */
  matches: (printed: string) => boolean;
}

/**
 * A replay of how the AI read the bonus agreement into rules: the contract on one side, and each rule
 * appearing on the other with its clause marked where it is printed. It replays the approved reading;
 * nothing is read again.
 */
export function AgreementReading({
  programId,
  carrierName,
  rules,
  notes,
  lossRatioBps
}: {
  programId: string;
  carrierName: string;
  rules: BonusRules;
  notes: string[];
  lossRatioBps: number | null;
}) {
  const steps = useMemo(() => stepsFor(rules, notes, lossRatioBps), [rules, notes, lossRatioBps]);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText /> See how the AI read the agreement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[min(1160px,calc(100vw-2rem))]">
        <DialogTitle className="text-lg font-semibold">
          The AI reading {carrierName}'s profit-sharing agreement
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          A replay of the reading a person approved. Each rule cites the clause it comes from; code does all the math.
        </DialogDescription>
        <Replay programId={programId} steps={steps} sha256={rules.agreementSha256} />
      </DialogContent>
    </Dialog>
  );
}

function stepsFor(rules: BonusRules, notes: string[], lossRatioBps: number | null): Step[] {
  const startsClause = (clause: string) => (printed: string) => printed === clause || printed.startsWith(`${clause} `);
  const bands = rules.lossRatioBands.bands;
  const steps: Step[] = [
    {
      label: "Lines that count",
      value: rules.eligibleProducts.products
        .map(product => product.charAt(0).toUpperCase() + product.slice(1))
        .join(", "),
      clause: rules.eligibleProducts.clause,
      kind: "rule",
      matches: startsClause(rules.eligibleProducts.clause)
    },
    {
      label: "Minimum to qualify",
      value: `${money(rules.minimumPremium.cents)} of premium`,
      clause: rules.minimumPremium.clause,
      kind: "rule",
      matches: startsClause(rules.minimumPremium.clause)
    },
    ...bands.map((band, index): Step => {
      const lower = index === 0 ? 0 : bands[index - 1]!.upToLossRatioBps;
      return {
        label:
          index === 0
            ? `Loss ratio ${rate(band.upToLossRatioBps)} or less`
            : `Up to and including ${rate(band.upToLossRatioBps)}`,
        value: `${rate(band.rateBps)} bonus`,
        clause: rules.lossRatioBands.clause,
        kind: "rule",
        emphasis: lossRatioBps !== null && lossRatioBps > lower && lossRatioBps <= band.upToLossRatioBps,
        matches: printed => printed.includes(rate(band.upToLossRatioBps)) && printed.includes("Loss Ratio")
      };
    }),
    {
      label: `Over ${rate(bands.at(-1)!.upToLossRatioBps)}`,
      value: "No bonus",
      clause: rules.lossRatioBands.clause,
      kind: "rule",
      matches: printed => printed.includes(`over ${rate(bands.at(-1)!.upToLossRatioBps)}`)
    },
    ...(rules.maximumBonus
      ? [
          {
            label: "The most it can be",
            value: money(rules.maximumBonus.cents),
            clause: rules.maximumBonus.clause,
            kind: "rule" as const,
            matches: startsClause(rules.maximumBonus.clause)
          }
        ]
      : []),
    ...notes.map((note): Step => {
      const clause = /clause ([\d.]+)/.exec(note)?.[1] ?? "";
      return {
        label: "For the reviewer",
        value: note.replace(/ \(clause [\d.]+\)\.?$/, "."),
        clause,
        kind: "note",
        matches: startsClause(clause)
      };
    })
  ];
  return steps;
}

interface Prepared {
  pages: { image: string; aspect: number }[];
  /** Where each step's text is printed: its page and its place on that page. */
  marks: ({ page: number; mark: LineMark } | null)[];
}

function Replay({ programId, steps, sha256 }: { programId: string; steps: Step[]; sha256: string }) {
  const { data } = useAgreementPdf(programId, true);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [shown, setShown] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [run, setRun] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!data) return;
    const loading = getDocument({ data: data.slice() });
    let cancelled = false;
    void (async () => {
      const document = await loading.promise;
      const pages: Prepared["pages"] = [];
      const marks: Prepared["marks"] = steps.map(() => null);
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = window.document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        pages.push({ image: canvas.toDataURL("image/png"), aspect: viewport.width / viewport.height });
        for (const [index, step] of steps.entries()) {
          if (marks[index]) continue;
          const mark = await findWhere(page, viewport, step.matches);
          if (mark) marks[index] = { page: number - 1, mark };
        }
      }
      if (!cancelled) setPrepared({ pages, marks });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      void loading.destroy();
    };
  }, [data, steps]);

  // Rules appear one at a time; with less motion they are all there at once.
  useEffect(() => {
    if (!prepared) return;
    setSelected(null);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(steps.length);
      return;
    }
    setShown(0);
    const timer = window.setInterval(() => {
      setShown(count => {
        if (count >= steps.length) window.clearInterval(timer);
        return Math.min(steps.length, count + 1);
      });
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [prepared, steps.length, run]);

  const current = selected ?? (shown > 0 ? shown - 1 : null);
  const done = shown >= steps.length;

  // Keep the clause being read in view.
  useEffect(() => {
    const box = frame.current;
    const target = current === null ? null : prepared?.marks[current];
    const page = target ? pageRefs.current[target.page] : null;
    if (!box || !target || !page) return;
    const top = page.offsetTop + target.mark.top * page.offsetHeight - box.clientHeight / 2;
    box.scrollTo({ top, behavior: "smooth" });
  }, [current, prepared]);

  // Keep the newest term in view while they appear.
  useEffect(() => {
    if (selected === null) list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [shown, selected]);

  if (!prepared) return <Loading />;
  const active = current === null ? null : prepared.marks[current];

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div ref={frame} className="relative max-h-[68vh] overflow-y-auto rounded-lg border bg-white">
        {prepared.pages.map((page, index) => (
          <div
            key={index}
            ref={element => {
              pageRefs.current[index] = element;
            }}
            className="relative border-b last:border-b-0"
            style={{ aspectRatio: `${page.aspect}` }}
          >
            <img src={page.image} alt={`Page ${index + 1} of the agreement`} className="block h-auto w-full" />
            {active && active.page === index && current !== null && (
              <div
                key={current}
                className={cn(
                  "animate-rise absolute inset-x-2 rounded border-2",
                  steps[current]!.kind === "note"
                    ? "border-warning bg-warning/20"
                    : "border-[var(--series-1)] bg-[var(--series-1)]/15"
                )}
                style={{ top: `${active.mark.top * 100}%`, height: `${active.mark.height * 100}%` }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="tabular text-3xl font-semibold">
            {Math.min(shown, steps.length)}{" "}
            <span className="text-base font-normal text-muted-foreground">of {steps.length} terms read</span>
          </div>
          {done && (
            <Button variant="outline" size="sm" onClick={() => setRun(count => count + 1)}>
              <RotateCcw /> Replay
            </Button>
          )}
        </div>

        <div ref={list} className="max-h-[50vh] min-h-0 divide-y overflow-y-auto rounded-lg border bg-card">
          {steps.slice(0, shown).map((step, index) => (
            <button
              key={`${step.label}-${index}`}
              onClick={() => setSelected(index)}
              className={cn(
                "animate-rise flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                current === index && "bg-muted/60"
              )}
            >
              {step.kind === "note" ? (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-label="For the reviewer" />
              ) : (
                <span className="mt-0.5 shrink-0 rounded border px-1.5 text-xs text-muted-foreground">
                  § {step.clause}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block font-medium", step.emphasis && "text-[var(--series-1)]")}>
                  {step.label}
                  {step.emphasis && " · this year"}
                </span>
                <span className="block text-muted-foreground">{step.value}</span>
              </span>
              {step.kind === "note" && <span className="shrink-0 text-xs text-muted-foreground">§ {step.clause}</span>}
            </button>
          ))}
        </div>

        {done && (
          <div className="animate-rise flex items-start gap-2 rounded-lg bg-good-soft px-4 py-2.5 text-sm text-good-ink">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Approved by a person for this exact document (fingerprint {sha256.slice(0, 8)}). If the contract changes,
              these rules stop and must be approved again.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
