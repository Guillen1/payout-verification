import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { chooseTenant, currentTenant, useTenants } from "@/api/client";
import { cn } from "@/lib/utils";

/** One click between the businesses the same engine runs: the screens stay, the words and numbers change. */
export function TenantSwitcher() {
  const { data: tenants } = useTenants();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (!tenants || tenants.length < 2) return null;
  const active = currentTenant() ?? tenants[0]!.id;

  const choose = (id: string) => {
    if (id === active) return;
    chooseTenant(id);
    queryClient.removeQueries({ predicate: query => query.queryKey[0] !== "tenants" });
    void navigate("/");
  };

  return (
    <div className="flex rounded-full bg-muted p-1 text-xs" role="radiogroup" aria-label="Business">
      {tenants.map(tenant => (
        <button
          key={tenant.id}
          role="radio"
          aria-checked={tenant.id === active}
          onClick={() => choose(tenant.id)}
          className={cn(
            "rounded-full px-3 py-1 whitespace-nowrap transition-colors",
            tenant.id === active
              ? "bg-card font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tenant.name.replace(/ \(synthetic\)$/, "")}
        </button>
      ))}
    </div>
  );
}
