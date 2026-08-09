// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceHud, PerformanceProfiler } from "../src/renderer/src/performance-hud";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const originalAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

afterEach(() => {
  window.requestAnimationFrame = originalAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
  vi.restoreAllMocks();
});

describe("PerformanceHud", () => {
  it("does not sample frames or resources while disabled", async () => {
    let animationFrameCalls = 0;
    let resourceCalls = 0;
    window.requestAnimationFrame = () => { animationFrameCalls += 1; return 1; };
    window.cancelAnimationFrame = () => {};
    Object.defineProperty(window, "ernie", {
      configurable: true,
      value: { getRendererPerformance: async () => { resourceCalls += 1; return null; } },
    });
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<PerformanceHud enabled={false}>
        <PerformanceProfiler area="main"><div>Main content</div></PerformanceProfiler>
      </PerformanceHud>);
      await Promise.resolve();
    });

    expect(animationFrameCalls).toBe(0);
    expect(resourceCalls).toBe(0);
    expect(container.querySelector('[aria-label="Performance diagnostics"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it("preserves measured subtree state when diagnostics are toggled", async () => {
    let mounts = 0;
    function StatefulRegion() {
      const [mount] = useState(() => { mounts += 1; return mounts; });
      return <div>Mount {mount}</div>;
    }
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    Object.defineProperty(window, "ernie", { configurable: true, value: { getRendererPerformance: async () => null } });
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(<PerformanceHud enabled={false}>
      <PerformanceProfiler area="main"><StatefulRegion /></PerformanceProfiler>
    </PerformanceHud>));
    await act(async () => root.render(<PerformanceHud enabled>
      <PerformanceProfiler area="main"><StatefulRegion /></PerformanceProfiler>
    </PerformanceHud>));

    expect(mounts).toBe(1);
    expect(container.textContent).toContain("Mount 1");
    await act(async () => root.unmount());
  });

  it("mounts both measured regions without creating a profiler update loop", async () => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    Object.defineProperty(window, "ernie", {
      configurable: true,
      value: { getRendererPerformance: async () => null },
    });
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<PerformanceHud enabled>
        <PerformanceProfiler area="sidebar"><div>Sidebar content</div></PerformanceProfiler>
        <PerformanceProfiler area="main"><div>Main content</div></PerformanceProfiler>
      </PerformanceHud>);
      await Promise.resolve();
    });

    expect(container.querySelector('[aria-label="Performance diagnostics"]')).not.toBeNull();
    expect(container.textContent).toContain("Sidebar content");
    expect(container.textContent).toContain("Main content");
    await act(async () => root.unmount());
  });
});
