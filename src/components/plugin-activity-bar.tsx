import { BotIcon, Globe2Icon, PuzzleIcon } from 'lucide-react';

import { Button } from '@/components/trovecn/ui/button';
import type {
  PluginViewContribution,
  PluginViewIcon,
} from '@/packages/plugin-host';

/** Stable identifier for Ernie's host-owned Agent workbench view. */
export const agentsViewId = 'ernie.agents';

interface PluginActivityBarProps {
  readonly activeViewId: string;
  readonly pluginViews: readonly PluginViewContribution[];
  readonly onSelectView: (viewId: string) => void;
}

function PluginIcon({ icon }: { readonly icon: PluginViewIcon }): React.JSX.Element {
  return icon === 'globe' ? (
    <Globe2Icon aria-hidden="true" />
  ) : (
    <PuzzleIcon aria-hidden="true" />
  );
}

/** Switch between Ernie's core Agent surface and plugin-contributed primary views. */
export function PluginActivityBar({
  activeViewId,
  pluginViews,
  onSelectView,
}: PluginActivityBarProps): React.JSX.Element {
  return (
    <nav
      aria-label="Workbench views"
      className="z-20 flex h-svh w-12 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar px-1.5 py-2 text-sidebar-foreground"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="relative size-9"
        aria-label="Agents"
        aria-pressed={activeViewId === agentsViewId}
        title="Agents"
        onClick={() => onSelectView(agentsViewId)}
      >
        <BotIcon aria-hidden="true" />
        {activeViewId === agentsViewId ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-1 -left-1.5 w-0.5 rounded-r bg-sidebar-foreground"
          />
        ) : null}
      </Button>

      <div className="my-1 h-px w-6 bg-sidebar-border" />

      {pluginViews.map((view) => (
        <Button
          key={view.id}
          type="button"
          variant="ghost"
          size="icon-lg"
          className="relative size-9"
          aria-label={view.title}
          aria-pressed={activeViewId === view.id}
          title={view.description}
          onClick={() => onSelectView(view.id)}
        >
          <PluginIcon icon={view.icon} />
          {activeViewId === view.id ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-1 -left-1.5 w-0.5 rounded-r bg-sidebar-foreground"
            />
          ) : null}
        </Button>
      ))}
    </nav>
  );
}
