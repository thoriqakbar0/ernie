import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react';
import type { DragEvent } from 'react';

import type { ThreadConversation } from '@/components/thread-conversation';
import { Button } from '@/components/trovecn/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/trovecn/ui/context-menu';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/trovecn/ui/menu';
import type { PrimeAgentSessionActivity } from '@/packages/prime-agent-daemon/client';

interface ThreadRowProps {
  readonly archived: boolean;
  readonly activity: PrimeAgentSessionActivity;
  readonly detail: string | null;
  readonly disabled: boolean;
  readonly dragging: boolean;
  readonly importing: boolean;
  readonly label: string;
  readonly pinned: boolean;
  readonly selected: boolean;
  readonly thread: ThreadConversation;
  readonly onArchiveChange: (archived: boolean) => void;
  readonly onDragEnd: () => void;
  readonly onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLLIElement>) => void;
  readonly onOpen: () => void;
  readonly onMoveDown?: (() => void) | undefined;
  readonly onMoveUp?: (() => void) | undefined;
  readonly onPinChange: (pinned: boolean) => void;
  readonly onRename: () => void;
}

/** Interactive Trove thread row with direct opening, whole-row drag, and actions. */
export function ThreadRow({
  archived,
  activity,
  detail,
  disabled,
  dragging,
  importing,
  label,
  pinned,
  selected,
  thread,
  onArchiveChange,
  onDragEnd,
  onDragStart,
  onDrop,
  onOpen,
  onMoveDown,
  onMoveUp,
  onPinChange,
  onRename,
}: ThreadRowProps): React.JSX.Element {
  const reorderable = !archived;

  const activityLabel = {
    working: 'working',
    queued: 'queued',
    needs_input: 'needs input',
    idle: null,
    settled: null,
  }[activity];

  const activityMark = {
    working: (
      <span
        aria-label="Working"
        title="Working"
        className="size-2 shrink-0 animate-pulse rounded-full bg-sky-500 motion-reduce:animate-none"
      />
    ),
    queued: (
      <span
        aria-label="Queued"
        title="Queued"
        className="size-2 shrink-0 rounded-full border border-muted-foreground/70"
      />
    ),
    needs_input: (
      <span
        aria-label="Needs input"
        title="Needs input"
        className="size-2 shrink-0 rounded-full bg-amber-500 ring-2 ring-amber-500/15"
      />
    ),
    idle: null,
    settled: null,
  }[activity];

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <li
            draggable={reorderable}
            data-dragging={dragging}
            className="group/thread relative flex min-w-0 items-center rounded-lg opacity-100 transition-opacity data-[dragging=true]:opacity-40"
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={(event) => {
              if (!reorderable) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={onDrop}
          />
        }
      >
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          data-active={selected}
          data-sidebar-tree-row
          aria-current={selected ? 'page' : undefined}
          aria-description={activityLabel ?? undefined}
          aria-label={thread.kind === 'saved' ? `${label}, saved session` : label}
          title={pinned && detail !== null ? `${label} · ${detail}` : label}
          className={`h-8 min-w-0 flex-1 justify-start rounded-md px-2 pe-14 text-start text-sidebar-foreground hover:bg-sidebar-accent/70 ${selected ? 'bg-sidebar-accent' : 'bg-transparent'} ${activity === 'working' ? 'font-medium' : 'font-normal'}`}
          onClick={onOpen}
        >
          <span className="min-w-0 flex-1 truncate">
            <span>{label}</span>
          </span>
        </Button>
        {importing ? (
          <span
            aria-label="Opening saved session"
            className="absolute end-8 size-1.5 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none"
          />
        ) : (
          <>
            <span className="pointer-events-none absolute end-8 flex w-5 items-center justify-center text-[10px] tabular-nums text-muted-foreground">
              {activityMark ?? detail}
            </span>
          </>
        )}
        <Menu>
          <MenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`More actions for ${label}`}
                title="More actions"
                className={`absolute end-1 text-muted-foreground group-hover/thread:opacity-100 group-focus-within/thread:opacity-100 aria-expanded:opacity-100 ${selected ? 'opacity-100' : 'opacity-0'}`}
              />
            }
          >
            <EllipsisIcon />
          </MenuTrigger>
          <MenuContent align="end" side="right" sideOffset={6}>
            <MenuItem onClick={onRename}>
              <PencilIcon />
              Rename
            </MenuItem>
            {archived ? null : (
              <MenuItem onClick={() => onPinChange(!pinned)}>
                {pinned ? <PinOffIcon /> : <PinIcon />}
                {pinned ? 'Unpin' : 'Pin to top'}
              </MenuItem>
            )}
            {archived || (onMoveUp === undefined && onMoveDown === undefined) ? null : (
              <>
                <MenuSeparator />
                {onMoveUp === undefined ? null : (
                  <MenuItem onClick={onMoveUp}>
                    <ArrowUpIcon />
                    Move up
                  </MenuItem>
                )}
                {onMoveDown === undefined ? null : (
                  <MenuItem onClick={onMoveDown}>
                    <ArrowDownIcon />
                    Move down
                  </MenuItem>
                )}
              </>
            )}
            <MenuSeparator />
            <MenuItem onClick={() => onArchiveChange(!archived)}>
              {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {archived ? 'Restore' : 'Archive'}
            </MenuItem>
          </MenuContent>
        </Menu>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <PencilIcon />
          Rename
        </ContextMenuItem>
        {archived ? null : (
          <ContextMenuItem onClick={() => onPinChange(!pinned)}>
            {pinned ? <PinOffIcon /> : <PinIcon />}
            {pinned ? 'Unpin' : 'Pin to top'}
          </ContextMenuItem>
        )}
        {archived || (onMoveUp === undefined && onMoveDown === undefined) ? null : (
          <>
            <ContextMenuSeparator />
            {onMoveUp === undefined ? null : (
              <ContextMenuItem onClick={onMoveUp}>
                <ArrowUpIcon />
                Move up
              </ContextMenuItem>
            )}
            {onMoveDown === undefined ? null : (
              <ContextMenuItem onClick={onMoveDown}>
                <ArrowDownIcon />
                Move down
              </ContextMenuItem>
            )}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onArchiveChange(!archived)}>
          {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
          {archived ? 'Restore' : 'Archive'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
