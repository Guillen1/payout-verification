import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BonusProgramSummary,
  BonusView,
  HealthView,
  OverviewView,
  PendingApproval,
  PeriodSummary,
  PeriodView
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const TENANT_KEY = "payout-verification.tenant";

/** The business the admin is showing, remembered per browser; the server's first one until chosen. */
let tenant: string | null = readStoredTenant();

function readStoredTenant(): string | null {
  try {
    return localStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
}

export function currentTenant(): string | null {
  return tenant;
}

/** Switches the business every later request is for. The caller clears cached data. */
export function chooseTenant(id: string): void {
  tenant = id;
  try {
    localStorage.setItem(TENANT_KEY, id);
  } catch {
    // Remembering the choice is a convenience; the switch still works for this visit.
  }
}

function tenantHeader(): Record<string, string> {
  return tenant ? { "X-Tenant": tenant } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...tenantHeader(), ...init?.headers }
  });
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) throw new ApiError(response.status, body?.message ?? response.statusText);
  return body as T;
}

/** A carrier's statement file as it arrived: the PDF's bytes or the CSV's text. */
async function statementFile(period: string, carrierId: string): Promise<Response> {
  const response = await fetch(`/api/periods/${period}/statements/${carrierId}`, { headers: tenantHeader() });
  if (!response.ok) throw new ApiError(response.status, response.statusText);
  return response;
}

export const useStatementPdf = (period: string, carrierId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["periods", period, "statements", carrierId, "pdf"],
    queryFn: async () => new Uint8Array(await (await statementFile(period, carrierId)).arrayBuffer()),
    enabled,
    staleTime: Infinity
  });

export const useStatementCsv = (period: string, carrierId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["periods", period, "statements", carrierId, "csv"],
    queryFn: async () => (await statementFile(period, carrierId)).text(),
    enabled,
    staleTime: Infinity
  });

export const useTenants = () =>
  useQuery({ queryKey: ["tenants"], queryFn: () => request<{ id: string; name: string }[]>("/tenants") });

export const useOverview = () =>
  useQuery({ queryKey: ["overview"], queryFn: () => request<OverviewView>("/overview") });

export const usePeriods = () =>
  useQuery({ queryKey: ["periods"], queryFn: () => request<PeriodSummary[]>("/periods") });

export const usePeriod = (period: string) =>
  useQuery({ queryKey: ["periods", period], queryFn: () => request<PeriodView>(`/periods/${period}`), retry: false });

export const useCommissionLetter = (period: string, carrierId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["periods", period, "disputes", carrierId],
    queryFn: () => request<{ markdown: string }>(`/periods/${period}/disputes/${carrierId}`),
    enabled
  });

export const useBonusPrograms = () =>
  useQuery({ queryKey: ["bonus"], queryFn: () => request<BonusProgramSummary[]>("/bonus") });

export const useBonus = (programId: string) =>
  useQuery({ queryKey: ["bonus", programId], queryFn: () => request<BonusView>(`/bonus/${programId}`), retry: false });

export const useBonusLetter = (programId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["bonus", programId, "letter"],
    queryFn: () => request<{ markdown: string }>(`/bonus/${programId}/dispute-letter`),
    enabled
  });

export const useApprovals = () =>
  useQuery({ queryKey: ["approvals"], queryFn: () => request<PendingApproval[]>("/approvals") });

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: () => request<HealthView>("/health") });

/** Every write changes what other pages show, so each one refreshes everything. */
function useWrite<Input, Output>(write: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: write, onSuccess: () => queryClient.invalidateQueries() });
}

export const useRunPeriod = () =>
  useWrite((period: string) => request<PeriodView>(`/periods/${period}/runs`, { method: "POST" }));

export const useRunBonus = () =>
  useWrite((programId: string) => request<BonusView>(`/bonus/${programId}/runs`, { method: "POST" }));

export const useApprove = () =>
  useWrite(({ id, approvedBy }: { id: string; approvedBy: string }) =>
    request<{ file: string }>(`/approvals/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ approvedBy })
    })
  );
