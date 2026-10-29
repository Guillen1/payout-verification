import { z } from "zod";

/**
 * How one carrier lays out its commission statement. Adding a carrier, or adapting to a carrier
 * that changed its layout, means writing or editing one of these, not changing code.
 */

const sharedFields = {
  id: z.string().min(1),
  version: z.number().int().positive(),
  carrierId: z.string().min(1),
  /** Pattern removed from policy numbers before matching, for example a term suffix like "-02". */
  policyNumberStripPattern: z.string().optional(),
  /** Carrier product codes mapped to the tenant's products. */
  products: z.record(z.string(), z.string()),
  /** Carrier transaction codes mapped to the tenant's transaction types. */
  transactionTypes: z.record(z.string(), z.enum(["new", "renewal", "cancellation"]))
};

export const CsvFormatSchema = z
  .object({
    ...sharedFields,
    kind: z.literal("csv"),
    /** The exact header row. A statement whose headers differ is held as format drift. */
    headers: z.array(z.string().min(1)).min(1),
    columns: z.object({
      policyNumber: z.string(),
      insuredName: z.string(),
      product: z.string(),
      transactionType: z.string(),
      effectiveDate: z.string(),
      premium: z.string(),
      commission: z.string()
    }),
    dateFormat: z.enum(["YYYY-MM-DD", "MM/DD/YYYY"]),
    /** The row that carries the carrier's control total. */
    totalRow: z.object({
      labelColumn: z.string(),
      label: z.string(),
      amountColumn: z.string()
    })
  })
  .superRefine((format, context) => {
    const referenced = [...Object.values(format.columns), format.totalRow.labelColumn, format.totalRow.amountColumn];
    for (const column of referenced) {
      if (!format.headers.includes(column)) {
        context.addIssue({ code: "custom", message: `Column "${column}" is not one of the format's headers` });
      }
    }
  });

export const PdfFormatSchema = z.object({
  ...sharedFields,
  kind: z.literal("pdf"),
  /** What a reader needs to know about this carrier's layout. Passed to the model as-is. */
  readingNotes: z.string().default("")
});

export const SourceFormatSchema = z.discriminatedUnion("kind", [CsvFormatSchema, PdfFormatSchema]);

export type CsvFormat = z.infer<typeof CsvFormatSchema>;
export type PdfFormat = z.infer<typeof PdfFormatSchema>;
export type SourceFormat = z.infer<typeof SourceFormatSchema>;

export function fileExtension(format: SourceFormat): string {
  return format.kind === "csv" ? "csv" : "pdf";
}
