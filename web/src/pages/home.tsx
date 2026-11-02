import { ArrowRight, CircleAlert, FileStack, Mail, ScanSearch, TriangleAlert, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { usePeriods, useOverview, useRunPeriod } from "@/api/client";
import type { OverviewView } from "@/api/types";
import { ErrorState, Loading, RunButton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { useCountUp } from "@/lib/count-up";
import { money, percent, periodName } from "@/lib/format";
import { linkTo } from "@/lib/targets";
import { capitalized } from "@/lib/words";

/**
 * The first screen tells the story before any detail: the problem in one sentence, what the checks
 * did this month as it happens, the money found, and where it is.
 */
export function HomePage() {
  const { data: overview, error, isLoading } = useOverview();
  if (isLoading) return <Loading />;
  if (error || !overview) return <ErrorState error={error ?? new Error("No data")} />;

  return (
    <div className="flex flex-col gap-12">
      <Problem overview={overview} />
      {overview.period ? <Found overview={overview} /> : <FirstRun />}
    </div>
  );
}

function Problem({ overview }: { overview: OverviewView }) {
  const { words } = overview;
  return (
    <section className="animate-rise max-w-3xl">
      <p className="text-sm font-medium text-[var(--series-1)]">{overview.tenantName.replace(/ \(synthetic\)$/, "")}</p>
      <h1 className="mt-2 text-3xl leading-tight font-semibold tracking-tight text-balance">
        Every month, {words.counterparties} pay {words.organization} on {words.statement}s in their own formats. No one
        can check every line by hand, so underpayments go unnoticed.
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        This reads every {words.statement}, checks every line against the agreement, and finds what is owed.
      </p>
    </section>
  );
}

/** Before the first run: one button that runs the month. */
function FirstRun() {
  const { data: periods } = usePeriods();
  const run = useRunPeriod();
  const period = periods?.[0]?.period;
  if (!period) return <p className="text-muted-foreground">No statements have arrived yet.</p>;
  return (
    <Card className="animate-rise flex items-center justify-between gap-6 p-8">
      <div>
        <div className="text-lg font-medium">{periodName(period)} is in.</div>
        <p className="text-sm text-muted-foreground">Check every line of every statement now.</p>
      </div>
      <RunButton onRun={() => run.mutate(period)} running={run.isPending} label={`Check ${periodName(period)}`} />
    </Card>
  );
}

function Found({ overview }: { overview: OverviewView }) {
  const found = useCountUp(overview.foundCents, { durationMs: 1600, delayMs: 1500 });
  const { checked, words } = overview;
  const proof = [
    overview.accuracy && `${percent(overview.accuracy.lowestScore)} AI accuracy against an answer key`,
    overview.costPerStatementUsd !== null && `$${overview.costPerStatementUsd.toFixed(2)} per statement read`
  ].filter(Boolean);

  return (
    <>
      <Flow
        steps={[
          {
            icon: FileStack,
            value: checked.statements,
            label: "statements arrived",
            detail: checked.readByModel > 0 ? `${checked.readByModel} printed, read by AI` : "files from each sender"
          },
          { icon: ScanSearch, value: checked.lines, label: "lines checked", detail: "against the agreed terms" },
          {
            icon: TriangleAlert,
            value: checked.needsPerson,
            label: "need a person",
            detail: "the rest paid as agreed"
          },
          {
            icon: Mail,
            value: overview.found.length,
            label: "letters drafted",
            detail: "with every figure quoted"
          }
        ]}
      />

      <section className="animate-rise" style={{ animationDelay: "1400ms" }}>
        <p className="text-sm text-muted-foreground">{overview.period && periodName(overview.period)}</p>
        <div className="tabular mt-1 text-7xl font-semibold tracking-tight">{money(found)}</div>
        <p className="mt-2 text-lg text-muted-foreground">owed to {words.organization}, found automatically.</p>
      </section>

      {overview.waiting.map(item => (
        <Link
          key={item.title}
          to={linkTo(item.target)}
          className="-mt-6 flex items-center gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm hover:bg-warning-soft/70"
        >
          <CircleAlert className="size-4 shrink-0 text-warning-ink" />
          <span className="font-medium">{item.title}</span>
          <span className="ml-auto flex items-center gap-1 text-warning-ink">
            Review <ArrowRight className="size-4" />
          </span>
        </Link>
      ))}

      <Card className="divide-y">
        {overview.found.map((entry, index) => (
          <Link
            key={linkTo(entry.target)}
            to={linkTo(entry.target)}
            className="group animate-rise flex items-center gap-6 px-6 py-5 transition-colors hover:bg-muted/40"
            style={{ animationDelay: `${1800 + index * 150}ms` }}
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {entry.carrierName} <span className="font-normal text-muted-foreground">· {entry.subject}</span>
              </div>
              <div className="mt-0.5 truncate text-sm text-muted-foreground">{entry.reasons.join(" · ")}</div>
            </div>
            <div className="tabular text-xl font-semibold text-critical-ink">{money(entry.cents)}</div>
            <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
              See why <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </Card>

      {overview.scale && <AtScale overview={overview} scale={overview.scale} />}

      <p className="text-sm text-muted-foreground">{capitalized(proof.join("   ·   "))}</p>
    </>
  );
}

interface Step {
  icon: LucideIcon;
  value: number;
  label: string;
  detail: string;
}

/** What happened this month, step by step, arriving in order with each count running up. */
function Flow({ steps }: { steps: Step[] }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-stretch">
      {steps.map((step, index) => (
        <FlowStep key={step.label} step={step} index={index} last={index === steps.length - 1} />
      ))}
    </section>
  );
}

function FlowStep({ step, index, last }: { step: Step; index: number; last: boolean }) {
  const delay = index * 300;
  const value = useCountUp(step.value, { durationMs: 900, delayMs: delay });
  const Icon = step.icon;
  return (
    <>
      <Card className="animate-rise flex flex-col gap-3 p-5" style={{ animationDelay: `${delay}ms` }}>
        <Icon className="size-5 text-[var(--series-1)]" />
        <div>
          <div className="tabular text-3xl font-semibold">{value}</div>
          <div className="text-sm font-medium">{step.label}</div>
          <div className="text-xs text-muted-foreground">{step.detail}</div>
        </div>
      </Card>
      {!last && (
        <svg
          className="animate-rise hidden h-4 w-8 self-center text-muted-foreground sm:block"
          style={{ animationDelay: `${delay + 150}ms` }}
          viewBox="0 0 32 16"
          aria-hidden
        >
          <line x1="0" y1="8" x2="26" y2="8" stroke="currentColor" strokeWidth="2" className="animate-flow" />
          <path d="M24 3 L30 8 L24 13" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </>
  );
}

/**
 * The same checks at the size of the business the demo is modeled on: what they would cover and what a
 * year of reading costs. It compares that cost with one real finding; it never projects money found.
 */
function AtScale({ overview, scale }: { overview: OverviewView; scale: NonNullable<OverviewView["scale"]> }) {
  const { words } = overview;
  const bonus = overview.found.find(entry => entry.target.kind === "bonus");
  const cost = scale.readingCostPerYearUsd;
  const times = bonus && cost ? Math.floor(bonus.cents / 100 / cost / 100) * 100 : null;
  const figures = [
    { value: scale.statementsPerYear.toLocaleString("en-US"), label: `${words.statement}s a year, every line checked` },
    { value: `${scale.bonusPrograms}+`, label: "bonus agreements read, every bonus recomputed" },
    cost !== null && { value: `$${Math.ceil(cost)}`, label: "a year of AI reading, at this month's cost" }
  ].filter(figure => figure !== false);

  return (
    <Card className="animate-rise p-6" style={{ animationDelay: "2400ms" }}>
      <h2 className="font-medium">At {scale.name}'s size</h2>
      <p className="text-sm text-muted-foreground">
        {scale.counterparties}+ {words.counterparties} and {scale.bonusPrograms}+ profit-sharing programs (
        {scale.source}).
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {figures.map(figure => (
          <div key={figure.label}>
            <div className="tabular text-3xl font-semibold">{figure.value}</div>
            <div className="text-sm text-muted-foreground">{figure.label}</div>
          </div>
        ))}
      </div>
      {bonus && times !== null && times > 0 && (
        <p className="mt-5 border-t pt-4 text-sm">
          The one profit-sharing program checked here was short{" "}
          <span className="font-semibold text-critical-ink">{money(bonus.cents)}</span>: more than{" "}
          {times.toLocaleString("en-US")} times a year of AI reading.
        </p>
      )}
    </Card>
  );
}
