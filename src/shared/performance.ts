/** A renderer-process resource sample safe to expose across IPC. */
export interface RendererPerformanceSample {
  /** Unix epoch milliseconds at which Electron read the process metrics. */
  readonly sampledAtMs: number;
  /** Renderer CPU usage as reported by Electron, in percentage points. */
  readonly cpuPercent: number;
  /** Renderer working-set memory in bytes. */
  readonly workingSetBytes: number;
}
