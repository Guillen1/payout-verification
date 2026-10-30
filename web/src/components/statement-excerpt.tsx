import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { useStatementCsv, useStatementPdf } from "@/api/client";
import { Loading } from "@/components/states";
import { parseCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

GlobalWorkerOptions.workerSrc = workerUrl;

/** The printed page the line came from, with the line marked where it is printed. */
export function PdfExcerpt({
  period,
  carrierId,
  page,
  findText
}: {
  period: string;
  carrierId: string;
  page: number;
  /** Text printed on the line, used to find it on the page. */
  findText: string;
}) {
  const { data } = useStatementPdf(period, carrierId, true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mark, setMark] = useState<{ top: number; height: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || !canvas.current) return;
    let cancelled = false;
    const target = canvas.current;
    void (async () => {
      const document = await getDocument({ data: data.slice() }).promise;
      const pdfPage = await document.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 2 });
      target.width = viewport.width;
      target.height = viewport.height;
      await pdfPage.render({ canvas: target, viewport }).promise;

      const text = await pdfPage.getTextContent();
      const item = text.items.find(entry => "str" in entry && entry.str.trim() === findText.trim());
      if (cancelled || !item || !("transform" in item)) return;
      const [, baseline] = viewport.convertToViewportPoint(
        item.transform[4] as number,
        item.transform[5] as number
      ) as [number, number];
      const lineHeight = item.height * 2;
      setMark({
        top: (baseline - lineHeight * 1.25) / viewport.height,
        height: (lineHeight * 1.75) / viewport.height
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [data, page, findText]);

  // Scroll the page inside its frame, not the dialog, so the figures above stay in view.
  useEffect(() => {
    const box = frame.current;
    if (!box || !mark) return;
    box.scrollTo({ top: mark.top * box.scrollHeight - box.clientHeight / 2, behavior: "smooth" });
  }, [mark]);

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
