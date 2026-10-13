import "@testing-library/jest-dom/vitest";

/**
 * jsdom does not implement `ResizeObserver`, which Recharts'
 * `ResponsiveContainer` requires. A no-op stub is enough: the tests assert on
 * data and behavior, not on rendered pixel sizes.
 */
class ResizeObserverStub {
  observe(): void {
    return undefined;
  }
  unobserve(): void {
    return undefined;
  }
  disconnect(): void {
    return undefined;
  }
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
