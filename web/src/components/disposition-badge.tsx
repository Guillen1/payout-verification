import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import type { Disposition } from "@/api/types";
import { Badge } from "@/components/ui/badge";

/** Every line ends in one of three outcomes. Each has an icon and a word, never color alone. */
const DISPOSITIONS = {
  clear: { tone: "good", icon: CircleCheck, text: "Clear" },
  dispute: { tone: "critical", icon: CircleAlert, text: "Dispute" },
  review: { tone: "warning", icon: Clock, text: "Review" }
} as const;

export function DispositionBadge({ disposition }: { disposition: Disposition }) {
  const { tone, icon: Icon, text } = DISPOSITIONS[disposition];
  return (
    <Badge tone={tone}>
      <Icon />
      {text}
    </Badge>
  );
}
