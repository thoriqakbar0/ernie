import { PuzzleIcon } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/trovecn/ui/dialog';
import { Switch } from '@/components/trovecn/ui/switch';
import type { PluginManifest } from '@/packages/plugin-host';

interface PluginManagerDialogProps {
  readonly manifests: readonly PluginManifest[];
  readonly busyPluginIds: ReadonlySet<string>;
  readonly isPluginEnabled: (pluginId: string) => boolean;
  readonly onPluginEnabledChange: (pluginId: string, enabled: boolean) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** Show installed plugin metadata from Ernie's validated host catalog. */
export function PluginManagerDialog({
  manifests,
  busyPluginIds,
  isPluginEnabled,
  onPluginEnabledChange,
  open,
  onOpenChange,
}: PluginManagerDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Plugins</DialogTitle>
          <DialogDescription>
            Extend Ernie through versioned views, commands, and lazy activation.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 flex flex-col gap-2">
          {manifests.map((manifest) => {
            const enabled = isPluginEnabled(manifest.id);
            return (
              <article
                key={manifest.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-background/55 p-3"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <PuzzleIcon aria-hidden="true" className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                      {manifest.name}
                    </h3>
                    <span
                      className={
                        enabled
                          ? 'rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-medium text-success'
                          : 'rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground'
                      }
                    >
                      {enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Built in · v{manifest.version}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {manifest.description}
                  </p>
                  {enabled ? null : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Its UI and commands are removed. Turn it on to restore them.
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">
                    {manifest.id} · API {manifest.apiVersion}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  disabled={busyPluginIds.has(manifest.id)}
                  aria-label={`Enable ${manifest.name} plugin`}
                  onCheckedChange={(checked) =>
                    onPluginEnabledChange(manifest.id, checked)
                  }
                />
              </article>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
