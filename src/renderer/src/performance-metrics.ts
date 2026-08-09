import type { ProfilerOnRenderCallback } from "react";

/** The two independently measured workspace regions. */
export type PerformanceArea = "sidebar" | "main";

/** Number of React render samples retained for each measured region. */
export const PROFILER_ROLLING_SAMPLE_LIMIT = 60;
/** Samples required before a profiler rating is presented. */
export const PROFILER_MINIMUM_RATING_SAMPLES = 10;

/** A bounded summary of recent React Profiler render durations. */
export interface ProfilerMetricSummary {
  readonly sampleCount: number;
  readonly averageDurationMs: number;
  readonly p95DurationMs: number;
  readonly slowRenderPercent: number;
  /** A 1–10 responsiveness rating, or null while samples are still collecting. */
  readonly rating: number | null;
}

/** One React Profiler observation, limited to timing data. */
export interface ProfilerTimingSample {
  readonly actualDurationMs: number;
}

/**
 * Convert a p95 React render duration to a 1–10 responsiveness rating.
 * A p95 at or below 4 ms earns 10; one at or above 50 ms earns 1, with a
 * linear scale between. This rates measured render cost, not overall UX quality.
 */
export function rateProfilerDuration(p95DurationMs: number): number {
  if (!Number.isFinite(p95DurationMs) || p95DurationMs < 0) return 1;
  const normalized = Math.min(1, Math.max(0, (p95DurationMs - 4) / 46));
  return Math.min(10, Math.max(1, Math.round(10 - (9 * normalized))));
}

/** Summarize recent render timings without retaining component data or props. */
export function summarizeProfilerTimings(samples: readonly ProfilerTimingSample[]): ProfilerMetricSummary {
  const valid = samples
    .map((sample) => sample.actualDurationMs)
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  if (valid.length === 0) return { sampleCount: 0, averageDurationMs: 0, p95DurationMs: 0, slowRenderPercent: 0, rating: null };

  const sorted = [...valid].sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const p95DurationMs = sorted[p95Index] ?? 0;
  const averageDurationMs = valid.reduce((total, duration) => total + duration, 0) / valid.length;
  const slowRenderPercent = (valid.filter((duration) => duration > (1_000 / 60)).length / valid.length) * 100;
  return {
    sampleCount: valid.length,
    averageDurationMs,
    p95DurationMs,
    slowRenderPercent,
    rating: valid.length < PROFILER_MINIMUM_RATING_SAMPLES ? null : rateProfilerDuration(p95DurationMs),
  };
}

/** Bounded timing store used by a single diagnostics owner. */
export class PerformanceMetricsStore {
  readonly #samples: Record<PerformanceArea, ProfilerTimingSample[]> = { sidebar: [], main: [] };
  readonly #listeners = new Set<() => void>();

  /** Record one finite non-negative render duration for an area. */
  record(area: PerformanceArea, actualDurationMs: number): void {
    if (!Number.isFinite(actualDurationMs) || actualDurationMs < 0) return;
    const samples = this.#samples[area];
    samples.push({ actualDurationMs });
    if (samples.length > PROFILER_ROLLING_SAMPLE_LIMIT) samples.splice(0, samples.length - PROFILER_ROLLING_SAMPLE_LIMIT);
    for (const listener of this.#listeners) listener();
  }

  /** Read a fresh immutable summary of one region's rolling timings. */
  summary(area: PerformanceArea): ProfilerMetricSummary {
    return summarizeProfilerTimings(this.#samples[area]);
  }

  /** Subscribe to timing changes. The returned function releases the subscription. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  /** Remove all collected samples, typically when diagnostics are disabled. */
  clear(): void {
    this.#samples.sidebar.length = 0;
    this.#samples.main.length = 0;
    for (const listener of this.#listeners) listener();
  }

  /** Create a React Profiler callback that records only render duration. */
  profilerCallback(area: PerformanceArea): ProfilerOnRenderCallback {
    return (_id, _phase, actualDuration) => { this.record(area, actualDuration); };
  }
}
