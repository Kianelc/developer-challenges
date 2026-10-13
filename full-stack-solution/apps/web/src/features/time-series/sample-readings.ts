import type { Reading } from "@full-stack-solution/shared";

/**
 * Builds a synthetic series so the ingest form can be exercised without a
 * sensor in the field: a sine wave plus noise, one sample per minute ending
 * at `endingAt`.
 *
 * Timestamps are ISO 8601 with an explicit time zone (`toISOString` yields
 * `Z`), which is what the API requires.
 */
export function generateSampleReadings(
  count: number,
  endingAt: Date = new Date(),
): Reading[] {
  const intervalMs = 60_000;

  return Array.from({ length: count }, (_unused, index) => {
    const offset = (count - 1 - index) * intervalMs;

    return {
      timestamp: new Date(endingAt.getTime() - offset).toISOString(),
      value:
        Number(
          (
            20 +
            5 * Math.sin((index / count) * Math.PI * 4) +
            Math.random()
          ).toFixed(3),
        ),
    };
  });
}
