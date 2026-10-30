import { Mail } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * The draft dispute letter, as the carrier would read it. The letter is a template filled by the
 * server from the results, so what is shown here is exactly what would be sent.
 */
export function LetterDialog({
  title,
  useLetter
}: {
  title: string;
  useLetter: (enabled: boolean) => { data?: { markdown: string }; isLoading: boolean };
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useLetter(open);
  const body = data?.markdown.replace(/^<!--.*?-->\s*/s, "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Mail /> Dispute letter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        <DialogDescription className="mb-4 text-sm text-muted-foreground">
          A draft for review before sending. Every figure comes from the reconciliation.
        </DialogDescription>
        {isLoading || !body ? (
          <p className="text-sm text-muted-foreground">Loading</p>
        ) : (
          <div className="rounded-lg border bg-background p-5 text-sm leading-relaxed [&_p]:my-3 [&_table]:my-4 [&_table]:w-full [&_td]:border-t [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:text-muted-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
