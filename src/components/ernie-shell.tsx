import {
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

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen className="select-none">
        <AgentSidebar {...workspace} />

        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6">
            <SidebarTrigger aria-label="Toggle repository sidebar" />
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
            <TaskSurface workspace={workspace} onRetryConnection={onReload} />
          </section>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
