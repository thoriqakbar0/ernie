import { describe, expect, it } from "vitest";
import type { ProcessMetric } from "electron";
import { RendererPerformanceSampler } from "../src/main/RendererPerformanceSampler";

function metric(pid: number, cpuPercent = 12.5, workingSetKilobytes = 2_048): ProcessMetric {
  return {
    pid,
    type: "Tab",
    creationTime: 1,
    cpu: { percentCPUUsage: cpuPercent, idleWakeupsPerSecond: 0 },
    memory: { workingSetSize: workingSetKilobytes, peakWorkingSetSize: workingSetKilobytes },
  };
}

describe("RendererPerformanceSampler", () => {
  it("projects only the renderer CPU and working set and rate-limits reads", () => {
    let now = 10_000;
    let reads = 0;
    const sampler = new RendererPerformanceSampler({ read: () => { reads += 1; return [metric(42)]; } }, () => now);

    expect(sampler.sample(42)).toEqual({ sampledAtMs: 10_000, cpuPercent: 12.5, workingSetBytes: 2_097_152 });
    now += 999;
    expect(sampler.sample(42)?.sampledAtMs).toBe(10_000);
    expect(reads).toBe(1);
    now += 1;
    expect(sampler.sample(42)?.sampledAtMs).toBe(11_000);
    expect(reads).toBe(2);
  });

  it("rejects unknown PIDs and malformed process values", () => {
    const sampler = new RendererPerformanceSampler({ read: () => [metric(1, Number.NaN)] }, () => 1);
    expect(sampler.sample(0)).toBeNull();
    expect(sampler.sample(2)).toBeNull();
    expect(sampler.sample(1)).toBeNull();
  });

  it("bounds PID caches and evicts the oldest sample", () => {
    let reads = 0;
    const metrics = Array.from({ length: 9 }, (_, index) => metric(index + 1));
    const sampler = new RendererPerformanceSampler({ read: () => { reads += 1; return metrics; } }, () => 1_000);
    for (const process of metrics) sampler.sample(process.pid);
    expect(reads).toBe(9);

    sampler.sample(1);
    expect(reads).toBe(10);
    sampler.sample(9);
    expect(reads).toBe(10);
  });
});
