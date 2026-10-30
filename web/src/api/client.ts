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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) throw new ApiError(response.status, body?.message ?? response.statusText);
  return body as T;
}

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
