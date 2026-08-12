import { ChevronRightIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ChatMarkdown } from '@/components/chat-markdown';
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
  childrenByParent,
}: {
  readonly session: PrimeAgentSpawnedSession;
  readonly childrenByParent: ReadonlyMap<
    string | null,
    readonly PrimeAgentSpawnedSession[]
  >;
}): React.JSX.Element {
  const children = childrenByParent.get(session.id) ?? [];
  const statusTone =
    session.status === 'error' ? 'text-destructive' : 'text-muted-foreground';
  const statusLabel =
    session.status === 'queued'
      ? 'waiting'
      : session.status === 'error'
        ? 'failed'
        : session.status;
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
          <span className={statusTone}>{statusLabel}</span>
        </summary>
        {children.length === 0 ? null : (
          <ul className="ml-3 border-l border-border/60 pl-2">
            {children.map((child) => (
              <SpawnedSessionBranch
                key={child.id}
                session={child}
                childrenByParent={childrenByParent}
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
      {sessionView.spawnedSessions.length === 0 || summary.length === 0 ? null : (
        <button
          type="button"
          className="flex h-7 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={treeOpen}
          aria-controls="spawned-agent-tree"
          onClick={() => setTreeOpen((current) => !current)}
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={`size-3 transition-transform ${treeOpen ? 'rotate-90' : ''}`}
          />
          {summary.join(' · ')}
        </button>
      )}
      {treeOpen && sessionView.spawnedSessions.length > 0 ? (
        <section
          id="spawned-agent-tree"
          aria-label="Spawned agents"
          className="max-h-[33vh] overflow-y-auto rounded-lg border bg-muted/20 p-1"
        >
          <ul>
            {roots.map((session) => (
              <SpawnedSessionBranch
                key={session.id}
                session={session}
                childrenByParent={childrenByParent}
              />
            ))}
          </ul>
        </section>
      ) : null}
      <Conversation
        messages={sessionView.messages.map((message) =>
          message.role === 'assistant'
            ? {
                id: message.id,
                role: message.role,
                content: <ChatMarkdown text={message.text} />,
                copyText: message.text,
              }
            : {
                id: message.id,
                role: message.role,
                content: message.text,
              },
        )}
        className="pb-6"
      />
    </>
  );
}
