import { createContext, Profiler, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RendererPerformanceSample } from "../../../../shared/performance";
import { PerformanceMetricsStore, type PerformanceArea, type ProfilerMetricSummary } from "./performance-metrics";

interface PerformanceDiagnosticsContextValue {
  readonly enabled: boolean;
  readonly store: PerformanceMetricsStore;
}

const PerformanceDiagnosticsContext = createContext<PerformanceDiagnosticsContextValue | null>(null);
const RESOURCE_SAMPLE_INTERVAL_MS = 1_000;
const FPS_WINDOW_MS = 1_000;

/** Props for the opt-in performance diagnostics owner and HUD. */
export interface PerformanceHudProps {
  /** Controls all RAF, IPC, and React Profiler collection. */
  readonly enabled: boolean;
  /** Workspace content containing any PerformanceProfiler regions. */
  readonly children?: ReactNode;
}

/** Props for one independently measured React workspace region. */
export interface PerformanceProfilerProps {
  /** Stable region measured and rated by the HUD. */
  readonly area: PerformanceArea;
  /** Region content passed directly through React.Profiler. */
  readonly children: ReactNode;
}

interface GlobalPerformanceMetrics {
  readonly fps: number | null;
  readonly resource: RendererPerformanceSample | null;
}

function useGlobalPerformanceMetrics(enabled: boolean): GlobalPerformanceMetrics {
  const [fps, setFps] = useState<number | null>(null);
  const [resource, setResource] = useState<RendererPerformanceSample | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFps(null);
      return;
    }
    let active = true;
    let frameCount = 0;
    let windowStartedAt = performance.now();
    let animationFrameId = 0;
    const onFrame = (now: number) => {
      if (!active) return;
      frameCount += 1;
      const elapsed = now - windowStartedAt;
      if (elapsed >= FPS_WINDOW_MS) {
        setFps(elapsed > FPS_WINDOW_MS * 2.5 ? null : (frameCount * 1_000) / elapsed);
        frameCount = 0;
        windowStartedAt = now;
      }
      animationFrameId = requestAnimationFrame(onFrame);
    };
    animationFrameId = requestAnimationFrame(onFrame);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setResource(null);
      return;
    }
    let active = true;
    let requestInFlight = false;
    const sample = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const next = await window.ernie.getRendererPerformance();
        if (active) setResource(next);
      } catch {
        if (active) setResource(null);
      } finally {
        requestInFlight = false;
      }
    };
    void sample();
    const intervalId = window.setInterval(() => { void sample(); }, RESOURCE_SAMPLE_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  return { fps, resource };
}

function formatDuration(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function formatProfiler(summary: ProfilerMetricSummary): string {
  if (summary.rating === null) return `Collecting (${summary.sampleCount}/10)`;
  return `${summary.rating}/10 · p95 ${formatDuration(summary.p95DurationMs)} · avg ${formatDuration(summary.averageDurationMs)} · slow ${summary.slowRenderPercent.toFixed(0)}%`;
}

function formatMemory(bytes: number): string {
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MiB`;
}

/**
 * Owns opt-in diagnostics collection and renders a small global/resource and
 * per-region React timing HUD. When disabled it performs no sampling and shows
 * no overlay while continuing to provide children unchanged.
 */
export function PerformanceHud({ enabled, children }: PerformanceHudProps) {
  const store = useMemo(() => new PerformanceMetricsStore(), []);
  const [, setRevision] = useState(0);
  const metrics = useGlobalPerformanceMetrics(enabled);
  useEffect(() => store.subscribe(() => { setRevision((current) => current + 1); }), [store]);
  useEffect(() => { if (!enabled) store.clear(); }, [enabled, store]);
  const contextValue = useMemo(() => ({ enabled, store }), [enabled, store]);
  const sidebar = store.summary("sidebar");
  const main = store.summary("main");

  return (
    <PerformanceDiagnosticsContext.Provider value={contextValue}>
      {children}
      {enabled ? (
        <aside className="performance-hud" aria-label="Performance diagnostics">
          <p className="sr-only">Sidebar and Main ratings use rolling p95 React render duration after ten samples. CPU and memory apply to the renderer process as a whole.</p>
          <header><strong>Performance</strong><span>{metrics.fps === null ? "…" : `${metrics.fps.toFixed(0)} FPS`}</span></header>
          <div className="performance-hud-resources">
            <span>CPU {metrics.resource === null ? "…" : `${metrics.resource.cpuPercent.toFixed(1)}%`}</span>
            <span>RAM {metrics.resource === null ? "…" : formatMemory(metrics.resource.workingSetBytes)}</span>
          </div>
          <div className="performance-hud-regions">
            <section aria-label={`Sidebar React performance: ${formatProfiler(sidebar)}`}>
              <span>Sidebar</span><strong>{sidebar.rating === null ? "…" : `${sidebar.rating}/10`}</strong>
              <small>{sidebar.rating === null ? `${sidebar.sampleCount}/10 samples` : `p95 ${formatDuration(sidebar.p95DurationMs)}`}</small>
            </section>
            <section aria-label={`Main React performance: ${formatProfiler(main)}`}>
              <span>Main</span><strong>{main.rating === null ? "…" : `${main.rating}/10`}</strong>
              <small>{main.rating === null ? `${main.sampleCount}/10 samples` : `p95 ${formatDuration(main.p95DurationMs)}`}</small>
            </section>
          </div>
        </aside>
      ) : null}
    </PerformanceDiagnosticsContext.Provider>
  );
}

/**
 * Measures one Sidebar or Main region when nested under an enabled
 * PerformanceHud. Its Profiler boundary stays mounted so toggling diagnostics
 * never remounts application state; the callback is inert while disabled.
 */
export function PerformanceProfiler({ area, children }: PerformanceProfilerProps) {
  const diagnostics = useContext(PerformanceDiagnosticsContext);
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;
  const onRender = useCallback<ReturnType<PerformanceMetricsStore["profilerCallback"]>>((_id, _phase, actualDuration) => {
    const current = diagnosticsRef.current;
    if (current?.enabled) current.store.record(area, actualDuration);
  }, [area]);
  return <Profiler id={`ernie-performance-${area}`} onRender={onRender}>{children}</Profiler>;
}
