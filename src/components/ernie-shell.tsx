import { SettingsIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AgentSidebar } from '@/components/agent-sidebar';
import {
  agentsViewId,
  PluginActivityBar,
} from '@/components/plugin-activity-bar';
import { PluginManagerDialog } from '@/components/plugin-manager-dialog';
import { SettingsPage } from '@/components/settings-page';
import { TaskSurface } from '@/components/task-surface';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/trovecn/ui/button';
import { usePrimeAgentWorkspace } from '@/hooks/use-prime-agent-workspace';
import {
  browserPluginViewId,
  createBrowserPluginModule,
} from '@/packages/browser-plugin';
import { BrowserPluginView } from '@/packages/browser-plugin/view';
import { createPluginHost } from '@/packages/plugin-host';

type ErnieShellProps = {
  darkModeEnabled: boolean;
  onDarkModeEnabledChange: (enabled: boolean) => void;
  onReload: () => void;
  onReactGrabEnabledChange: (enabled: boolean) => void;
  reactGrabEnabled: boolean;
};

export function ErnieShell({
  darkModeEnabled,
  onDarkModeEnabledChange,
  onReload,
  onReactGrabEnabledChange,
  reactGrabEnabled,
}: ErnieShellProps): React.JSX.Element {
  const workspace = usePrimeAgentWorkspace();
  const pluginHost = useMemo(() => {
    const created = createPluginHost([createBrowserPluginModule(window.ernie)]);
    if (!created.ok) throw created.error;
    return created.value;
  }, []);
  const pluginManifests = useMemo(() => pluginHost.listPlugins(), [pluginHost]);
  const pluginViews = useMemo(() => pluginHost.listViews(), [pluginHost]);
  const [activeViewId, setActiveViewId] = useState(agentsViewId);
  const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const agentsActive = activeViewId === agentsViewId;
  const activePluginView = pluginViews.find((view) => view.id === activeViewId) ?? null;
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

  useEffect(() => {
    const disposePlugins = (): void => {
      void pluginHost.dispose();
    };
    window.addEventListener('pagehide', disposePlugins, { once: true });
    return () => window.removeEventListener('pagehide', disposePlugins);
  }, [pluginHost]);

  const selectView = (viewId: string): void => {
    setSettingsOpen(false);
    if (viewId === agentsViewId) {
      setPluginError(null);
      setActiveViewId(agentsViewId);
      return;
    }
    void pluginHost.activateView(viewId).then((result) => {
      if (result.ok) {
        setPluginError(null);
        setActiveViewId(viewId);
      } else {
        setPluginError(result.error.message);
      }
    });
  };

  return (
    <TooltipProvider>
      <div className="flex h-svh min-w-0 select-none">
        <PluginActivityBar
          activeViewId={activeViewId}
          pluginViews={pluginViews}
          onSelectView={selectView}
        />
        <SidebarProvider defaultOpen className="min-w-0 flex-1">
          {agentsActive ? (
            <AgentSidebar
              {...workspace}
              changeFolder={(cwd) => {
                setSettingsOpen(false);
                workspace.changeFolder(cwd);
              }}
              importSession={(sessionPath) => {
                setSettingsOpen(false);
                workspace.importSession(sessionPath);
              }}
              onOpenSettings={() => setSettingsOpen(true)}
              selectSession={(activeSessionId) => {
                setSettingsOpen(false);
                workspace.selectSession(activeSessionId);
              }}
              settingsOpen={settingsOpen}
              startAgentDraft={(cwd) => {
                setSettingsOpen(false);
                workspace.startAgentDraft(cwd);
              }}
            />
          ) : null}

          <SidebarInset className="h-svh min-w-0 overflow-hidden">
            <header className="z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border/50 bg-background/90 px-3 backdrop-blur-md sm:px-4">
              {agentsActive ? (
                <SidebarTrigger
                  className="size-9"
                  aria-label="Toggle repository sidebar"
                />
              ) : null}
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="max-w-[min(42vw,32rem)] truncate text-sm font-medium text-foreground">
                  {settingsOpen
                    ? 'Settings'
                    : agentsActive
                      ? (selectedSessionView?.sessionName ??
                        selectedSession?.name ??
                        'New Agent')
                      : (activePluginView?.title ?? 'Plugin')}
                </h1>
                {settingsOpen ? null : (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {agentsActive
                      ? `${workspace.repoName}${workspace.gitBranch === null ? '' : ` · ${workspace.gitBranch}`}`
                      : 'Built-in plugin'}
                  </span>
                )}
                {settingsOpen || !agentsActive || sessionStatus === null ? null : (
                  <span
                    className={`text-xs font-medium ${sessionStatus === 'done' ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}
                  >
                    {sessionStatus}
                  </span>
                )}
              </div>
              <div className="ms-auto flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Application settings"
                  aria-pressed={settingsOpen}
                  title="Application settings"
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  <SettingsIcon aria-hidden="true" />
                </Button>
              </div>
            </header>

            {settingsOpen ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <SettingsPage
                  backLabel={
                    agentsActive
                      ? 'Back to Agent'
                      : `Back to ${activePluginView?.title ?? 'plugin'}`
                  }
                  darkModeEnabled={darkModeEnabled}
                  onClose={() => setSettingsOpen(false)}
                  onDarkModeEnabledChange={onDarkModeEnabledChange}
                  onOpenPlugins={() => setPluginManagerOpen(true)}
                  onReactGrabEnabledChange={onReactGrabEnabledChange}
                  onReload={onReload}
                  reactGrabEnabled={reactGrabEnabled}
                />
              </div>
            ) : (
              <section
                className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${
                  agentsActive ? 'px-6 pt-4 pb-6 sm:px-10' : ''
                }`}
              >
                {agentsActive ? (
                  <TaskSurface workspace={workspace} onRetryConnection={onReload} />
                ) : activeViewId === browserPluginViewId && !pluginManagerOpen ? (
                  <BrowserPluginView
                    renderer={window.ernie}
                    executeCommand={(commandId) =>
                      pluginHost.executeCommand(commandId)
                    }
                  />
                ) : null}
                {pluginError === null ? null : (
                  <div
                    role="alert"
                    className="m-4 rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive"
                  >
                    {pluginError}
                  </div>
                )}
              </section>
            )}
          </SidebarInset>
        </SidebarProvider>
      </div>
      <PluginManagerDialog
        manifests={pluginManifests}
        open={pluginManagerOpen}
        onOpenChange={setPluginManagerOpen}
      />
    </TooltipProvider>
  );
}
