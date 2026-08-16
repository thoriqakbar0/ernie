import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisIcon,
  MessageCircleQuestionIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react';
import type { DragEvent } from 'react';
import { ThinkingOrb } from 'thinking-orbs';

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
import type {
  AgentConversation,
  AgentConversationActivity,
} from '@/packages/repository-navigation';
import type { ThinkingOrbState } from '@/thinking-orb-preference';

interface AgentConversationRowProps {
  readonly archived: boolean;
  readonly activity: AgentConversationActivity;
  readonly detail: string | null;
  readonly disabled: boolean;
  readonly dragging: boolean;
  readonly importing: boolean;
  readonly label: string;
  readonly pinned: boolean;
  readonly selected: boolean;
  readonly thinkingOrbState: ThinkingOrbState;
  readonly conversation: AgentConversation;
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

/** Interactive Agent conversation with direct opening, drag, and actions. */
export function AgentConversationRow({
  archived,
  activity,
  detail,
  disabled,
  dragging,
  importing,
  label,
  pinned,
  selected,
  thinkingOrbState,
  conversation,
  onArchiveChange,
  onDragEnd,
  onDragStart,
  onDrop,
  onOpen,
  onMoveDown,
  onMoveUp,
  onPinChange,
  onRename,
}: AgentConversationRowProps): React.JSX.Element {
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
      <ThinkingOrb
        aria-label="Working"
        className="shrink-0"
        data-thinking-orb-state={thinkingOrbState}
        size={20}
        state={thinkingOrbState}
        theme="auto"
        title="Working"
      />
    ),
    queued: (
      <span
        aria-label="Queued"
        title="Queued"
        className="size-2 shrink-0 rounded-full border border-warning/70"
      />
    ),
    needs_input: (
      <span
        aria-label="Needs input"
        title="Needs input"
        className="flex size-3.5 shrink-0 items-center justify-center text-warning"
      >
        <MessageCircleQuestionIcon aria-hidden="true" className="size-3.5" />
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
            className="group/conversation relative flex min-w-0 items-center rounded-lg opacity-100 transition-opacity data-[dragging=true]:opacity-40"
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
          aria-label={conversation.kind === 'saved' ? `${label}, saved session` : label}
          title={pinned && detail !== null ? `${label} · ${detail}` : label}
          className={`h-8 min-w-0 flex-1 justify-start rounded-md px-2 pe-14 text-start text-sidebar-foreground hover:bg-sidebar-accent/70 ${selected ? 'bg-sidebar-accent' : 'bg-transparent'} ${activity === 'working' ? 'font-medium' : 'font-normal'}`}
          onClick={onOpen}
        >
          <span className="min-w-0 flex-1 truncate">
            <span>{label}</span>
          </span>
        </Button>
        {importing ? null : (
          <span className="pointer-events-none absolute end-8 flex w-5 items-center justify-center text-[10px] tabular-nums text-muted-foreground">
            {activityMark ?? detail}
          </span>
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
                className={`absolute end-1 text-muted-foreground group-hover/conversation:opacity-100 group-focus-within/conversation:opacity-100 aria-expanded:opacity-100 ${selected ? 'opacity-100' : 'opacity-0'}`}
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
