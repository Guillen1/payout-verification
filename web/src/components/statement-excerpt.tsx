import { getDocument, type RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { useStatementCsv, useStatementPdf } from "@/api/client";
import { Loading } from "@/components/states";
import { parseCsv } from "@/lib/csv";
import { findLine, type LineMark } from "@/lib/pdf";
import { cn } from "@/lib/utils";

/** The printed page the line came from, with the line marked where it is printed. */
export function PdfExcerpt({
  period,
  carrierId,
  page,
  findText,
  occurrence
}: {
  period: string;
  carrierId: string;
  page: number;
  /** Text printed on the line, used to find it on the page. */
  findText: string;
  /** Which printing of that text on the page is the line: 0 for the first, 1 for a repeat below it. */
  occurrence: number;
}) {
  const { data } = useStatementPdf(period, carrierId, true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<LineMark | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!data || !canvas.current) return;
    const target = canvas.current;
    const loading = getDocument({ data: data.slice() });
    let render: RenderTask | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const document = await loading.promise;
        const pdfPage = await document.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale: 2 });
        target.width = viewport.width;
        target.height = viewport.height;
        render = pdfPage.render({ canvas: target, viewport });
        await render.promise;

        const found = await findLine(pdfPage, viewport, findText, occurrence);
        if (!cancelled && found) setMark(found);
      } catch {
        // Cancelling a render on close rejects it; only a failure while still open is worth showing.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      render?.cancel();
      void loading.destroy();
    };
  }, [data, page, findText, occurrence]);

  // Scroll the page inside its frame, not the dialog, so the figures above stay in view.
  useEffect(() => {
    const box = frame.current;
    if (!box || !mark) return;
    box.scrollTo({ top: mark.top * box.scrollHeight - box.clientHeight / 2, behavior: "smooth" });
  }, [mark]);

  if (failed) return <p className="text-sm text-muted-foreground">The page could not be drawn.</p>;
  return (
    <div ref={frame} className="max-h-[380px] overflow-y-auto rounded-lg border bg-white">
      {!data && <Loading />}
      <div className="relative">
        <canvas ref={canvas} className="block h-auto w-full" />
        {mark && (
          <div
            className="animate-rise absolute inset-x-1 rounded border-2 border-warning bg-warning/20"
            style={{ top: `${mark.top * 100}%`, height: `${mark.height * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The rows around the line in the carrier's CSV, with the line marked. Only the columns that matter
 * are shown, under the carrier's own names; the last is what was paid.
 */
export function CsvExcerpt({
  period,
  carrierId,
  row,
  columns
}: {
  period: string;
  carrierId: string;
  row: number;
  columns: string[];
}) {
  const { data } = useStatementCsv(period, carrierId, true);
  if (!data) return <Loading />;
  const [fileHeader = [], ...fileRows] = parseCsv(data);
  const picked = columns.map(name => fileHeader.indexOf(name)).filter(index => index >= 0);
  const header = picked.map(index => fileHeader[index]!);
  const body = fileRows.map(cells => picked.map(index => cells[index] ?? ""));
  const index = row - 2; // the file's row numbers count the header as row 1
  const from = Math.max(0, index - 2);
  const shown = body.slice(from, index + 3);

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full font-mono text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-right font-normal">row</th>
            {header.map((cell, column) => (
              <th
                key={cell}
                className={cn(
                  "px-3 py-2 font-normal whitespace-nowrap",
                  column >= header.length - 2 ? "text-right" : "text-left"
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((cells, offset) => {
            const marked = from + offset === index;
            return (
              <tr key={from + offset} className={cn("border-t", marked && "animate-rise bg-warning/20 font-medium")}>
                <td className="px-3 py-2 text-right text-muted-foreground">{from + offset + 2}</td>
                {cells.map((cell, column) => (
                  <td
                    key={column}
                    className={cn(
                      "px-3 py-2 whitespace-nowrap",
                      column >= cells.length - 2 && "text-right",
                      marked && column === cells.length - 1 && "text-critical-ink"
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
