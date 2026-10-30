import type { Target } from "@/api/types";

/** Where in the admin something the overview mentions lives. */
export function linkTo(target: Target): string {
  return target.kind === "carrier"
    ? `/periods/${target.period}/carriers/${target.carrierId}`
    : `/bonus/${target.programId}`;
}
