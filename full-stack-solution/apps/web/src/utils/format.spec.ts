import { describe, expect, it } from "vitest";
import { formatNumber, formatTimestamp } from "./format";

describe("formatNumber", () => {
  it("renders a dash for missing values", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
  });

  it("keeps zero instead of treating it as missing", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("limits the number of decimals", () => {
    // Compared against `toLocaleString` so the test does not depend on the
    // decimal separator of the machine running it.
    expect(formatNumber(1.23456, 2)).toBe((1.23).toLocaleString());
    expect(formatNumber(1.9, 0)).toBe("2");
  });
});

describe("formatTimestamp", () => {
  it("renders a dash for missing or invalid input", () => {
    expect(formatTimestamp(null)).toBe("—");
    expect(formatTimestamp("not-a-date")).toBe("—");
  });

  it("formats a valid ISO timestamp", () => {
    expect(formatTimestamp("2026-01-01T00:00:00.000Z")).not.toBe("—");
  });
});
