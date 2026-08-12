import { useEffect, useState } from 'react';

import { PluginViewBoundary } from '@/components/plugin-view-boundary';
import type {
  PluginHost,
  PluginManifest,
  PluginViewContribution,
} from '@/packages/plugin-host';
import type { PrimeAgentSessionView } from '@/packages/prime-agent-daemon/client';

interface RenderedAgentPluginView {
  readonly content: React.JSX.Element | null;
  readonly error: string | null;
  readonly viewId: string;
}

interface AgentPluginViewsProps {
  readonly host: PluginHost<React.JSX.Element>;
  readonly manifests: readonly PluginManifest[];
  readonly onDisablePlugin: (pluginId: string) => void;
  readonly sessionView: PrimeAgentSessionView;
  readonly views: readonly PluginViewContribution[];
}

/** Render enabled plugin contributions inside the focused Agent surface. */
export function AgentPluginViews({
  host,
  manifests,
  onDisablePlugin,
  sessionView,
  views,
}: AgentPluginViewsProps): React.JSX.Element {
  const [renderedViews, setRenderedViews] = useState<
    readonly RenderedAgentPluginView[]
  >([]);
  const viewIds = views.map((view) => view.id).join('\0');

  useEffect(() => {
    let current = true;
    void Promise.all(
      views.map(async (view): Promise<RenderedAgentPluginView> => {
        const result = await host.renderView(view.id);
        return result.ok
          ? { content: result.value, error: null, viewId: view.id }
          : { content: null, error: result.error.message, viewId: view.id };
      }),
    ).then((nextViews) => {
      if (current) setRenderedViews(nextViews);
    });
    return () => {
      current = false;
    };
  }, [host, sessionView, viewIds]);

  return (
    <div className="flex flex-col gap-10 py-6">
      {renderedViews.map((rendered) => {
        if (!views.some((view) => view.id === rendered.viewId)) return null;
        const manifest = manifests.find((candidate) =>
          candidate.contributes.views.some(
            (view) => view.id === rendered.viewId,
          ),
        );
        if (manifest === undefined) return null;
        return (
          <PluginViewBoundary
            key={rendered.viewId}
            pluginName={manifest.name}
            viewId={rendered.viewId}
            onDisable={() => onDisablePlugin(manifest.id)}
          >
            {rendered.error === null ? (
              rendered.content
            ) : (
              <div role="alert" className="text-sm text-destructive">
                {rendered.error}
              </div>
            )}
          </PluginViewBoundary>
        );
      })}
    </div>
  );
}
