import { Agentation } from 'agentation';
import { useCallback, useLayoutEffect, useState } from 'react';

import { ErnieShell } from '@/components/ernie-shell';
import {
  applyColorTheme,
  parseColorTheme,
  storeColorTheme,
  type ColorTheme,
} from '@/color-theme';
import {
  isJsonNumber,
  isJsonRecord,
  parseJsonValue,
} from '@/packages/json-value';
import type { ErnieRendererApi } from '@/renderer-api';

interface RendererAppProps {
  readonly initialColorTheme: ColorTheme;
}

const agentationPositionStorageKey = 'feedback-toolbar-position';
const agentationToolbarWidth = 337;
const desktopSidebarBreakpoint = 768;
const sidebarDefaultWidth = 280;
const sidebarMaximumWidth = 384;
const sidebarWidthStorageKey = 'ernie:sidebar-width:v1';

function storedSidebarWidth(): number {
  const value = Number(window.localStorage.getItem(sidebarWidthStorageKey));
  return Number.isFinite(value) && value >= 192 && value <= sidebarMaximumWidth
    ? value
    : sidebarDefaultWidth;
}

function storeSafeAgentationPosition(): void {
  window.localStorage.setItem(
    agentationPositionStorageKey,
    JSON.stringify({
      x: window.innerWidth - agentationToolbarWidth - 20,
      y: 64,
    }),
  );
}

/** Move a saved Agentation position outside Ernie's desktop sidebar. */
export function repairUnsafeAgentationPosition(): void {
  if (window.innerWidth < desktopSidebarBreakpoint) return;

  try {
    const rawPosition = parseJsonValue(
      JSON.parse(window.localStorage.getItem(agentationPositionStorageKey) ?? 'null'),
    );
    if (
      !isJsonRecord(rawPosition) ||
      !('x' in rawPosition) ||
      !('y' in rawPosition) ||
      !isJsonNumber(rawPosition.x) ||
      !isJsonNumber(rawPosition.y)
    ) {
      storeSafeAgentationPosition();
      return;
    }

    const sidebarSafeEdge = storedSidebarWidth() + 12;
    const toolbarInsideViewport =
      rawPosition.x >= sidebarSafeEdge &&
      rawPosition.x + agentationToolbarWidth <= window.innerWidth - 12 &&
      rawPosition.y >= 56 &&
      rawPosition.y <= window.innerHeight - 56;
    if (!toolbarInsideViewport) storeSafeAgentationPosition();
  } catch {
    storeSafeAgentationPosition();
  }
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

/** Own the renderer's interactive application state. */
export function RendererApp({
  initialColorTheme,
}: RendererAppProps): React.JSX.Element {
  const [debugHudEnabled, setDebugHudEnabled] = useState(false);
  const [agentationReady, setAgentationReady] = useState(false);
  const [colorTheme, setColorTheme] = useState(initialColorTheme);

  const selectColorTheme = useCallback((theme: ColorTheme): void => {
    applyColorTheme(theme);
    storeColorTheme(theme);
    setColorTheme(theme);
  }, []);

  useLayoutEffect(
    () => watchColorThemeRequests(window.ernie, selectColorTheme),
    [selectColorTheme],
  );

  useLayoutEffect(() => {
    if (!debugHudEnabled) {
      setAgentationReady(false);
      return;
    }
    repairUnsafeAgentationPosition();
    setAgentationReady(true);
  }, [debugHudEnabled]);

  const changeDarkMode = (enabled: boolean): void => {
    selectColorTheme(enabled ? 'dark' : 'light');
  };

  const reloadRenderer = (): void => {
    window.location.reload();
  };

  return (
    <>
      <ErnieShell
        darkModeEnabled={colorTheme === 'dark'}
        debugHudEnabled={debugHudEnabled}
        onDarkModeEnabledChange={changeDarkMode}
        onDebugHudEnabledChange={setDebugHudEnabled}
        onReload={reloadRenderer}
      />
      {debugHudEnabled && agentationReady ? (
        <Agentation
          className="ernie-agentation-toolbar"
          endpoint="http://localhost:4747"
        />
      ) : null}
    </>
  );
}
