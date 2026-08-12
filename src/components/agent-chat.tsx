import { ChevronRightIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Conversation } from '@/components/trovecn/ai-workbench/conversation';
import type {
  PrimeAgentSessionView,
  PrimeAgentSpawnedSession,
} from '@/packages/prime-agent-daemon/client';

interface AgentChatProps {
  readonly depth: number | null;
  readonly sessionView: PrimeAgentSessionView;
}

function SpawnedSessionBranch({
  session,
  sessions,
}: {
  readonly session: PrimeAgentSpawnedSession;
  readonly sessions: readonly PrimeAgentSpawnedSession[];
}): React.JSX.Element {
  const children = sessions.filter(
    (candidate) => candidate.parentId === session.id,
  );
  const statusTone =
    session.status === 'error' ? 'text-amber-500' : 'text-muted-foreground';
  return (
    <li>
      <details className="group/spawn">
        <summary className="flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 text-xs hover:bg-muted/50">
          {children.length === 0 ? (
            <span className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3 transition-transform group-open/spawn:rotate-90" />
          )}
          <span className="min-w-0 flex-1 truncate text-foreground">
            {session.name}
          </span>
          {children.length > 0 ? (
            <span className="text-muted-foreground">{children.length} spawned</span>
          ) : null}
          <span className={statusTone}>{session.status}</span>
        </summary>
        {children.length === 0 ? null : (
          <ul className="ml-3 border-l border-border/60 pl-2">
            {children.map((child) => (
              <SpawnedSessionBranch
                key={child.id}
                session={child}
                sessions={sessions}
              />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

/** Focused Prime Agent transcript and its truthful recursive RLM activity. */
export function AgentChat({
  depth,
  sessionView,
}: AgentChatProps): React.JSX.Element {
  const [treeOpen, setTreeOpen] = useState(false);
  const roots = useMemo(
    () =>
      sessionView.spawnedSessions.filter(
        (session) =>
          session.parentId === null ||
          !sessionView.spawnedSessions.some((candidate) => candidate.id === session.parentId),
      ),
    [sessionView.spawnedSessions],
  );
  const working = sessionView.spawnedSessions.filter(
    (session) => session.status === 'working' || session.status === 'queued',
  ).length;
  const errors = sessionView.spawnedSessions.filter(
    (session) => session.status === 'error',
  ).length;
  const summary = [
    depth === null ? null : `depth ${depth}`,
    errors === 0 ? null : `${errors} failed`,
    working === 0 ? null : `${working} working`,
    sessionView.spawnedSessions.length === 0
      ? null
      : `${sessionView.spawnedSessions.length} spawned`,
  ].filter((item): item is string => item !== null);

  return (
    <>
      {summary.length === 0 ? null : (
        <button
          type="button"
          className="flex h-7 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={treeOpen}
          onClick={() => setTreeOpen((current) => !current)}
        >
          {summary.join(' · ')}
        </button>
      )}
      {treeOpen && sessionView.spawnedSessions.length > 0 ? (
        <section
          aria-label="Spawned agents"
          className="max-h-[33vh] overflow-y-auto rounded-lg border bg-muted/20 p-1"
        >
          <ul>
            {roots.map((session) => (
              <SpawnedSessionBranch
                key={session.id}
                session={session}
                sessions={sessionView.spawnedSessions}
              />
            ))}
          </ul>
        </section>
      ) : null}
      <Conversation
        messages={sessionView.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.text,
        }))}
        className="pb-6"
      />
    </>
  );
}
