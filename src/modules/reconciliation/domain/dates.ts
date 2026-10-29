/** A calendar date written "YYYY-MM-DD". Plain-date strings sort and compare correctly as text. */
export type IsoDate = string;

/** A monthly accounting period written "YYYY-MM". */
export type Period = string;

export type DateFormat = "YYYY-MM-DD" | "MM/DD/YYYY";

export function parseDate(text: string, format: DateFormat): IsoDate {
  const trimmed = text.trim();
  const parts =
    format === "YYYY-MM-DD"
      ? /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(trimmed)?.groups
      : /^(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{4})$/.exec(trimmed)?.groups;

  if (!parts?.year || !parts.month || !parts.day) {
    throw new Error(`Not a ${format} date: "${text}"`);
  }
  return toIsoDate(Number(parts.year), Number(parts.month), Number(parts.day));
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate) {
    throw new Error(`Not a calendar date: ${year}-${month}-${day}`);
  }
  return date.toISOString().slice(0, 10);
}

export function periodOf(date: IsoDate): Period {
  return date.slice(0, 7);
}

export function isPeriod(text: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text);
}
