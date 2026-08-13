import { useEffect, useState } from 'react';

import type { PrimeAgentWorkspaceConnection } from '@/packages/prime-agent-daemon/types';

interface DebugTarget {
  readonly detail: string;
  readonly element: string;
  readonly name: string;
}

interface DebugHudProps {
  readonly connection: PrimeAgentWorkspaceConnection;
  readonly loadingOperations: readonly string[];
  readonly status: string;
}

function debugTargetFromEventTarget(target: EventTarget | null): DebugTarget | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest(
    '[aria-label], button, a, input, textarea, select, [role], [data-slot]',
  );
  if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
    return null;
  }

  const tagName = element.tagName.toLowerCase();
  const accessibleName =
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.getAttribute('name') ??
    element.getAttribute('placeholder') ??
    element.id;
  const name = accessibleName || `unnamed ${tagName}`;
  const details: string[] = [];
  const slot = element.getAttribute('data-slot');
  const role = element.getAttribute('role');
  const current = element.getAttribute('aria-current');
  const description = element.getAttribute('aria-description');
  if (slot !== null) details.push(`slot ${slot}`);
  if (role !== null) details.push(`role ${role}`);
  if (current !== null) details.push(`current ${current}`);
  if (description !== null) details.push(description);
  if (element.getAttribute('data-active') === 'true') details.push('active');

  return {
    detail: details.length === 0 ? 'no semantic state' : details.join(' · '),
    element: tagName,
    name,
  };
}

/** Show temporary local evidence about clicked elements and active loading work. */
export function DebugHud({
  connection,
  loadingOperations,
  status,
}: DebugHudProps): React.JSX.Element {
  const [lastTarget, setLastTarget] = useState<DebugTarget | null>(null);

  useEffect(() => {
    const recordClick = (event: MouseEvent): void => {
      const nextTarget = debugTargetFromEventTarget(event.target);
      if (nextTarget !== null) setLastTarget(nextTarget);
    };
    window.addEventListener('click', recordClick, true);
    return () => window.removeEventListener('click', recordClick, true);
  }, []);

  return (
    <aside
      aria-label="Interface debug HUD"
      className="pointer-events-none fixed top-14 end-3 z-50 w-[min(20rem,calc(100vw-1.5rem))] select-text rounded-xl border border-border/80 bg-background/95 p-3 font-mono text-[11px] leading-5 text-foreground shadow-lg backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
        <strong className="font-semibold">Interface debug</strong>
        <span className="text-muted-foreground">temporary</span>
      </div>

      <dl className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
        <dt className="text-muted-foreground">clicked</dt>
        <dd className="min-w-0 break-words">
          {lastTarget === null ? 'Nothing yet' : lastTarget.name}
        </dd>
        <dt className="text-muted-foreground">element</dt>
        <dd className="min-w-0 break-words">
          {lastTarget === null
            ? '—'
            : `${lastTarget.element} · ${lastTarget.detail}`}
        </dd>
        <dt className="text-muted-foreground">connection</dt>
        <dd>{connection}</dd>
        <dt className="text-muted-foreground">loading</dt>
        <dd className="min-w-0 break-words">
          {loadingOperations.length === 0
            ? 'idle'
            : loadingOperations.join(' · ')}
        </dd>
        <dt className="text-muted-foreground">status</dt>
        <dd className="min-w-0 break-words">{status.trim() || 'none'}</dd>
      </dl>
    </aside>
  );
}
