import { GlobalWorkerOptions, type PageViewport, type PDFPageProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Where a printed line sits on its page, as fractions of the page height. */
export interface LineMark {
  top: number;
  height: number;
}

/**
 * Finds a printed line on a page by text printed on it: the occurrence-th printing of that text,
 * since a duplicate line prints the same text again right below the original.
 */
export async function findLine(
  page: PDFPageProxy,
  viewport: PageViewport,
  text: string,
  occurrence: number
): Promise<LineMark | null> {
  const content = await page.getTextContent();
  const printed = content.items.filter(entry => "str" in entry && entry.str.trim() === text.trim());
  const item = printed[occurrence] ?? printed[0];
  if (!item || !("transform" in item)) return null;
  const [, baseline] = viewport.convertToViewportPoint(item.transform[4] as number, item.transform[5] as number) as [
    number,
    number
  ];
  const lineHeight = item.height * viewport.scale;
  return {
    top: (baseline - lineHeight * 1.25) / viewport.height,
    height: (lineHeight * 1.75) / viewport.height
  };
}

/** Which printing of its text a line is: how many earlier lines on its page print the same text. */
export function occurrenceOf<T extends { page: number | null; row: number; insuredName: string }>(
  line: T,
  lines: readonly T[]
): number {
  return lines.filter(
    other => other.page === line.page && other.row < line.row && other.insuredName === line.insuredName
  ).length;
}
