import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { ChatMarkdown } from '@/components/chat-markdown';
import { Button } from '@/components/trovecn/ui/button';
import type {
  PrimeAgentSessionView,
  PrimeAgentSpawnedSession,
  PrimeAgentTranscriptItem,
} from '@/packages/prime-agent-daemon/client';

interface AgentChatProps {
  readonly depth: number | null;
  readonly onOpenSpawnedSession?: (activeSessionId: string) => void;
  readonly sessionView: PrimeAgentSessionView;
}

function durationLabel(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  return durationMs < 1_000
    ? `${Math.round(durationMs)}ms`
    : `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function executionOutput(item: Extract<PrimeAgentTranscriptItem, { kind: 'ipython' }>): string {
  return [item.stdout, item.stderr, item.result, ...item.traceback]
    .filter((part): part is string => part !== null && part.length > 0)
    .join('\n');
}

function IpythonCell({
  cell,
  number,
}: {
  readonly cell: Extract<PrimeAgentTranscriptItem, { kind: 'ipython' }>;
  readonly number: number;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const output = executionOutput(cell);
  const tone =
    cell.status === 'error'
      ? 'text-destructive'
      : cell.status === 'ok'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';

  async function copyCode(): Promise<void> {
    if (navigator.clipboard === undefined) return;
    try {
      await navigator.clipboard.writeText(cell.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      // Restricted clipboard contexts leave the source selectable.
    }
  }

  return (
    <section
      aria-label={`IPython cell ${number}`}
      className="overflow-hidden rounded-lg border border-border/70 bg-muted/15"
    >
      <header className="flex h-8 items-center gap-2 border-b border-border/60 px-3 text-[11px] text-muted-foreground">
        <span className="font-mono text-foreground/75">In [{number}]</span>
        <span>ipython</span>
        <span className={`ml-auto ${tone}`}>
          {cell.status === 'running' || cell.status === 'starting'
            ? 'running'
            : cell.status}
        </span>
        {durationLabel(cell.durationMs) === null ? null : (
          <span>{durationLabel(cell.durationMs)}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label="Copy IPython code"
          onClick={() => void copyCode()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </header>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-[12px] leading-5 text-foreground">
        <code>{cell.code}</code>
      </pre>
      {output.length === 0 ? null : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] border-t border-border/60">
          <span className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
            Out [{number}]
          </span>
          <pre
            tabIndex={0}
            className="max-h-56 overflow-auto border-l border-border/60 px-3 py-3 font-mono text-[12px] leading-5 whitespace-pre-wrap text-foreground [scrollbar-gutter:stable]"
          >
            {output}
          </pre>
        </div>
      )}
      {cell.attachments.length === 0 ? null : (
        <div className="grid gap-2 border-t border-border/60 p-3 sm:grid-cols-2">
          {cell.attachments.map((attachment, index) => (
            <figure
              key={`${attachment.path ?? attachment.mimeType}:${index}`}
              className="overflow-hidden rounded-md border border-border/60 bg-background"
            >
              <img
                src={`data:${attachment.mimeType};base64,${attachment.data}`}
                alt={attachment.path ?? `IPython output ${index + 1}`}
                className="max-h-64 w-full object-contain"
              />
              <figcaption className="flex h-8 items-center gap-2 border-t border-border/60 px-2 text-[11px] text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">
                  {attachment.path ?? attachment.mimeType}
                </span>
                {attachment.path === null ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Reveal ${attachment.path}`}
                    onClick={() => {
                      void window.ernie.revealWorkspacePath(attachment.path ?? '');
                    }}
                  >
                    <ExternalLinkIcon />
                  </Button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
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

function SpawnedSessionBranch({
  session,
  childrenByParent,
  onOpenSession,
}: {
  readonly session: PrimeAgentSpawnedSession;
  readonly childrenByParent: ReadonlyMap<
    string | null,
    readonly PrimeAgentSpawnedSession[]
  >;
  readonly onOpenSession: ((activeSessionId: string) => void) | undefined;
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
      <div className="flex min-h-8 items-start gap-1 rounded-md px-1 py-1 hover:bg-muted/40">
        <button
          type="button"
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${session.name}`}
          aria-expanded={expanded}
          disabled={children.length === 0}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={`size-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              className="min-w-0 truncate font-medium text-foreground hover:underline disabled:no-underline"
              disabled={
                session.activeSessionId === null || onOpenSession === undefined
              }
              onClick={() => {
                if (session.activeSessionId !== null) {
                  onOpenSession?.(session.activeSessionId);
                }
              }}
            >
              {session.name}
            </button>
            {session.activeSessionId === null || onOpenSession === undefined ? null : (
              <ExternalLinkIcon aria-hidden="true" className="size-3 text-muted-foreground" />
            )}
            {descendants === 0 ? null : (
              <span className="text-muted-foreground">{descendants}</span>
            )}
            <span className={`ml-auto ${statusTone}`}>{statusLabel}</span>
            {durationLabel(session.durationMs) === null ? null : (
              <span className="text-muted-foreground">
                {durationLabel(session.durationMs)}
              </span>
            )}
          </div>
          {session.recap === null && session.error === null ? null : (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {session.error ?? session.recap}
            </p>
          )}
        </div>
      </div>
      {!expanded || children.length === 0 ? null : (
        <ul className="ml-4 border-l border-border/60 pl-2">
          {children.map((child) => (
            <SpawnedSessionBranch
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

/** Focused Prime Agent transcript with IPython cells and recursive agent work. */
export function AgentChat({
  onOpenSpawnedSession,
  sessionView,
}: AgentChatProps): React.JSX.Element {
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
  let cellNumber = 0;

  return (
    <section aria-label="Conversation" className="w-full select-text pb-6">
      <div className="space-y-6">
        {sessionView.transcript.map((item) => {
          if (item.kind === 'ipython') {
            cellNumber += 1;
            return <IpythonCell key={item.id} cell={item} number={cellNumber} />;
          }
          return (
            <article
              key={item.id}
              aria-label={
                item.role === 'user' ? 'Your message' : 'Agent response'
              }
              className={
                item.role === 'user'
                  ? 'flex justify-end border-t border-border/50 pt-6'
                  : 'max-w-[42rem] text-lede leading-7 text-foreground'
              }
            >
              {item.role === 'user' ? (
                <div className="max-w-[min(88%,32rem)] rounded-2xl bg-muted px-3.5 py-2.5">
                  {item.text}
                </div>
              ) : (
                <ChatMarkdown text={item.text} />
              )}
            </article>
          );
        })}
      </div>

      {roots.length === 0 ? null : (
        <section
          aria-label="Spawned agents"
          className="mt-7 border-t border-border/60 pt-3"
        >
          <header className="mb-1 flex items-center gap-2 px-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            agents
            <span>{sessionView.spawnedSessions.length}</span>
          </header>
          <ul>
            {roots.map((session) => (
              <SpawnedSessionBranch
                key={session.id}
                session={session}
                childrenByParent={childrenByParent}
                onOpenSession={onOpenSpawnedSession}
              />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
