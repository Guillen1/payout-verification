import { Landmark, LayoutDashboard, Scale, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useApprovals, usePeriods } from "@/api/client";
import { cn } from "@/lib/utils";

export function Layout() {
  const { data: periods } = usePeriods();
  const { data: approvals } = useApprovals();
  const waiting = approvals?.length ?? 0;
  const { pathname } = useLocation();
  const latest = periods?.find(entry => entry.hasRun)?.period ?? periods?.[0]?.period;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-card px-3 py-5">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Payout Verification</div>
            <div className="text-xs text-muted-foreground">Agency network</div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          <Item to="/" icon={<LayoutDashboard />} end>
            Overview
            {waiting > 0 && (
              <span className="ml-auto rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning-ink">
                {waiting}
              </span>
            )}
          </Item>
          <Item
            to={latest ? `/periods/${latest}` : "/"}
            icon={<Landmark />}
            active={pathname.startsWith("/periods")}
            end
          >
            Commissions
          </Item>
          <Item to="/bonus" icon={<Scale />}>
            Profit sharing
          </Item>
          <Item to="/accuracy" icon={<ShieldCheck />}>
            AI accuracy
          </Item>
        </nav>

        <p className="mt-auto px-2 text-xs leading-relaxed text-muted-foreground">
          Synthetic data. Every carrier, agency, rate and amount is invented.
        </p>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Item({
  to,
  icon,
  active,
  end,
  children
}: {
  to: string;
  icon: ReactNode;
  active?: boolean;
  end?: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4",
          (isActive || active) && "bg-accent font-medium text-foreground"
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}
