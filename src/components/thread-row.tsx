import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  EllipsisIcon,
  GripVerticalIcon,
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
  readonly onPinChange: (pinned: boolean) => void;
  readonly onRename: () => void;
}

/** Interactive Trove thread row with menu, context menu, and drag affordance. */
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
  onPinChange,
  onRename,
}: ThreadRowProps): React.JSX.Element {
  const reorderable = !archived;

  const activityMark = {
    working: null,
    queued: (
      <span
        aria-label="Queued"
        className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
      />
    ),
    needs_input: (
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
        needs input
      </span>
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
        <GripVerticalIcon
          aria-hidden="true"
          className="absolute left-1 size-3.5 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover/thread:opacity-60 group-focus-within/thread:opacity-60"
        />
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          data-active={selected}
          data-sidebar-tree-row
          aria-current={selected ? 'page' : undefined}
          aria-label={
            thread.kind === 'saved'
              ? `${label}, saved session`
              : label
          }
          title={label}
          className={`h-8 min-w-0 flex-1 justify-start rounded-lg border-l-2 pl-[18px] pr-16 text-left text-sidebar-foreground hover:bg-sidebar-accent ${selected ? 'border-sidebar-foreground/35 bg-sidebar-accent' : 'border-transparent'} ${activity === 'working' ? 'font-medium' : 'font-normal'}`}
          onClick={onOpen}
        >
          <span className="min-w-0 flex-1 truncate">
            <span>{label}</span>
            {pinned && detail !== null ? (
              <span className="text-xs text-muted-foreground"> · {detail}</span>
            ) : null}
          </span>
        </Button>
        {importing ? (
          <span
            aria-label="Opening saved session"
            className="absolute right-8 size-1.5 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none"
          />
        ) : (
          <>
            <span className="absolute right-8 group-hover/thread:hidden group-focus-within/thread:hidden">
              {activityMark}
            </span>
            {pinned || detail === null ? null : (
              <span className="pointer-events-none absolute right-8 text-xs tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover/thread:opacity-100 group-focus-within/thread:opacity-100">
                {detail}
              </span>
            )}
          </>
        )}
        <Menu>
          <MenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Manage ${label}`}
                title={`Manage ${label}`}
                className="mr-1 text-muted-foreground opacity-0 group-hover/thread:opacity-100 group-focus-within/thread:opacity-100 aria-expanded:opacity-100"
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
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onArchiveChange(!archived)}>
          {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
          {archived ? 'Restore' : 'Archive'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
