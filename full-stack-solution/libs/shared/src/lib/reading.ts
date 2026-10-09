import { z } from "zod";

export const MAX_READINGS_PER_BATCH = 5000;

const timestampSchema = z.iso
  .datetime({
    offset: true,
    message: "Timestamp must be an ISO 8601 date-time with a time zone",
  })
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Timestamp is not a valid date",
  });

export const readingSchema = z.object({
  timestamp: timestampSchema,
  value: z.number(),
});
export type Reading = z.infer<typeof readingSchema>;

export const createReadingsSchema = z.object({
  readings: z
    .array(readingSchema)
    .min(1, "Send at least one reading")
    .max(
      MAX_READINGS_PER_BATCH,
      `Send at most ${MAX_READINGS_PER_BATCH} readings per request`,
    ),
});
export type CreateReadingsInput = z.infer<typeof createReadingsSchema>;

// Both bounds are inclusive; an omitted bound leaves that side open.
export const readingsRangeQuerySchema = z
  .object({
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
  })
  .refine(
    ({ from, to }) => !from || !to || Date.parse(from) <= Date.parse(to),
    { message: "from must not be after to", path: ["from"] },
  );
export type ReadingsRangeQuery = z.infer<typeof readingsRangeQuerySchema>;

export interface InsertReadingsResult {
  received: number;
  inserted: number;
}

export interface DeleteReadingsResult {
  deleted: number;
}

export interface ReadingsMetrics {
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
}

export interface TimeSeriesCount {
  count: number;
}
