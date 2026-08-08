import type { ProcessMetric } from "electron";
import type { RendererPerformanceSample } from "../shared/performance";

/** Minimum interval between resource reads for a renderer process. */
export const RENDERER_PERFORMANCE_SAMPLE_INTERVAL_MS = 1_000;
const RENDERER_PERFORMANCE_CACHE_LIMIT = 8;

/** Narrow source used to read Electron process metrics. */
export interface RendererProcessMetricSource {
  /** Return the current Electron process metrics without retaining them. */
  read(): readonly ProcessMetric[];
}

/**
 * Rate-limits renderer resource sampling and projects only CPU and working-set
 * memory into the IPC-safe diagnostics contract.
 */
export class RendererPerformanceSampler {
  readonly #source: RendererProcessMetricSource;
  readonly #now: () => number;
  readonly #cached = new Map<number, RendererPerformanceSample>();

  /** Create a sampler. Dependencies are explicit so timing policy is testable. */
  constructor(source: RendererProcessMetricSource, now: () => number = Date.now) {
    this.#source = source;
    this.#now = now;
  }

  /**
   * Sample one renderer OS process. Calls within one second return its cached
   * sample, and unknown or malformed process metrics return null.
   */
  sample(rendererPid: number): RendererPerformanceSample | null {
    if (!Number.isSafeInteger(rendererPid) || rendererPid <= 0) return null;
    const now = this.#now();
    const cached = this.#cached.get(rendererPid);
    if (cached !== undefined && now - cached.sampledAtMs < RENDERER_PERFORMANCE_SAMPLE_INTERVAL_MS) return cached;

    const metric = this.#source.read().find((candidate) => candidate.pid === rendererPid);
    if (metric === undefined) return null;
    if (this.#cached.size >= RENDERER_PERFORMANCE_CACHE_LIMIT && !this.#cached.has(rendererPid)) {
      const oldestPid = this.#cached.keys().next().value;
      if (oldestPid !== undefined) this.#cached.delete(oldestPid);
    }
    const cpuPercent = metric.cpu.percentCPUUsage;
    const workingSetBytes = metric.memory.workingSetSize * 1_024;
    if (!Number.isFinite(cpuPercent) || cpuPercent < 0 || !Number.isSafeInteger(workingSetBytes) || workingSetBytes < 0) return null;

    const sample = Object.freeze({ sampledAtMs: now, cpuPercent, workingSetBytes });
    this.#cached.set(rendererPid, sample);
    return sample;
  }
}

