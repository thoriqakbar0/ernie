import { ImportIcon, LoaderCircleIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { PrimeAgentSavedSession } from '@/packages/prime-agent-daemon/client';

interface ImportSessionSheetProps {
  readonly importingSessionPath: string | null;
  readonly loading: boolean;
  readonly open: boolean;
  readonly sessions: readonly PrimeAgentSavedSession[];
  readonly importSession: (sessionPath: string) => void;
  readonly onOpenChange: (open: boolean) => void;
}

function folderName(cwd: string): string {
  const parts = cwd.split(/[\\/]/u).filter((part) => part.length > 0);
  return parts.at(-1) ?? cwd;
}

/** Select and reopen one durable Prime Agent conversation. */
export function ImportSessionSheet({
  importingSessionPath,
  loading,
  open,
  sessions,
  importSession,
  onOpenChange,
}: ImportSessionSheetProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const visibleSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery.length === 0) return sessions;
    return sessions.filter((session) =>
      `${session.name} ${session.cwd}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, sessions]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[22rem] gap-0 p-0 sm:max-w-[22rem]">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>Import session</SheetTitle>
          <SheetDescription>
            Reopen a saved Prime Agent conversation in Ernie.
          </SheetDescription>
        </SheetHeader>

        <div className="relative m-3">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search saved sessions"
            value={query}
            placeholder="Search sessions"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 overscroll-contain [scrollbar-gutter:stable]">
          {loading ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Loading sessions…
            </div>
          ) : visibleSessions.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {sessions.length === 0
                ? 'No saved sessions found.'
                : 'No matching sessions.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {visibleSessions.map((session) => {
                const importing = importingSessionPath === session.path;
                return (
                  <li key={session.path}>
                    <button
                      type="button"
                      disabled={importingSessionPath !== null}
                      className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none"
                      onClick={() => {
                        importSession(session.path);
                        onOpenChange(false);
                      }}
                    >
                      {importing ? (
                        <LoaderCircleIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <ImportIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {session.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {folderName(session.cwd)} · {session.messageCount}{' '}
                          {session.messageCount === 1 ? 'message' : 'messages'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
