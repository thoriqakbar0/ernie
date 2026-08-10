import {
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
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

function AgentSidebar(): React.JSX.Element {
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
                  <em>cool</em> agent desktop
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
                <SidebarMenuButton isActive tooltip="New task">
                  <PlusIcon />
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
  devMode: boolean;
  devModeAvailable: boolean;
  onDevModeChange: (enabled: boolean) => void;
  onReload: () => void;
};

export function ErnieShell({
  devMode,
  devModeAvailable,
  onDevModeChange,
  onReload,
}: ErnieShellProps): React.JSX.Element {
  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen
        style={{ '--sidebar-width': '16.4375rem' } as React.CSSProperties}
      >
        <AgentSidebar />

        <SidebarInset className="min-w-0 overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6">
            <SidebarTrigger className="md:hidden" />
            <div className="ml-auto flex items-center gap-2">
              <Field orientation="horizontal" className="w-auto">
                <FieldLabel htmlFor="dev-mode">dev</FieldLabel>
                <Switch
                  id="dev-mode"
                  checked={devMode}
                  disabled={!devModeAvailable}
                  onCheckedChange={onDevModeChange}
                />
              </Field>
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

          <section className="relative grid min-h-0 flex-1 grid-rows-[minmax(7rem,0.55fr)_auto_minmax(10rem,1fr)] px-6 sm:px-10">
            <div aria-hidden="true" />

            <TaskSurface />

            <div aria-hidden="true" />
          </section>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
