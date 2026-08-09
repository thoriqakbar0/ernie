import { describe, expect, it } from "vitest";
import {
  PerformanceMetricsStore,
  PROFILER_MINIMUM_RATING_SAMPLES,
  PROFILER_ROLLING_SAMPLE_LIMIT,
  rateProfilerDuration,
  summarizeProfilerTimings,
} from "../src/renderer/src/performance-metrics";

describe("performance metrics", () => {
  it("reports Collecting state through a null rating until enough samples exist", () => {
    const collecting = summarizeProfilerTimings(Array.from(
      { length: PROFILER_MINIMUM_RATING_SAMPLES - 1 },
      () => ({ actualDurationMs: 8 }),
    ));
    const rated = summarizeProfilerTimings(Array.from(
      { length: PROFILER_MINIMUM_RATING_SAMPLES },
      () => ({ actualDurationMs: 8 }),
    ));

    expect(collecting.rating).toBeNull();
    expect(rated.rating).toBe(rateProfilerDuration(8));
  });

  it("uses p95 and a 16.7 ms frame budget for honest rolling summaries", () => {
    const summary = summarizeProfilerTimings([
      ...Array.from({ length: 19 }, () => ({ actualDurationMs: 4 })),
      { actualDurationMs: 24 },
    ]);

    expect(summary.averageDurationMs).toBe(5);
    expect(summary.p95DurationMs).toBe(4);
    expect(summary.slowRenderPercent).toBe(5);
    expect(summary.rating).toBe(10);
  });

  it("bounds each profiler area's rolling buffer independently", () => {
    const store = new PerformanceMetricsStore();
    for (let index = 0; index < PROFILER_ROLLING_SAMPLE_LIMIT + 5; index += 1) store.record("sidebar", index);
    store.record("main", 7);

    const sidebar = store.summary("sidebar");
    expect(sidebar.sampleCount).toBe(PROFILER_ROLLING_SAMPLE_LIMIT);
    expect(sidebar.averageDurationMs).toBeCloseTo(34.5);
    expect(store.summary("main").sampleCount).toBe(1);
  });

  it("maps the documented rating anchors and rejects malformed timings", () => {
    expect(rateProfilerDuration(4)).toBe(10);
    expect(rateProfilerDuration(50)).toBe(1);
    expect(rateProfilerDuration(Number.NaN)).toBe(1);
    expect(summarizeProfilerTimings([{ actualDurationMs: -1 }]).sampleCount).toBe(0);
  });
});
