import {
  MoreHorizontalIcon,
  MoonIcon,
  RefreshCwIcon,
  SunIcon,
} from 'lucide-react';

import { AgentSidebar } from '@/components/agent-sidebar';
import { TaskSurface } from '@/components/task-surface';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/trovecn/ui/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '@/components/trovecn/ui/menu';
import { Switch } from '@/components/trovecn/ui/switch';
import { usePrimeAgentWorkspace } from '@/hooks/use-prime-agent-workspace';

type ErnieShellProps = {
  agentationEnabled: boolean;
  darkModeEnabled: boolean;
  onAgentationEnabledChange: (enabled: boolean) => void;
  onDarkModeEnabledChange: (enabled: boolean) => void;
  onReload: () => void;
};

export function ErnieShell({
  agentationEnabled,
  darkModeEnabled,
  onAgentationEnabledChange,
  onDarkModeEnabledChange,
  onReload,
}: ErnieShellProps): React.JSX.Element {
  const workspace = usePrimeAgentWorkspace();
  const themeAction = darkModeEnabled ? 'Use light mode' : 'Use dark mode';
  const selectedSession = workspace.sessions.find(
    (session) => session.activeSessionId === workspace.selectedSessionId,
  );
  const selectedSessionView =
    workspace.selectedSessionView?.activeSessionId === workspace.selectedSessionId
      ? workspace.selectedSessionView
      : null;
  const workingAgentCount =
    selectedSessionView?.spawnedSessions.filter(
      (session) => session.status === 'working' || session.status === 'queued',
    ).length ?? 0;
  const sessionStatus =
    workingAgentCount > 0
      ? `${workingAgentCount} working`
      : selectedSessionView?.isStreaming
        ? 'working'
        : selectedSessionView === null
          ? null
          : 'done';

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen className="select-none">
        <AgentSidebar {...workspace} />

        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          <header className="z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border/50 bg-background/90 px-3 backdrop-blur-md sm:px-4">
            <SidebarTrigger
              className="size-9"
              aria-label="Toggle repository sidebar"
            />
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="max-w-[min(42vw,32rem)] truncate text-sm font-medium text-foreground">
                {selectedSessionView?.sessionName ?? selectedSession?.name ?? 'New Agent'}
              </h1>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {workspace.repoName}
                {workspace.gitBranch === null ? '' : ` · ${workspace.gitBranch}`}
              </span>
              {sessionStatus === null ? null : (
                <span
                  className={`text-xs font-medium ${sessionStatus === 'done' ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}
                >
                  {sessionStatus}
                </span>
              )}
            </div>
            <div className="ms-auto flex items-center gap-1">
              <Field orientation="horizontal" className="w-auto gap-2 px-1">
                <FieldLabel htmlFor="agentation">annotate</FieldLabel>
                <Switch
                  id="agentation"
                  checked={agentationEnabled}
                  onCheckedChange={onAgentationEnabledChange}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={themeAction}
                title={themeAction}
                onClick={() => onDarkModeEnabledChange(!darkModeEnabled)}
              >
                {darkModeEnabled ? (
                  <SunIcon aria-hidden="true" />
                ) : (
                  <MoonIcon aria-hidden="true" />
                )}
              </Button>
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label="More application actions"
                    />
                  }
                >
                  <MoreHorizontalIcon aria-hidden="true" />
                </MenuTrigger>
                <MenuContent align="end" sideOffset={6}>
                  <MenuItem onClick={onReload}>
                    <RefreshCwIcon aria-hidden="true" />
                    Reload renderer
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </header>

          <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-4 pb-6 sm:px-10">
            <TaskSurface workspace={workspace} onRetryConnection={onReload} />
          </section>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
