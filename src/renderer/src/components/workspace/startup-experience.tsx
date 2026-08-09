import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * STARTUP STORYBOARD
 *
 * Read top-to-bottom. Each value is ms after startup begins.
 *
 *    0ms   atmospheric glass surfaces are present
 *   80ms   Prime glyph resolves from blur and lifts into place
 *  220ms   status copy enters beneath the glyph
 *  420ms   progress light and activity bars begin their loop
 * ───────────────────────────────────────────────────────── */
const TIMING = {
  glyphResolve: 80,  // glyph resolves and lifts
  copyEnter: 220,    // status title and detail enter
  activityBegin: 420, // progress and activity loop become visible
} as const;

const ACTIVITY_BARS = [0, 1, 2] as const;

/** Drives the additive startup choreography from one stage value. */
export function useStartupStoryboard(active: boolean): number {
  const [stage, setStage] = useState(active ? 0 : 3);

  useEffect(() => {
    if (!active) {
      setStage(3);
      return;
    }

    setStage(0);
    const timers = [
      window.setTimeout(() => setStage(1), TIMING.glyphResolve),
      window.setTimeout(() => setStage(2), TIMING.copyEnter),
      window.setTimeout(() => setStage(3), TIMING.activityBegin),
    ];
    return () => { for (const timer of timers) window.clearTimeout(timer); };
  }, [active]);

  return stage;
}

function PrimeGlyph({ compact = false }: { readonly compact?: boolean }) {
  return <span className={`startup-glyph ${compact ? "compact" : ""}`} aria-hidden="true">
    <span className="startup-glyph-orbit" />
    <span className="startup-glyph-core" />
  </span>;
}

function ActivityBars() {
  return <span className="startup-activity" aria-hidden="true">
    {ACTIVITY_BARS.map((bar) => <span key={bar} className={`bar-${bar}`} />)}
  </span>;
}

/** Dia-inspired ambient status card shown in the project rail during startup. */
export function StartupRail({ stage }: { readonly stage: number }) {
  return <section
    className={`startup-rail ${stage >= 1 ? "show-glyph" : ""} ${stage >= 2 ? "show-copy" : ""} ${stage >= 3 ? "show-activity" : ""}`}
    data-startup-experience="rail"
    role="status"
    aria-live="polite"
  >
    <span className="startup-rail-aurora" aria-hidden="true" />
    <div className="startup-rail-heading">
      <PrimeGlyph />
      <div className="startup-rail-copy">
        <strong>Starting Prime Agent</strong>
        <span>Connecting to the model and tools…</span>
      </div>
    </div>
    <div className="startup-progress" aria-hidden="true"><span /></div>
    <div className="startup-rail-meta"><span>Local workspace</span><ActivityBars /></div>
  </section>;
}

/** Purposeful composer-sized placeholder shown while Prime Agent becomes ready. */
export function StartupComposer({ stage }: { readonly stage: number }) {
  return <div
    className={`composer startup-composer ${stage >= 1 ? "show-glyph" : ""} ${stage >= 2 ? "show-copy" : ""} ${stage >= 3 ? "show-activity" : ""}`}
    data-startup-experience="composer"
    aria-hidden="true"
  >
    <span className="startup-composer-aurora" />
    <div className="startup-composer-main">
      <PrimeGlyph compact />
      <div className="startup-composer-copy">
        <strong>Starting Prime Agent</strong>
        <span>Connecting to the model and tools…</span>
      </div>
      <ActivityBars />
    </div>
    <div className="startup-composer-footer">
      <span>Prime Agent</span>
      <span className="startup-composer-state"><i />Connecting to the model and tools…</span>
    </div>
  </div>;
}
