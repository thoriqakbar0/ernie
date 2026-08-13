import {
  BotIcon,
  Globe2Icon,
  MessagesSquareIcon,
  NetworkIcon,
  PuzzleIcon,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after mount.
 *
 *    0ms   product promise rises into view
 *  140ms   Ernie core settles into place
 *  280ms   plugin surfaces enter (staggered 70ms)
 *  520ms   composition principle appears
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  promiseAppears: 0,   // product promise rises into view
  coreAppears: 140,    // Ernie core settles into place
  pluginsAppear: 280,  // plugin surfaces start entering
  principleAppears: 520, // composition principle appears
} as const;

const PROMISE = {
  offsetY: 14, // px before the copy settles
  spring: { type: 'spring' as const, stiffness: 350, damping: 30 },
} as const;

const CORE = {
  initialScale: 0.94, // scale before appearing
  finalScale: 1,      // resting scale
  spring: { type: 'spring' as const, stiffness: 300, damping: 28 },
} as const;

interface PluginSurface {
  readonly description: string;
  readonly icon: LucideIcon;
  readonly name: string;
}

const PLUGINS = {
  offsetX: 12, // px before each surface settles
  stagger: 0.07, // seconds between surfaces
  spring: { type: 'spring' as const, stiffness: 390, damping: 31 },
  surfaces: [
    { name: 'Agents', description: 'work', icon: BotIcon },
    { name: 'Browser', description: 'browse', icon: Globe2Icon },
    { name: 'Chat', description: 'talk', icon: MessagesSquareIcon },
    { name: 'Subagents', description: 'delegate', icon: NetworkIcon },
  ] satisfies readonly PluginSurface[],
} as const;

const PRINCIPLE = {
  offsetY: 8, // px before the principle settles
  spring: { type: 'spring' as const, stiffness: 360, damping: 32 },
} as const;

/** Introduce Ernie's plugin-first product direction on the new-Agent surface. */
export function JellywareLanding(): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion();
  const finalStage = 4;
  const [stage, setStage] = useState(prefersReducedMotion ? finalStage : 0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setStage(finalStage);
      return;
    }

    setStage(0);
    const timers = [
      window.setTimeout(() => setStage(1), TIMING.promiseAppears),
      window.setTimeout(() => setStage(2), TIMING.coreAppears),
      window.setTimeout(() => setStage(3), TIMING.pluginsAppear),
      window.setTimeout(() => setStage(4), TIMING.principleAppears),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [prefersReducedMotion]);

  return (
    <section
      aria-labelledby="jellyware-heading"
      className="grid gap-8 border-b border-border/70 pb-8 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)] md:items-center"
    >
      <motion.div
        initial={{ opacity: 0, y: PROMISE.offsetY }}
        animate={{
          opacity: stage >= 1 ? 1 : 0,
          y: stage >= 1 ? 0 : PROMISE.offsetY,
        }}
        transition={PROMISE.spring}
      >
        <h2
          id="jellyware-heading"
          className="max-w-xl text-pretty text-[clamp(2.4rem,6vw,5.4rem)] leading-[0.94] font-semibold tracking-[-0.065em] text-foreground"
        >
          Everything is a plugin.
        </h2>
        <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
          Ernie is jellyware for agent work. Keep a tiny core. Add the surfaces
          you need. Replace the rest without rebuilding your world.
        </p>
      </motion.div>

      <div className="relative grid grid-cols-[minmax(8rem,0.8fr)_1fr] items-center gap-4 md:min-h-72">
        <motion.div
          initial={{ opacity: 0, scale: CORE.initialScale }}
          animate={{
            opacity: stage >= 2 ? 1 : 0,
            scale: stage >= 2 ? CORE.finalScale : CORE.initialScale,
          }}
          transition={CORE.spring}
          className="relative z-10 flex min-h-36 flex-col justify-between rounded-2xl border border-foreground/15 bg-card p-4 shadow-[0_1px_0_oklch(0_0_0/5%)]"
        >
          <img
            src="./ernie-logo.png"
            alt=""
            className="size-9 rounded-lg object-cover"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">Ernie core</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Host · lifecycle · trust
            </p>
          </div>
        </motion.div>

        <div className="relative flex flex-col gap-2 before:absolute before:top-4 before:bottom-4 before:-left-2 before:w-px before:bg-border">
          {PLUGINS.surfaces.map((surface, index) => {
            const Icon = surface.icon;
            return (
              <motion.div
                key={surface.name}
                initial={{ opacity: 0, x: PLUGINS.offsetX }}
                animate={{
                  opacity: stage >= 3 ? 1 : 0,
                  x: stage >= 3 ? 0 : PLUGINS.offsetX,
                }}
                transition={{
                  ...PLUGINS.spring,
                  delay: index * PLUGINS.stagger,
                }}
                className="relative flex h-12 items-center gap-3 rounded-xl border border-border bg-background px-3 before:absolute before:top-1/2 before:-left-3 before:h-px before:w-3 before:bg-border"
              >
                <Icon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {surface.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {surface.description}
                </span>
              </motion.div>
            );
          })}
        </div>

        <motion.p
          initial={{ opacity: 0, y: PRINCIPLE.offsetY }}
          animate={{
            opacity: stage >= 4 ? 1 : 0,
            y: stage >= 4 ? 0 : PRINCIPLE.offsetY,
          }}
          transition={PRINCIPLE.spring}
          className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground"
        >
          <PuzzleIcon aria-hidden="true" className="size-3.5" />
          Keep what matters. Replace what does not.
        </motion.p>
      </div>
    </section>
  );
}
