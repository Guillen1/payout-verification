import { ArrowRight, BadgeCheck, Calculator, CircleAlert, FileSearch, UserCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useOverview } from "@/api/client";
import type { OverviewView } from "@/api/types";
import { ErrorState, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { money, percent, periodName } from "@/lib/format";
import { linkTo } from "@/lib/targets";

/**
 * The first screen: the money the checks found, where it is and why, what is waiting for a
 * person, and why the numbers can be trusted.
 */
export function HomePage() {
  const { data: overview, error, isLoading } = useOverview();
  if (isLoading) return <Loading />;
  if (error || !overview) return <ErrorState error={error ?? new Error("No data")} />;

  return (
    <div className="flex flex-col gap-10">
      <Hero overview={overview} />
      {overview.waiting.length > 0 && <WaitingForYou overview={overview} />}
      <MoneyFound overview={overview} />
      <Proof overview={overview} />
      <HowItWorks />
    </div>
  );
}

function Hero({ overview }: { overview: OverviewView }) {
  const sources = [
    `${overview.checked.statements} carrier statements`,
    overview.checked.bonusPrograms > 0 &&
      `${overview.checked.bonusPrograms} profit-sharing agreement${overview.checked.bonusPrograms > 1 ? "s" : ""}`
  ].filter(Boolean);
  return (
    <section>
      <div className="text-sm text-muted-foreground">
        {overview.tenantName}
        {overview.period && ` · ${periodName(overview.period)}`}
      </div>
      <h1 className="tabular mt-2 text-5xl font-semibold tracking-tight">{money(overview.foundCents)}</h1>
      <p className="mt-2 max-w-2xl text-lg text-muted-foreground">
        owed to the network, found by checking {sources.join(" and ")} line by line. Every amount comes with its reasons
        and a draft letter to the carrier.
      </p>
    </section>
  );
}

function MoneyFound({ overview }: { overview: OverviewView }) {
  const largest = Math.max(...overview.found.map(entry => entry.cents), 1);
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">Where the money is</h2>
      <Card className="divide-y">
        {overview.found.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">Every carrier paid what it owed.</p>
        )}
        {overview.found.map(entry => (
          <Link
            key={linkTo(entry.target)}
            to={linkTo(entry.target)}
            className="group grid gap-4 p-5 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_14rem_1.5rem] md:items-center"
          >
            <div className="min-w-0">
              <div className="font-semibold">
                {entry.carrierName} <span className="font-normal text-muted-foreground">· {entry.subject}</span>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-sm text-muted-foreground">
                {entry.reasons.map(reason => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="tabular text-right text-2xl font-semibold tracking-tight text-critical-ink">
                {money(entry.cents)}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted" title={money(entry.cents)}>
                <div
                  className="ml-auto h-full rounded-full bg-critical"
                  style={{ width: `${Math.max(2, (entry.cents / largest) * 100)}%` }}
                />
              </div>
            </div>
            <ArrowRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 md:block" />
          </Link>
        ))}
      </Card>
    </section>
  );
}

function WaitingForYou({ overview }: { overview: OverviewView }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">Waiting for you</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {overview.waiting.map(item => (
          <Card key={item.title} className="flex items-start gap-3 border-warning/50 bg-warning-soft/50 p-4">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-ink" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{item.title}</div>
              <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={linkTo(item.target)}>
                <BadgeCheck /> Review
              </Link>
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Proof({ overview }: { overview: OverviewView }) {
  const { checked, accuracy, costPerStatementUsd } = overview;
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <Figure value={`${checked.lines}`} label="statement lines checked automatically">
        {checked.needsPerson} needed a person
      </Figure>
      {accuracy && (
        <Figure value={percent(accuracy.lowestScore)} label="read correctly by the AI">
          PDF statements, changed layouts and bonus agreements, scored against an answer key
        </Figure>
      )}
      {costPerStatementUsd !== null && (
        <Figure value={`$${costPerStatementUsd.toFixed(2)}`} label="to read a PDF statement">
          Claude Sonnet at list prices; every number it reads is checked by code
        </Figure>
      )}
    </section>
  );
}

function Figure({ value, label, children }: { value: string; label: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="tabular text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-sm font-medium">{label}</div>
      <div className="mt-2 text-xs text-muted-foreground">{children}</div>
    </Card>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: FileSearch,
      title: "AI reads the documents",
      text: "PDF statements, changed file layouts and bonus agreements, in any carrier's format."
    },
    {
      icon: Calculator,
      title: "Code checks every cent",
      text: "Rates in effect on the day, totals that must tie out, policies that were never paid."
    },
    {
      icon: UserCheck,
      title: "A person approves",
      text: "Anything a model proposes takes effect only after someone approves it, on the record."
    }
  ];
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">How it works</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <Card key={title} className="p-5">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {index + 1}
              </span>
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3 font-medium">{title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
