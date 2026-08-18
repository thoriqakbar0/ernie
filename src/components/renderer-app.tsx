import { useCallback, useLayoutEffect, useState } from 'react';

import { ErnieShell } from '@/components/ernie-shell';
import {
  applyAccentColor,
  applyColorTheme,
  parseColorTheme,
  resolveColorTheme,
  storeAccentColor,
  storeColorTheme,
  type ColorTheme,
  type ColorThemePreference,
} from '@/color-theme';
import {
  parseErnieUiSidebarRequest,
  type ErnieUiSidebarRequest,
} from '@/packages/ernie-ui-control/sidebar-control';
import type { ErnieRendererApi } from '@/renderer-api';
import {
  readInitialThinkingOrbState,
  storeThinkingOrbState,
  type ThinkingOrbState,
} from '@/thinking-orb-preference';

interface RendererAppProps {
  readonly initialAccentColor: string | null;
  readonly initialColorThemePreference: ColorThemePreference;
}

/** Subscribe to valid CLI-driven color appearance requests. */
export function watchColorThemeRequests(
  api: Pick<ErnieRendererApi, 'onColorThemeRequest'>,
  selectTheme: (theme: ColorTheme) => void,
): () => void {
  return api.onColorThemeRequest((value) => {
    const theme = parseColorTheme(value);
    if (theme !== null) selectTheme(theme);
  });
}

/** Subscribe to valid CLI-driven sidebar presentation requests. */
export function watchSidebarControlRequests(
  api: Pick<ErnieRendererApi, 'onSidebarControlRequest'>,
  selectRequest: (request: ErnieUiSidebarRequest) => void,
): () => void {
  return api.onSidebarControlRequest((value) => {
    const request = parseErnieUiSidebarRequest(value);
    if (request !== null) selectRequest(request);
  });
}

/** Own the renderer's interactive application state. */
export function RendererApp({
  initialAccentColor,
  initialColorThemePreference,
}: RendererAppProps): React.JSX.Element {
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [colorThemePreference, setColorThemePreference] = useState(
    initialColorThemePreference,
  );
  const [thinkingOrbState, setThinkingOrbState] = useState(
    readInitialThinkingOrbState,
  );
  const [sidebarControlRequest, setSidebarControlRequest] =
    useState<ErnieUiSidebarRequest | null>(null);

  const selectColorTheme = useCallback((theme: ColorThemePreference): void => {
    applyColorTheme(resolveColorTheme(theme));
    storeColorTheme(theme);
    setColorThemePreference(theme);
  }, []);

  const selectAccentColor = (color: string | null): void => {
    applyAccentColor(color);
    storeAccentColor(color);
    setAccentColor(color);
  };

  useLayoutEffect(
    () => watchColorThemeRequests(window.ernie, selectColorTheme),
    [selectColorTheme],
  );

  useLayoutEffect(
    () =>
      watchSidebarControlRequests(window.ernie, setSidebarControlRequest),
    [],
  );

  useLayoutEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = (): void => {
      if (colorThemePreference === 'system') {
        applyColorTheme(systemTheme.matches ? 'dark' : 'light');
      }
    };
    systemTheme.addEventListener('change', applySystemTheme);
    return () => systemTheme.removeEventListener('change', applySystemTheme);
  }, [colorThemePreference]);

  const changeThinkingOrbState = (state: ThinkingOrbState): void => {
    storeThinkingOrbState(state);
    setThinkingOrbState(state);
  };

  const reloadRenderer = (): void => {
    window.location.reload();
  };

  return (
    <ErnieShell
      accentColor={accentColor}
      colorThemePreference={colorThemePreference}
      onAccentColorChange={selectAccentColor}
      onColorThemePreferenceChange={selectColorTheme}
      onReload={reloadRenderer}
      sidebarControlRequest={sidebarControlRequest}
      thinkingOrbState={thinkingOrbState}
      onThinkingOrbStateChange={changeThinkingOrbState}
    />
  );
}
