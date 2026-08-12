import { ChevronRightIcon, ExternalLinkIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AgentPluginViewContext } from '@/packages/agent-plugin-context';
import type { AgentPluginViewContextProvider } from '@/packages/agent-plugin-context';
import type { PrimeAgentSpawnedSession } from '@/packages/prime-agent-daemon/client';
import type {
  PluginActivationContext,
  PluginModule,
} from '@/packages/plugin-host';
import {
  subagentsPluginManifest,
  subagentsPluginViewId,
} from '@/packages/subagents-plugin';

function durationLabel(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  return durationMs < 1_000
    ? `${Math.round(durationMs)}ms`
    : `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function descendantCount(
  sessionId: string,
  childrenByParent: ReadonlyMap<string | null, readonly PrimeAgentSpawnedSession[]>,
): number {
  const children = childrenByParent.get(sessionId) ?? [];
  return children.reduce(
    (total, child) => total + 1 + descendantCount(child.id, childrenByParent),
    0,
  );
}

function SubagentBranch({
  session,
  childrenByParent,
  onOpenSession,
}: {
  readonly session: PrimeAgentSpawnedSession;
  readonly childrenByParent: ReadonlyMap<
    string | null,
    readonly PrimeAgentSpawnedSession[]
  >;
  readonly onOpenSession: (activeSessionId: string) => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const children = childrenByParent.get(session.id) ?? [];
  const descendants = descendantCount(session.id, childrenByParent);
  const statusLabel =
    session.status === 'queued'
      ? 'waiting'
      : session.status === 'error'
        ? 'failed'
        : session.status === 'cancelled'
          ? 'interrupted'
          : session.status;
  const statusTone =
    session.status === 'error'
      ? 'text-destructive'
      : session.status === 'done'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';

  return (
    <li>
      <div className="flex min-h-8 items-start gap-1 rounded-lg px-2 py-1.5 hover:bg-muted/50">
        {children.length === 0 ? (
          <span className="size-6 shrink-0" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${session.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={`size-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="min-w-0 truncate text-start font-medium text-foreground hover:underline disabled:no-underline"
                disabled={session.activeSessionId === null}
                onClick={() => {
                  if (session.activeSessionId !== null) {
                    onOpenSession(session.activeSessionId);
                  }
                }}
              >
                {session.name}
              </button>
              {session.activeSessionId === null ? null : (
                <ExternalLinkIcon
                  aria-hidden="true"
                  className="size-3 text-muted-foreground"
                />
              )}
              {descendants === 0 ? null : (
                <span
                  aria-label={`${descendants} nested ${descendants === 1 ? 'agent' : 'agents'}`}
                  className="text-muted-foreground"
                >
                  {descendants}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className={`font-medium ${statusTone}`}>{statusLabel}</span>
              {durationLabel(session.durationMs) === null ? null : (
                <span className="text-muted-foreground">
                  {durationLabel(session.durationMs)}
                </span>
              )}
            </div>
          </div>
          {session.recap === null && session.error === null ? null : (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {session.error ?? session.recap}
            </p>
          )}
        </div>
      </div>
      {!expanded || children.length === 0 ? null : (
        <ul
          data-slot="spawned-agent-children"
          className="ms-5 mt-1 flex flex-col gap-1"
        >
          {children.map((child) => (
            <SubagentBranch
              key={child.id}
              session={child}
              childrenByParent={childrenByParent}
              onOpenSession={onOpenSession}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Render recursively delegated work for the focused Agent. */
export function SubagentsPluginView({
  onOpenSpawnedSession,
  sessionView,
}: AgentPluginViewContext): React.JSX.Element | null {
  const childrenByParent = useMemo(() => {
    const sessionIds = new Set(
      sessionView.spawnedSessions.map((session) => session.id),
    );
    const index = new Map<string | null, PrimeAgentSpawnedSession[]>();
    for (const session of sessionView.spawnedSessions) {
      const parentId =
        session.parentId !== null && sessionIds.has(session.parentId)
          ? session.parentId
          : null;
      const children = index.get(parentId) ?? [];
      children.push(session);
      index.set(parentId, children);
    }
    return index;
  }, [sessionView.spawnedSessions]);
  const roots = childrenByParent.get(null) ?? [];

  if (roots.length === 0) return null;

  return (
    <section aria-label="Subagents" className="w-full max-w-[42rem]">
      <header className="mb-2 flex items-center gap-2 px-2">
        <h2 className="text-sm font-medium text-foreground">Subagents</h2>
        <span
          aria-label={`${sessionView.spawnedSessions.length} subagents`}
          className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
        >
          {sessionView.spawnedSessions.length}
        </span>
      </header>
      <ul className="flex flex-col gap-1 rounded-xl bg-muted/20 p-1">
        {roots.map((session) => (
          <SubagentBranch
            key={session.id}
            session={session}
            childrenByParent={childrenByParent}
            onOpenSession={onOpenSpawnedSession}
          />
        ))}
      </ul>
    </section>
  );
}

/** Create the built-in Subagents plugin for Ernie's Agent surface. */
export function createSubagentsPluginModule(
  getContext: AgentPluginViewContextProvider,
): PluginModule<React.JSX.Element> {
  return {
    manifest: subagentsPluginManifest,
    activate(context: PluginActivationContext<React.JSX.Element>) {
      context.registerView(subagentsPluginViewId, () => (
        <SubagentsPluginView {...getContext()} />
      ));
    },
  };
}
