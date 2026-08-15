import { useCallback, useLayoutEffect, useState } from 'react';

import { ErnieShell } from '@/components/ernie-shell';
import {
  applyColorTheme,
  parseColorTheme,
  storeColorTheme,
  type ColorTheme,
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
  readonly initialColorTheme: ColorTheme;
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
  initialColorTheme,
}: RendererAppProps): React.JSX.Element {
  const [colorTheme, setColorTheme] = useState(initialColorTheme);
  const [thinkingOrbState, setThinkingOrbState] = useState(
    readInitialThinkingOrbState,
  );
  const [sidebarControlRequest, setSidebarControlRequest] =
    useState<ErnieUiSidebarRequest | null>(null);

  const selectColorTheme = useCallback((theme: ColorTheme): void => {
    applyColorTheme(theme);
    storeColorTheme(theme);
    setColorTheme(theme);
  }, []);

  useLayoutEffect(
    () => watchColorThemeRequests(window.ernie, selectColorTheme),
    [selectColorTheme],
  );

  useLayoutEffect(
    () =>
      watchSidebarControlRequests(window.ernie, setSidebarControlRequest),
    [],
  );

  const changeDarkMode = (enabled: boolean): void => {
    selectColorTheme(enabled ? 'dark' : 'light');
  };

  const changeThinkingOrbState = (state: ThinkingOrbState): void => {
    storeThinkingOrbState(state);
    setThinkingOrbState(state);
  };

  const reloadRenderer = (): void => {
    window.location.reload();
  };

  return (
    <ErnieShell
      darkModeEnabled={colorTheme === 'dark'}
      onDarkModeEnabledChange={changeDarkMode}
      onReload={reloadRenderer}
      sidebarControlRequest={sidebarControlRequest}
      thinkingOrbState={thinkingOrbState}
      onThinkingOrbStateChange={changeThinkingOrbState}
    />
  );
}
