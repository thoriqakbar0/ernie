import { useEffect, useMemo, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';

import { AgentSidebar } from '@/components/agent-sidebar';
import {
  agentsViewId,
  PluginActivityBar,
} from '@/components/plugin-activity-bar';
import { PluginManagerDialog } from '@/components/plugin-manager-dialog';
import { PluginViewBoundary } from '@/components/plugin-view-boundary';
import { SettingsPage } from '@/components/settings-page';
import { TaskSurface } from '@/components/task-surface';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePrimeAgentWorkspace } from '@/hooks/use-prime-agent-workspace';
import { createAgentationPluginModule } from '@/packages/agentation-plugin';
import { createBrowserPluginModule } from '@/packages/browser-plugin/view';
import { isJsonString, parseJsonValue } from '@/packages/json-value';
import { createPluginHost } from '@/packages/plugin-host';
import { createReactGrabPluginModule } from '@/packages/react-grab-plugin';
import type { ErnieUiSidebarRequest } from '@/packages/ernie-ui-control/sidebar-control';
import type { ThinkingOrbState } from '@/thinking-orb-preference';

const disabledPluginsStorageKey = 'ernie:disabled-plugins:v1';

function readDisabledPluginIds(): ReadonlySet<string> {
  const stored = window.localStorage.getItem(disabledPluginsStorageKey);
  if (stored === null) return new Set<string>();

  try {
    const value = parseJsonValue(JSON.parse(stored));
    return Array.isArray(value)
      ? new Set(value.filter(isJsonString))
      : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function storeDisabledPluginIds(pluginIds: readonly string[]): boolean {
  try {
    window.localStorage.setItem(
      disabledPluginsStorageKey,
      JSON.stringify(pluginIds),
    );
    return true;
  } catch {
    return false;
  }
}

type ErnieShellProps = {
  darkModeEnabled: boolean;
  onDarkModeEnabledChange: (enabled: boolean) => void;
  onReload: () => void;
  onThinkingOrbStateChange: (state: ThinkingOrbState) => void;
  sidebarControlRequest: ErnieUiSidebarRequest | null;
  thinkingOrbState: ThinkingOrbState;
};

function SidebarControlBridge({
  request,
}: {
  readonly request: ErnieUiSidebarRequest | null;
}): null {
  const { setOpen, setSidebarWidth } = useSidebar();

  useEffect(() => {
    if (request === null) return;
    switch (request.type) {
      case 'set-sidebar-open':
        setOpen(request.open);
        break;
      case 'set-sidebar-width':
        setSidebarWidth(request.width);
        break;
    }
  }, [request, setOpen, setSidebarWidth]);

  return null;
}

export function ErnieShell({
  darkModeEnabled,
  onDarkModeEnabledChange,
  onReload,
  onThinkingOrbStateChange,
  sidebarControlRequest,
  thinkingOrbState,
}: ErnieShellProps): React.JSX.Element {
  const workspace = usePrimeAgentWorkspace();
  const pluginHost = useMemo(() => {
    const created = createPluginHost(
      [
        createBrowserPluginModule(window.ernie),
        createReactGrabPluginModule(),
        createAgentationPluginModule(),
      ],
      readDisabledPluginIds(),
    );
    if (!created.ok) throw created.error;
    return created.value;
  }, []);
  const pluginManifests = useMemo(() => pluginHost.listPlugins(), [pluginHost]);
  const pluginViews = pluginHost.listViews();
  const selectionSequence = useRef(0);
  const [activeViewId, setActiveViewId] = useState(agentsViewId);
  const [activePluginContent, setActivePluginContent] =
    useState<React.JSX.Element | null>(null);
  const [, refreshPluginCatalog] = useState(0);
  const [busyPluginIds, setBusyPluginIds] = useState<ReadonlySet<string>>(
    new Set<string>(),
  );
  const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const agentsActive = activeViewId === agentsViewId;
  const activePluginView = pluginViews.find((view) => view.id === activeViewId) ?? null;
  const activePluginManifest = pluginManifests.find((manifest) =>
    manifest.contributes.views.some((view) => view.id === activeViewId),
  );
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
      ? `${workingAgentCount} ${workingAgentCount === 1 ? 'agent' : 'agents'} working`
      : selectedSessionView?.isStreaming
        ? 'working'
        : selectedSessionView === null
          ? null
          : 'done';

  useEffect(() => {
    let acceptStartupResult = true;
    void pluginHost.activateStartupPlugins().then((errors) => {
      if (acceptStartupResult && errors.length > 0) {
        setPluginError(errors.map((error) => error.message).join(' '));
      }
    });
    const disposePlugins = (): void => {
      void pluginHost.dispose();
    };
    window.addEventListener('pagehide', disposePlugins, { once: true });
    return () => {
      acceptStartupResult = false;
      window.removeEventListener('pagehide', disposePlugins);
    };
  }, [pluginHost]);

  const selectView = (viewId: string): void => {
    setSettingsOpen(false);
    const sequence = ++selectionSequence.current;
    if (viewId === agentsViewId) {
      setPluginError(null);
      setActiveViewId(agentsViewId);
      setActivePluginContent(null);
      return;
    }
    void pluginHost.renderView(viewId).then((result) => {
      if (sequence !== selectionSequence.current) return;
      if (result.ok) {
        setPluginError(null);
        setActiveViewId(viewId);
        setActivePluginContent(result.value);
      } else {
        setPluginError(result.error.message);
      }
    });
  };

  const changePluginEnabled = (pluginId: string, enabled: boolean): void => {
    const finishChange = (): void => {
      setBusyPluginIds((current) => {
        const next = new Set(current);
        next.delete(pluginId);
        return next;
      });
    };
    setBusyPluginIds((current) => new Set([...current, pluginId]));
    if (!enabled && activePluginManifest?.id === pluginId) {
      selectionSequence.current += 1;
      setActiveViewId(agentsViewId);
      setActivePluginContent(null);
    }

    const applyChange = async (): Promise<void> => {
      const result = enabled
        ? await pluginHost.enablePlugin(pluginId)
        : await pluginHost.disablePlugin(pluginId);
      refreshPluginCatalog((revision) => revision + 1);

      const disabledPluginIds = pluginManifests
        .filter((manifest) => !pluginHost.isPluginEnabled(manifest.id))
        .map((manifest) => manifest.id);
      const stored = storeDisabledPluginIds(disabledPluginIds);
      if (!result.ok) {
        setPluginError(result.error.message);
      } else if (!stored) {
        setPluginError('The plugin change applies until Ernie closes.');
      } else {
        setPluginError(null);
      }
      finishChange();
    };
    void applyChange().catch(() => {
      setPluginError('The plugin setting could not be changed.');
      finishChange();
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
          <SidebarControlBridge request={sidebarControlRequest} />
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
              thinkingOrbState={thinkingOrbState}
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
                    className={`inline-flex items-center gap-1 text-xs font-medium ${sessionStatus === 'done' ? 'text-success' : 'text-muted-foreground'}`}
                  >
                    {sessionStatus === 'done' ? null : (
                      <ThinkingOrb
                        aria-hidden="true"
                        className="shrink-0"
                        data-thinking-orb-state={thinkingOrbState}
                        size={20}
                        state={thinkingOrbState}
                        theme="auto"
                      />
                    )}
                    {sessionStatus}
                  </span>
                )}
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
                  onReload={onReload}
                  onThinkingOrbStateChange={onThinkingOrbStateChange}
                  thinkingOrbState={thinkingOrbState}
                />
              </div>
            ) : (
              <section
                className={`relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto ${
                  agentsActive ? 'px-6 pt-4 pb-6 sm:px-10' : ''
                }`}
              >
                {agentsActive ? (
                  <TaskSurface
                    workspace={workspace}
                    onRetryConnection={onReload}
                    thinkingOrbState={thinkingOrbState}
                  />
                ) : activePluginContent !== null &&
                  activePluginView !== null &&
                  activePluginManifest !== undefined &&
                  !pluginManagerOpen ? (
                  <PluginViewBoundary
                    pluginName={activePluginManifest.name}
                    viewId={activePluginView.id}
                    onDisable={() =>
                      changePluginEnabled(activePluginManifest.id, false)
                    }
                  >
                    {activePluginContent}
                  </PluginViewBoundary>
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
        busyPluginIds={busyPluginIds}
        isPluginEnabled={(pluginId) => pluginHost.isPluginEnabled(pluginId)}
        manifests={pluginManifests}
        onPluginEnabledChange={changePluginEnabled}
        open={pluginManagerOpen}
        onOpenChange={setPluginManagerOpen}
      />
    </TooltipProvider>
  );
}
