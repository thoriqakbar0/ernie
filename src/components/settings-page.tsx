import {
  ArrowLeftIcon,
  MoonIcon,
  PuzzleIcon,
  RefreshCwIcon,
  SunIcon,
} from 'lucide-react';

import { Button } from '@/components/trovecn/ui/button';
import { Switch } from '@/components/trovecn/ui/switch';

interface SettingsPageProps {
  readonly backLabel: string;
  readonly darkModeEnabled: boolean;
  readonly onClose: () => void;
  readonly onDarkModeEnabledChange: (enabled: boolean) => void;
  readonly onOpenPlugins: () => void;
  readonly onReactGrabEnabledChange: (enabled: boolean) => void;
  readonly onReload: () => void;
  readonly reactGrabEnabled: boolean;
}

/** Show Ernie's application preferences and apply each change immediately. */
export function SettingsPage({
  backLabel,
  darkModeEnabled,
  onClose,
  onDarkModeEnabledChange,
  onOpenPlugins,
  onReactGrabEnabledChange,
  onReload,
  reactGrabEnabled,
}: SettingsPageProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="settings-title"
      className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-10 sm:py-12"
    >
      <header className="mb-10">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ms-2 mb-5 text-muted-foreground"
          onClick={onClose}
        >
          <ArrowLeftIcon aria-hidden="true" />
          {backLabel}
        </Button>
        <h2 id="settings-title" className="text-2xl font-semibold tracking-tight">
          Settings
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Adjust how Ernie looks and behaves on this device.
        </p>
      </header>

      <div className="space-y-8">
        <section aria-labelledby="appearance-settings-title">
          <h3
            id="appearance-settings-title"
            className="mb-3 text-sm font-medium"
          >
            Appearance
          </h3>
          <div className="flex items-center justify-between gap-6 rounded-xl border border-border/70 bg-card px-4 py-4 shadow-sm">
            <div className="min-w-0">
              <p className="text-sm font-medium">Color theme</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Choose the appearance used throughout Ernie.
              </p>
            </div>
            <div
              role="group"
              aria-label="Color theme"
              className="flex shrink-0 rounded-lg bg-muted p-1"
            >
              <Button
                type="button"
                variant={darkModeEnabled ? 'ghost' : 'elevated'}
                size="sm"
                aria-pressed={!darkModeEnabled}
                onClick={() => onDarkModeEnabledChange(false)}
              >
                <SunIcon aria-hidden="true" />
                Light
              </Button>
              <Button
                type="button"
                variant={darkModeEnabled ? 'elevated' : 'ghost'}
                size="sm"
                aria-pressed={darkModeEnabled}
                onClick={() => onDarkModeEnabledChange(true)}
              >
                <MoonIcon aria-hidden="true" />
                Dark
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="tools-settings-title">
          <h3 id="tools-settings-title" className="mb-3 text-sm font-medium">
            Tools
          </h3>
          <div className="divide-y divide-border/70 rounded-xl border border-border/70 bg-card shadow-sm">
            <div className="flex items-center justify-between gap-6 px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Annotate</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Select interface elements when sharing structured feedback.
                </p>
              </div>
              <Switch
                aria-label="Annotate"
                checked={reactGrabEnabled}
                onCheckedChange={onReactGrabEnabledChange}
              />
            </div>
            <div className="flex items-center justify-between gap-6 px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Reload renderer</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Refresh the interface without restarting Ernie.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={onReload}>
                <RefreshCwIcon aria-hidden="true" />
                Reload
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="extensions-settings-title">
          <h3
            id="extensions-settings-title"
            className="mb-3 text-sm font-medium"
          >
            Extensions
          </h3>
          <div className="flex items-center justify-between gap-6 rounded-xl border border-border/70 bg-card px-4 py-4 shadow-sm">
            <div className="min-w-0">
              <p className="text-sm font-medium">Plugins</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                View the plugins and capabilities available in Ernie.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onOpenPlugins}>
              <PuzzleIcon aria-hidden="true" />
              Manage
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}
