import { describe, expect, it } from "vitest";
import { createReadingsSchema } from "@full-stack-solution/shared";
import { generateSampleReadings } from "./sample-readings";

describe("generateSampleReadings", () => {
  it("produces readings the API schema accepts", () => {
    const readings = generateSampleReadings(10);

    expect(createReadingsSchema.safeParse({ readings }).success).toBe(true);
  });

  it("emits one sample per minute in ascending order, ending at the given time", () => {
    const endingAt = new Date("2026-01-01T12:00:00.000Z");
    const readings = generateSampleReadings(3, endingAt);

    expect(readings.map((reading) => reading.timestamp)).toEqual([
      "2026-01-01T11:58:00.000Z",
      "2026-01-01T11:59:00.000Z",
      "2026-01-01T12:00:00.000Z",
    ]);
  });
});
