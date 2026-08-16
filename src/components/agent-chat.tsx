import {
  ArrowDownIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  GitForkIcon,
  MessageSquareTextIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';

import { ChatMarkdown } from '@/components/chat-markdown';
import { Button } from '@/components/trovecn/ui/button';
import type { AgentWorkspaceSpawnedTarget } from '@/packages/agent-workspace';
import type {
  PrimeAgentSessionView,
  PrimeAgentSpawnedSession,
  PrimeAgentTranscriptItem,
} from '@/packages/prime-agent-daemon/client';
import type { ThinkingOrbState } from '@/thinking-orb-preference';

const collapsedMessageMaxHeight = 288;

function CollapsibleUserMessage({
  text,
}: Readonly<{ text: string }>): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content === null) return;
    const measure = (): void => {
      setCollapsible(content.scrollHeight > collapsedMessageMaxHeight + 1);
    };
    measure();
    const observer =
      'ResizeObserver' in window ? new ResizeObserver(measure) : null;
    observer?.observe(content);
    return () => observer?.disconnect();
  }, [text]);

  return (
    <div className="min-w-0 max-w-[min(88%,32rem)] overflow-hidden rounded-2xl bg-muted">
      <div className="relative">
        <div
          ref={contentRef}
          className={`select-text px-3.5 pt-2.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${expanded ? 'pb-2.5' : 'max-h-72 overflow-hidden pb-3'}`}
        >
          {text}
        </div>
        {!collapsible || expanded ? null : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-muted via-muted/85 to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_top,black,black_45%,transparent)]"
          />
        )}
      </div>
      {!collapsible ? null : (
        <div className="relative flex justify-center px-2 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full bg-background/70 px-2.5 text-xs shadow-sm backdrop-blur-sm hover:bg-background"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <ChevronUpIcon aria-hidden="true" />
            ) : (
              <ChevronDownIcon aria-hidden="true" />
            )}
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        </div>
      )}
    </div>
  );
}

interface AgentChatProps {
  readonly loadingEarlierHistory?: boolean;
  readonly onLoadEarlierHistory?: () => void;
  readonly onOpenSpawnedSession?: (
    target: AgentWorkspaceSpawnedTarget,
  ) => void;
  readonly sessionView: PrimeAgentSessionView;
  readonly thinkingOrbState?: ThinkingOrbState;
}

