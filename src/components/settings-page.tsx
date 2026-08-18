import {
  ArrowLeftIcon,
  MonitorIcon,
  MoonIcon,
  PuzzleIcon,
  RefreshCwIcon,
  SunIcon,
} from 'lucide-react';
import { ThinkingOrb } from 'thinking-orbs';

import { Button } from '@/components/trovecn/ui/button';
import {
  defaultAccentColor,
  type ColorThemePreference,
} from '@/color-theme';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  parseThinkingOrbState,
  thinkingOrbOptions,
  type ThinkingOrbState,
} from '@/thinking-orb-preference';

interface SettingsPageProps {
  readonly accentColor: string | null;
  readonly backLabel: string;
  readonly colorThemePreference: ColorThemePreference;
  readonly thinkingOrbState: ThinkingOrbState;
  readonly onClose: () => void;
  readonly onAccentColorChange: (color: string | null) => void;
  readonly onColorThemePreferenceChange: (
    preference: ColorThemePreference,
  ) => void;
  readonly onOpenPlugins: () => void;
  readonly onReload: () => void;
  readonly onThinkingOrbStateChange: (state: ThinkingOrbState) => void;
}

/** Show Ernie's application preferences and apply each change immediately. */
export function SettingsPage({
  accentColor,
  backLabel,
  colorThemePreference,
  thinkingOrbState,
  onClose,
  onAccentColorChange,
  onColorThemePreferenceChange,
  onOpenPlugins,
  onReload,
  onThinkingOrbStateChange,
}: SettingsPageProps): React.JSX.Element {
  const selectedThinkingOrb =
    thinkingOrbOptions.find((option) => option.value === thinkingOrbState) ??
    thinkingOrbOptions[0];

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
          <div className="divide-y divide-border/70 rounded-xl border border-border/70 bg-card shadow-sm">
            <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
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
                  variant={
                    colorThemePreference === 'system' ? 'elevated' : 'ghost'
                  }
                  size="sm"
                  aria-pressed={colorThemePreference === 'system'}
                  onClick={() => onColorThemePreferenceChange('system')}
                >
                  <MonitorIcon aria-hidden="true" />
                  System
                </Button>
                <Button
                  type="button"
                  variant={
                    colorThemePreference === 'light' ? 'elevated' : 'ghost'
                  }
                  size="sm"
                  aria-pressed={colorThemePreference === 'light'}
                  onClick={() => onColorThemePreferenceChange('light')}
                >
                  <SunIcon aria-hidden="true" />
                  Light
                </Button>
                <Button
                  type="button"
                  variant={
                    colorThemePreference === 'dark' ? 'elevated' : 'ghost'
                  }
                  size="sm"
                  aria-pressed={colorThemePreference === 'dark'}
                  onClick={() => onColorThemePreferenceChange('dark')}
                >
                  <MoonIcon aria-hidden="true" />
                  Dark
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Accent color</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Personalize actions, selection, and focus throughout Ernie.
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                <label className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-2 font-mono text-xs uppercase">
                  <input
                    aria-label="Accent color"
                    className="size-5 cursor-pointer appearance-none overflow-hidden rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                    type="color"
                    value={accentColor ?? defaultAccentColor}
                    onChange={(event) =>
                      onAccentColorChange(event.currentTarget.value)
                    }
                  />
                  {accentColor ?? defaultAccentColor}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={accentColor === null}
                  onClick={() => onAccentColorChange(null)}
                >
                  Reset
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Thinking animation</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Choose the motion shown while an Agent is working.
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                <ThinkingOrb
                  aria-label={`${selectedThinkingOrb.label} thinking animation preview`}
                  data-thinking-orb-state={thinkingOrbState}
                  size={64}
                  state={thinkingOrbState}
                  theme="auto"
                />
                <Select
                  items={thinkingOrbOptions}
                  value={thinkingOrbState}
                  onValueChange={(value) => {
                    const state = parseThinkingOrbState(value);
                    if (state !== null) onThinkingOrbStateChange(state);
                  }}
                >
                  <SelectTrigger
                    aria-label="Thinking animation"
                    className="min-w-36 bg-background"
                  >
                    <ThinkingOrb
                      aria-hidden="true"
                      data-thinking-orb-state={thinkingOrbState}
                      size={20}
                      state={thinkingOrbState}
                      theme="auto"
                    />
                    <span>{selectedThinkingOrb.label}</span>
                  </SelectTrigger>
                  <SelectContent
                    align="end"
                    alignItemWithTrigger={false}
                    sideOffset={6}
                  >
                    <SelectGroup>
                      {thinkingOrbOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <ThinkingOrb
                            aria-hidden="true"
                            className="shrink-0"
                            data-thinking-orb-state={option.value}
                            size={20}
                            state={option.value}
                            theme="auto"
                          />
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="tools-settings-title">
          <h3 id="tools-settings-title" className="mb-3 text-sm font-medium">
            Tools
          </h3>
          <div className="rounded-xl border border-border/70 bg-card shadow-sm">
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
