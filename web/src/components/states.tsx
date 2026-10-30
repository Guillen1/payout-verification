import { Loader2, Play } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function Loading() {
  return (
    <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Loading
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <Card className="border-critical/30 bg-critical-soft p-5 text-sm text-critical-ink">
      Something went wrong: {error.message}
    </Card>
  );
}

/** A period or program that has not been run yet, with the button that runs it. */
export function NotRunYet({ what, onRun, running }: { what: ReactNode; onRun: () => void; running: boolean }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-8">
      <div className="text-sm font-medium">{what} has not been run yet.</div>
      <p className="text-sm text-muted-foreground">Running reads the files in the inbox and writes the results.</p>
      <RunButton onRun={onRun} running={running} />
    </Card>
  );
}

export function RunButton({ onRun, running, label = "Run" }: { onRun: () => void; running: boolean; label?: string }) {
  return (
    <Button onClick={onRun} disabled={running}>
      {running ? <Loader2 className="animate-spin" /> : <Play />}
      {running ? "Running" : label}
    </Button>
  );
}
