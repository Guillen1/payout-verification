import { useState } from "react";
import type { BonusView } from "@/api/types";
import { Card } from "@/components/ui/card";
import { money, rate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Picture = NonNullable<BonusView["picture"]>;

const WIDTH = 520;
const HEIGHT = 280;
const MARGIN = { left: 48, right: 24, top: 30, bottom: 42 };

/**
 * Why a bonus is owed, as two pictures: the agreement's rate steps with where the year landed and
 * what was paid, and the premium per agency with any the carrier left out.
 */
export function BonusPicture({ picture, counterparty }: { picture: Picture; counterparty: string }) {
  const onBoundary = picture.bands.some(band => band.upToLossRatioBps === picture.lossRatioBps);
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Card className="animate-rise p-6">
        <h2 className="font-medium">The agreement pays by loss ratio</h2>
        <p className="text-sm text-muted-foreground">
          Lower losses earn a higher rate (§ {picture.bandsClause}).{" "}
          {onBoundary
            ? `This year landed exactly on ${rate(picture.lossRatioBps)}, which the agreement puts in the ${rate(picture.agreementRateBps)} band: "up to and including".`
            : `This year landed at ${rate(picture.lossRatioBps)}, in the ${rate(picture.agreementRateBps)} band.`}
        </p>
        <Bands picture={picture} counterparty={counterparty} />
      </Card>
      <Card className="animate-rise p-6" style={{ animationDelay: "200ms" }}>
        <h2 className="font-medium">Premium the bonus is paid on</h2>
        <p className="text-sm text-muted-foreground">Per agency, from the network's own records.</p>
        <Agencies agencies={picture.agencies} counterparty={counterparty} />
      </Card>
    </div>
  );
}

function Bands({ picture, counterparty }: { picture: Picture; counterparty: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const bands = picture.bands;
  const last = bands.at(-1)!;
  const xMax = Math.max(last.upToLossRatioBps + 1_000, picture.lossRatioBps + 1_000);
  const yMax = Math.max(...bands.map(band => band.rateBps), picture.paidRateBps) * 1.3;
  const x = (bps: number) => MARGIN.left + (bps / xMax) * (WIDTH - MARGIN.left - MARGIN.right);
  const y = (bps: number) => HEIGHT - MARGIN.bottom - (bps / yMax) * (HEIGHT - MARGIN.top - MARGIN.bottom);

  const points: [number, number][] = [];
  bands.forEach((band, index) => {
    const from = index === 0 ? 0 : bands[index - 1]!.upToLossRatioBps;
    points.push([x(from), y(band.rateBps)], [x(band.upToLossRatioBps), y(band.rateBps)]);
  });
  points.push([x(last.upToLossRatioBps), y(0)], [x(xMax), y(0)]);
  const line = points.map(([px, py], index) => `${index === 0 ? "M" : "L"}${px},${py}`).join(" ");
  const area = `${line} L${x(xMax)},${y(0)} L${x(0)},${y(0)} Z`;

  const landed = x(picture.lossRatioBps);
  const owedY = y(picture.agreementRateBps);
  const paidY = y(picture.paidRateBps);

  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Bonus rate by loss ratio">
        <line x1={x(0)} x2={x(xMax)} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {bands.map(band => (
          <g key={band.upToLossRatioBps}>
            <line
              x1={x(band.upToLossRatioBps)}
              x2={x(band.upToLossRatioBps)}
              y1={y(0)}
              y2={y(0) + 5}
              stroke="var(--muted-foreground)"
            />
            <text
              x={x(band.upToLossRatioBps)}
              y={y(0) + 18}
              textAnchor="middle"
              className="fill-muted-foreground text-[12px]"
            >
              {rate(band.upToLossRatioBps)}
            </text>
            <text x={x(0) - 8} y={y(band.rateBps) + 4} textAnchor="end" className="fill-muted-foreground text-[12px]">
              {rate(band.rateBps)}
            </text>
          </g>
        ))}
        <text x={x(xMax)} y={HEIGHT - 6} textAnchor="end" className="fill-muted-foreground text-[12px]">
          loss ratio
        </text>

        <path d={area} fill="var(--series-1)" opacity={0.1} />
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} />

        {bands.map((band, index) => {
          const from = index === 0 ? 0 : bands[index - 1]!.upToLossRatioBps;
          return (
            <rect
              key={band.upToLossRatioBps}
              x={x(from)}
              width={x(band.upToLossRatioBps) - x(from)}
              y={MARGIN.top}
              height={y(0) - MARGIN.top}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        <line
          x1={landed}
          x2={landed}
          y1={MARGIN.top - 8}
          y2={y(0)}
          stroke="var(--foreground)"
          strokeDasharray="3 3"
          opacity={0.5}
        />
        <text x={landed} y={MARGIN.top - 12} textAnchor="middle" className="fill-foreground text-[12px] font-medium">
          this year: {rate(picture.lossRatioBps)}
        </text>

        <line x1={landed} x2={landed} y1={owedY} y2={paidY} stroke="var(--status-critical)" strokeWidth={2} />
        <circle cx={landed} cy={owedY} r={6} fill="var(--series-1)" stroke="var(--card)" strokeWidth={2} />
        <circle cx={landed} cy={paidY} r={6} fill="var(--status-critical)" stroke="var(--card)" strokeWidth={2} />
        <text x={landed + 12} y={owedY - 8} className="fill-foreground text-[13px] font-semibold">
          Agreement: {rate(picture.agreementRateBps)}
        </text>
        <text
          x={landed - 12}
          y={paidY + 4}
          textAnchor="end"
          className="fill-[var(--status-critical-ink)] text-[13px] font-semibold"
        >
          {counterparty} paid: {rate(picture.paidRateBps)}
        </text>
      </svg>
      {hovered !== null && (
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 rounded-md border bg-card px-3 py-1.5 text-xs shadow-sm">
          Loss ratio up to and including {rate(bands[hovered]!.upToLossRatioBps)}: a bonus of{" "}
          {rate(bands[hovered]!.rateBps)} of premium
        </div>
      )}
    </div>
  );
}

function Agencies({ agencies, counterparty }: { agencies: Picture["agencies"]; counterparty: string }) {
  const max = Math.max(...agencies.map(agency => agency.networkCents));
  const sorted = [...agencies].sort((a, b) => b.networkCents - a.networkCents);
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {sorted.map(agency => {
        const leftOut = agency.statementCents < agency.networkCents;
        return (
          <div key={agency.name} className="grid grid-cols-[10.5rem_1fr_5.5rem] items-center gap-3 text-xs">
            <span className={cn("truncate", leftOut && "font-medium text-critical-ink")}>{agency.name}</span>
            <div className="h-3 rounded-full bg-muted">
              <div
                className={
                  leftOut
                    ? "h-full rounded-full ring-1 ring-[var(--status-critical)]"
                    : "h-full rounded-full bg-[var(--series-1)]"
                }
                style={{
                  width: `${(agency.networkCents / max) * 100}%`,
                  // Hatched: premium the network has that the statement did not count.
                  ...(leftOut && {
                    background: "repeating-linear-gradient(135deg, var(--status-critical) 0 3px, transparent 3px 7px)"
                  })
                }}
              />
            </div>
            <span className="tabular text-right">{money(agency.networkCents)}</span>
            {leftOut && (
              <span className="col-start-2 col-end-4 -mt-1 text-critical-ink">
                {agency.statementCents === 0
                  ? `Left out of the ${counterparty.toLowerCase()}'s statement`
                  : `Counted as ${money(agency.statementCents)} on the statement`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
