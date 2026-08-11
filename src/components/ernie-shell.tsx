import {
  LoaderCircleIcon,
  MoonIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from 'lucide-react';

import { TaskSurface } from '@/components/task-surface';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePrimeAgentWorkspace } from '@/hooks/use-prime-agent-workspace';

interface AgentSidebarProps {
  readonly creatingAgent: boolean;
  readonly newAgentDisabled: boolean;
  readonly onCreateAgent: () => void;
}

function AgentSidebar({
  creatingAgent,
  newAgentDisabled,
  onCreateAgent,
}: AgentSidebarProps): React.JSX.Element {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Ernie">
              <img
                src="./ernie-logo.png"
                alt=""
                className="size-8 rounded-lg object-cover"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">Ernie</span>
                <span className="truncate text-xs text-muted-foreground">
                  cool agent desktop
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive
                  tooltip="New task"
                  onClick={onCreateAgent}
                  disabled={newAgentDisabled}
                  aria-busy={creatingAgent}
                >
                  {creatingAgent ? (
                    <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <PlusIcon />
                  )}
                  <span>New task</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Search">
                  <SearchIcon />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings">
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

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

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen className="select-none">
        <AgentSidebar
          creatingAgent={workspace.creatingAgent}
          newAgentDisabled={
            workspace.creatingAgent || workspace.selectedCwd === null
          }
          onCreateAgent={workspace.createAgent}
        />

        <SidebarInset className="min-w-0 overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6">
            <SidebarTrigger className="md:hidden" />
            <div className="ms-auto flex items-center gap-2">
              <Field orientation="horizontal" className="w-auto">
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
                size="icon-sm"
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
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Reload renderer"
                title="Reload renderer"
                onClick={onReload}
              >
                <RefreshCwIcon />
              </Button>
            </div>
          </header>

          <section className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-[clamp(1.5rem,6vh,4rem)] sm:px-10">
            <TaskSurface workspace={workspace} />
          </section>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