function durationLabel(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  return durationMs < 1_000
    ? `${Math.round(durationMs)}ms`
    : `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

interface ExecutionOutputPart {
  readonly content: string;
  readonly kind: 'result' | 'stderr' | 'stdout' | 'traceback';
  readonly label: string;
}

interface NumberedIpythonCell {
  readonly cell: Extract<PrimeAgentTranscriptItem, { kind: 'ipython' }>;
  readonly number: number;
}

type TranscriptBlock =
  | Readonly<{
      id: string;
      item: Extract<PrimeAgentTranscriptItem, { kind: 'message' }>;
      kind: 'message';
    }>
  | Readonly<{
      cells: readonly NumberedIpythonCell[];
      id: string;
      kind: 'execution';
    }>;

function executionOutputParts(
  item: Extract<PrimeAgentTranscriptItem, { kind: 'ipython' }>,
): readonly ExecutionOutputPart[] {
  const parts: ExecutionOutputPart[] = [];
  if (item.stdout !== null && item.stdout.length > 0) {
    parts.push({ content: item.stdout, kind: 'stdout', label: 'stdout' });
  }
  if (item.result !== null && item.result.length > 0) {
    parts.push({ content: item.result, kind: 'result', label: 'result' });
  }
  if (item.stderr !== null && item.stderr.length > 0) {
    parts.push({ content: item.stderr, kind: 'stderr', label: 'stderr' });
  }
  if (item.traceback.length > 0) {
    parts.push({
      content: item.traceback.join('\n'),
      kind: 'traceback',
      label: 'traceback',
    });
  }
  return parts;
}

function transcriptBlocks(
  transcript: readonly PrimeAgentTranscriptItem[],
): readonly TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let cellNumber = 0;

  for (const item of transcript) {
    if (item.kind === 'message') {
      blocks.push({ id: item.id, item, kind: 'message' });
      continue;
    }

    cellNumber += 1;
    const numberedCell = { cell: item, number: cellNumber };
    const latest = blocks.at(-1);
    if (latest?.kind === 'execution') {
      blocks[blocks.length - 1] = {
        ...latest,
        cells: [...latest.cells, numberedCell],
      };
      continue;
    }
    blocks.push({ cells: [numberedCell], id: item.id, kind: 'execution' });
  }

  return blocks;
}

function IpythonCell({
  cell,
  number,
}: {
  readonly cell: Extract<PrimeAgentTranscriptItem, { kind: 'ipython' }>;
  readonly number: number;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(
    cell.status === 'running' ||
      cell.status === 'starting' ||
      cell.status === 'error' ||
      cell.status === 'aborted',
  );
  const outputParts = executionOutputParts(cell);
  const outputLines = outputParts.reduce(
    (total, part) => total + part.content.split('\n').length,
    0,
  );
  const tone =
    cell.status === 'error'
      ? 'text-destructive'
      : cell.status === 'ok'
        ? 'text-success'
        : 'text-muted-foreground';

  return (
    <section
      aria-label={`IPython cell ${number}`}
      className="group/cell overflow-hidden rounded-lg bg-background/70"
    >
      <header className="flex min-h-8 items-center gap-2 px-2 text-xs">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 aria-expanded:opacity-100 motion-reduce:transition-none"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} IPython cell ${number}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDownIcon
            aria-hidden="true"
            className={`transition-transform motion-reduce:transition-none ${expanded ? '' : '-rotate-90'}`}
          />
        </Button>
        <span className="font-mono font-medium text-foreground/80">In [{number}]</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {expanded
            ? 'ipython'
            : `${cell.code.split('\n')[0]?.trim() || 'IPython'}${outputLines > 0 ? ` · ${outputLines} output ${outputLines === 1 ? 'line' : 'lines'}` : ''}`}
        </span>
        <span className={`font-medium ${tone}`}>
          {cell.status === 'running' || cell.status === 'starting'
            ? 'running'
            : cell.status}
        </span>
        {durationLabel(cell.durationMs) === null ? null : (
          <span>{durationLabel(cell.durationMs)}</span>
        )}
      </header>
      {!expanded ? null : <pre className="mx-2 mb-2 overflow-x-auto rounded-md bg-muted/35 px-3 py-2.5 font-mono text-[12px] leading-5 text-foreground">
        <code>{cell.code}</code>
      </pre>}
      {!expanded || outputParts.length === 0 ? null : (
        <div className="mx-2 mb-2 flex flex-col overflow-hidden rounded-md bg-muted/25">
          {outputParts.map((part) => (
            <div
              key={part.kind}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] border-b border-border/40 last:border-b-0"
            >
              <span className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                {part.label}
              </span>
              <pre
                tabIndex={0}
                className={`max-h-56 overflow-auto border-l border-border/60 px-3 py-3 font-mono text-[12px] leading-5 whitespace-pre-wrap [scrollbar-gutter:stable] ${part.kind === 'stderr' || part.kind === 'traceback' ? 'text-destructive' : 'text-foreground'}`}
              >
                {part.content}
              </pre>
            </div>
          ))}
        </div>
      )}
      {!expanded || cell.attachments.length === 0 ? null : (
        <div className="grid gap-2 px-2 pb-2 sm:grid-cols-2">
          {cell.attachments.map((attachment, index) => (
            <figure
              key={`${attachment.path ?? attachment.mimeType}:${index}`}
              className="overflow-hidden rounded-md border border-border/60 bg-background"
            >
              <img
                src={`data:${attachment.mimeType};base64,${attachment.data}`}
                alt={attachment.path ?? `IPython output ${index + 1}`}
                className="ernie-output-image max-h-64 w-full object-contain"
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

function ExecutionRun({
  cells,
  thinkingOrbState,
}: {
  readonly cells: readonly NumberedIpythonCell[];
  readonly thinkingOrbState: ThinkingOrbState;
}): React.JSX.Element {
  const containsError = cells.some(({ cell }) => cell.status === 'error');
  const containsAborted = cells.some(({ cell }) => cell.status === 'aborted');
  const containsRunning = cells.some(
    ({ cell }) => cell.status === 'running' || cell.status === 'starting',
  );
  const [expanded, setExpanded] = useState(
    containsError || containsAborted || containsRunning,
  );

  useEffect(() => {
    if (containsError || containsAborted || containsRunning) {
      setExpanded(true);
      return;
    }
    setExpanded(false);
  }, [containsAborted, containsError, containsRunning]);

  const countLabel = `${cells.length} ${cells.length === 1 ? 'step' : 'steps'}`;
  const status = containsError
    ? 'needs attention'
    : containsAborted
      ? 'interrupted'
      : containsRunning
        ? 'working'
        : 'complete';
  const statusTone = containsError
    ? 'text-muted-foreground'
    : containsAborted
      ? 'text-muted-foreground'
      : containsRunning
        ? 'text-foreground'
        : 'text-success';

  return (
    <section
      aria-label={`Work: ${countLabel}, ${status}`}
      className="w-full max-w-[42rem] overflow-hidden"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="max-w-full justify-start gap-2 bg-transparent px-2.5 font-normal hover:bg-muted/35 aria-expanded:bg-transparent dark:hover:bg-muted/35"
        aria-label={`${expanded ? 'Collapse' : 'Expand'} work`}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <ChevronRightIcon
            aria-hidden="true"
            className={`transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}
          />
        </span>
        <span className="font-medium text-foreground">Work</span>
        <span className="text-muted-foreground">{countLabel}</span>
        <span className={`flex min-w-0 items-center gap-1 font-medium ${statusTone}`}>
          {status === 'complete' ? (
            <CheckIcon aria-hidden="true" className="size-3.5" />
          ) : containsRunning ? (
            <ThinkingOrb
              aria-hidden="true"
              className="shrink-0"
              data-thinking-orb-state={thinkingOrbState}
              size={20}
              state={thinkingOrbState}
              theme="auto"
            />
          ) : containsError ? (
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full border border-current"
            />
          ) : (
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          )}
          <span className="truncate">{status}</span>
        </span>
      </Button>
      {!expanded ? null : (
        <div className="mt-2 flex flex-col gap-1 rounded-xl bg-muted/20 p-1">
          {cells.map(({ cell, number }) => (
            <IpythonCell key={cell.id} cell={cell} number={number} />
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

function agentCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'agent' : 'agents'}`;
}

function delegationProgressLabel(
  sessions: readonly PrimeAgentSpawnedSession[],
): string {
  const counts = {
    cancelled: 0,
    done: 0,
    error: 0,
    queued: 0,
    working: 0,
  } satisfies Record<PrimeAgentSpawnedSession['status'], number>;
  for (const session of sessions) counts[session.status] += 1;

  const parts: string[] = [];
  if (counts.working > 0) parts.push(`${counts.working} working`);
  if (counts.queued > 0) parts.push(`${counts.queued} waiting`);
  if (counts.done > 0) parts.push(`${counts.done} finished`);
  if (counts.error > 0) parts.push(`${counts.error} failed`);
  if (counts.cancelled > 0) parts.push(`${counts.cancelled} interrupted`);
  return parts.join(' · ');
}

function SpawnedSessionBranch({
  session,
  childrenByParent,
  numberBySessionId,
  onOpenSession,
}: {
  readonly session: PrimeAgentSpawnedSession;
  readonly childrenByParent: ReadonlyMap<
    string | null,
    readonly PrimeAgentSpawnedSession[]
  >;
  readonly numberBySessionId: ReadonlyMap<string, number>;
  readonly onOpenSession:
    | ((target: AgentWorkspaceSpawnedTarget) => void)
    | undefined;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const children = childrenByParent.get(session.id) ?? [];
  const number = numberBySessionId.get(session.id);
  if (number === undefined) {
    throw new Error(`Spawned Agent ${session.id} has no display number.`);
  }
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
        ? 'text-success'
        : 'text-muted-foreground';

  return (
    <li className="relative ps-3 before:absolute before:-start-3 before:top-4 before:w-3 before:border-t before:border-border/70">
      <div className="flex min-h-10 items-start gap-1 rounded-xl bg-muted/20 p-1 shadow-sm transition-colors hover:bg-muted/40 motion-reduce:transition-none">
        {children.length === 0 ? (
          <span className="size-7 shrink-0" aria-hidden="true" />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mt-0.5 shrink-0 text-muted-foreground"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${session.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={`size-3 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}
            />
          </Button>
        )}
        <div className="min-w-0 flex-1 py-0.5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
            <div className="flex min-w-0 items-center">
              {session.activeSessionId === null || onOpenSession === undefined ? (
                <p className="min-w-0 truncate px-2 text-xs font-medium text-foreground">
                  <span className="text-muted-foreground">Agent {number} · </span>
                  <span>{session.name}</span>
                </p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 min-w-0 justify-start px-2 text-start text-xs"
                  aria-label={`Open Agent ${number} input and output: ${session.name}`}
                  onClick={() => {
                    if (session.activeSessionId !== null) {
                      onOpenSession({
                        activeSessionId: session.activeSessionId,
                        name: session.name,
                        number,
                      });
                    }
                  }}
                >
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground">Agent {number} · </span>
                    <span>{session.name}</span>
                  </span>
                  <MessageSquareTextIcon
                    aria-hidden="true"
                    className="size-3 text-muted-foreground"
                  />
                </Button>
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
            <div className="flex items-center gap-2 pt-1 text-xs whitespace-nowrap">
              <span className={`font-medium ${statusTone}`}>{statusLabel}</span>
              {durationLabel(session.durationMs) === null ? null : (
                <span className="text-muted-foreground">
                  {durationLabel(session.durationMs)}
                </span>
              )}
            </div>
          </div>
          {session.recap === null && session.error === null ? null : (
            <p className="mt-0.5 line-clamp-2 px-2 text-xs leading-5 text-muted-foreground">
              <span className="text-foreground/70">Output: </span>
              <span>{session.error ?? session.recap}</span>
            </p>
          )}
        </div>
      </div>
      {!expanded || children.length === 0 ? null : (
        <ul
          data-slot="spawned-agent-children"
          className="ms-3 mt-1 flex flex-col gap-1 border-s border-border/70"
        >
          {children.map((child) => (
            <SpawnedSessionBranch
              key={child.id}
              session={child}
              childrenByParent={childrenByParent}
              numberBySessionId={numberBySessionId}
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
  loadingEarlierHistory = false,
  onLoadEarlierHistory,
  onOpenSpawnedSession,
  sessionView,
  thinkingOrbState = 'working',
}: AgentChatProps): React.JSX.Element {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const activeSessionIdRef = useRef(sessionView.activeSessionId);
  const followsLatestRef = useRef(true);
  const previousHistoryStartRef = useRef(sessionView.historyStart);
  const previousScrollHeightRef = useRef(0);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
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
  const numberBySessionId = useMemo(
    () =>
      new Map(
        sessionView.spawnedSessions.map((session, index) => [
          session.id,
          index + 1,
        ]),
      ),
    [sessionView.spawnedSessions],
  );
  const activeSpawnedAgentCount = sessionView.spawnedSessions.filter(
    (session) => session.status === 'queued' || session.status === 'working',
  ).length;
  const delegatedWorkHasIssues = sessionView.spawnedSessions.some(
    (session) => session.status === 'error' || session.status === 'cancelled',
  );
  const blocks = useMemo(
    () => transcriptBlocks(sessionView.transcript),
    [sessionView.transcript],
  );

  const updateScrollState = (scrollArea: HTMLDivElement): void => {
    const remaining = Math.max(
      0,
      scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight,
    );
    const followsLatest = remaining <= 160;
    followsLatestRef.current = followsLatest;
    setAwayFromLatest(!followsLatest);
  };

  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea === null) return;
    if (activeSessionIdRef.current !== sessionView.activeSessionId) {
      activeSessionIdRef.current = sessionView.activeSessionId;
      followsLatestRef.current = true;
      previousHistoryStartRef.current = sessionView.historyStart;
      previousScrollHeightRef.current = 0;
    }
    if (
      sessionView.historyStart < previousHistoryStartRef.current &&
      previousScrollHeightRef.current > 0
    ) {
      scrollArea.scrollTop +=
        scrollArea.scrollHeight - previousScrollHeightRef.current;
    } else if (followsLatestRef.current) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
    previousHistoryStartRef.current = sessionView.historyStart;
    previousScrollHeightRef.current = scrollArea.scrollHeight;
    updateScrollState(scrollArea);
  }, [
    sessionView.activeSessionId,
    sessionView.historyStart,
    sessionView.transcript,
  ]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea === null) return;
    const update = (): void => updateScrollState(scrollArea);
    update();
    scrollArea.addEventListener('scroll', update, { passive: true });
    const resizeObserver =
      'ResizeObserver' in window ? new ResizeObserver(update) : null;
    resizeObserver?.observe(scrollArea);
    return () => {
      scrollArea.removeEventListener('scroll', update);
      resizeObserver?.disconnect();
    };
  }, [sessionView.activeSessionId]);

  function jumpToLatest(): void {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea === null) return;
    followsLatestRef.current = true;
    setAwayFromLatest(false);
    scrollArea.scrollTo({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      top: scrollArea.scrollHeight,
    });
  }

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollAreaRef}
        data-slot="conversation-scroll-area"
        className="h-full min-h-0 overflow-y-auto"
      >
        <section
          aria-label="Conversation"
          className="mx-auto w-full max-w-[44rem] select-text pb-16"
        >
          {sessionView.historyStart === 0 ||
          onLoadEarlierHistory === undefined ? null : (
            <div className="flex justify-center pb-6">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loadingEarlierHistory}
                onClick={onLoadEarlierHistory}
              >
                {loadingEarlierHistory ? 'Loading earlier…' : 'Load earlier'}
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-6">
            {blocks.map((block, index) => {
              if (block.kind === 'execution') {
                return (
                  <ExecutionRun
                    key={block.id}
                    cells={block.cells}
                    thinkingOrbState={thinkingOrbState}
                  />
                );
              }
              const item = block.item;
              const followsExecution =
                blocks[index - 1]?.kind === 'execution';
              return (
                <article
                  key={item.id}
                  aria-label={
                    item.role === 'user' ? 'Your message' : 'Agent response'
                  }
                  className={
                    item.role === 'user'
                      ? 'flex min-w-0 max-w-full justify-end pt-6'
                      : followsExecution
                        ? 'max-w-[65ch] border-t-2 border-foreground/15 pt-6 text-foreground'
                        : 'max-w-[65ch] text-foreground'
                  }
                >
                  {item.role === 'user' ? (
                    <CollapsibleUserMessage text={item.text} />
                  ) : (
                    <ChatMarkdown text={item.text} />
                  )}
                </article>
              );
            })}
          </div>

          {roots.length === 0 ? null : (
            <section
              aria-label="Delegated work"
              className="mt-10 w-full max-w-[65ch]"
            >
              <header
                className="mb-3 flex min-h-12 items-center gap-3 rounded-2xl bg-card/80 p-2 shadow-sm"
                role="status"
              >
                <span
                  aria-label={`${sessionView.spawnedSessions.length} spawned agents`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground shadow-bevel"
                >
                  <GitForkIcon aria-hidden="true" className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-medium text-foreground">
                    Ernie spawned{' '}
                    {agentCountLabel(sessionView.spawnedSessions.length)}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {delegationProgressLabel(sessionView.spawnedSessions)}
                  </p>
                </div>
                {activeSpawnedAgentCount > 0 ? (
                  <ThinkingOrb
                    aria-hidden="true"
                    className="shrink-0"
                    data-thinking-orb-state={thinkingOrbState}
                    size={20}
                    state={thinkingOrbState}
                    theme="auto"
                  />
                ) : delegatedWorkHasIssues ? (
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full border border-muted-foreground"
                  />
                ) : (
                  <CheckIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-success"
                  />
                )}
              </header>
              <ul className="ms-3 flex flex-col gap-1 border-s border-border/70">
                {roots.map((session) => (
                  <SpawnedSessionBranch
                    key={session.id}
                    session={session}
                    childrenByParent={childrenByParent}
                    numberBySessionId={numberBySessionId}
                    onOpenSession={onOpenSpawnedSession}
                  />
                ))}
              </ul>
            </section>
          )}
        </section>
      </div>

      {!awayFromLatest ? null : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-md"
          onClick={jumpToLatest}
        >
          <ArrowDownIcon aria-hidden="true" />
          Jump to latest
        </Button>
      )}
    </div>
  );
}
