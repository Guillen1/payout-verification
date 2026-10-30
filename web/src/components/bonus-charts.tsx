import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BonusView } from "@/api/types";
import { money, moneyShort } from "@/lib/format";

/*
 * Two bars on one scale: what the agreement supports and what the carrier paid. One measure, so one
 * axis; the bars are named on the axis and labeled with their exact amounts.
 */
export function PaidVsExpected({ paidCents, expectedCents }: { paidCents: number; expectedCents: number }) {
  const data = [
    { name: "Agreement supports", cents: expectedCents, fill: "#86b6ef" },
    { name: "Carrier paid", cents: paidCents, fill: "var(--series-1)" }
  ];
  return (
    <ResponsiveContainer width="100%" height={112}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 96, bottom: 0, left: 0 }} barCategoryGap={10}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<AmountTooltip />} />
        <Bar dataKey="cents" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map(entry => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
          <LabelList
            dataKey="cents"
            position="right"
            formatter={(value: unknown) => money(Number(value))}
            style={{ fontSize: 12, fill: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Each agency's share of the bonus that was paid, largest first, in one hue. */
export function AgencyShares({ allocation }: { allocation: NonNullable<BonusView["allocation"]> }) {
  const data = [...allocation.agencies]
    .sort((a, b) => b.agencyCents - a.agencyCents)
    .map(share => ({ name: share.name, cents: share.agencyCents, premium: share.eligiblePremiumCents }));

  return (
    <ResponsiveContainer width="100%" height={data.length * 30 + 8}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 80, bottom: 0, left: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="name"
          width={220}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<ShareTooltip />} />
        <Bar dataKey="cents" fill="var(--series-1)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="cents"
            position="right"
            formatter={(value: unknown) => moneyShort(Number(value))}
            style={{ fontSize: 12, fill: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: { name: string; cents: number; premium?: number } }[];
}

function AmountTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">{point.name}</div>
      <div className="tabular font-medium">{money(point.cents)}</div>
    </div>
  );
}

function ShareTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{point.name}</div>
      <div className="tabular">Share {money(point.cents)}</div>
      <div className="tabular text-muted-foreground">Eligible premium {money(point.premium ?? 0)}</div>
    </div>
  );
}
