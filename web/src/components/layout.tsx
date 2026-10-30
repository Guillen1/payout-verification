import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useApprovals, useOverview, usePeriods } from "@/api/client";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { capitalized, useWords } from "@/lib/words";
import { cn } from "@/lib/utils";

export function Layout() {
  const { data: periods } = usePeriods();
  const { data: approvals } = useApprovals();
  const { data: overview } = useOverview();
  const words = useWords();
  const { pathname } = useLocation();
  const latest = periods?.find(entry => entry.hasRun)?.period ?? periods?.[0]?.period;
  const waiting = approvals?.length ?? 0;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-8">
          <span className="text-sm font-semibold whitespace-nowrap">Payout Verification</span>
          <nav className="flex gap-1">
            <Item to="/" end>
              What we found
              {waiting > 0 && <span className="size-1.5 rounded-full bg-warning" aria-label={`${waiting} waiting`} />}
            </Item>
            <Item to={latest ? `/periods/${latest}` : "/"} active={pathname.startsWith("/periods")} end>
              {capitalized(words.payments)}
            </Item>
            {(overview?.checked.bonusPrograms ?? 0) > 0 && <Item to="/bonus">Profit sharing</Item>}
            <Item to="/accuracy">Can we trust it</Item>
          </nav>
          <div className="ml-auto">
            <TenantSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-8 py-12">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-5xl px-8 pb-10 text-xs text-muted-foreground">
        Every business, name, rate and amount here is synthetic.
      </footer>
    </div>
  );
}

function Item({ to, active, end, children }: { to: string; active?: boolean; end?: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
          (active ?? isActive) && "bg-muted font-medium text-foreground"
        )
      }
    >
      {children}
    </NavLink>
  );
}
