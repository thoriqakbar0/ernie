import { Agentation } from 'agentation';
import { useLayoutEffect, useState } from 'react';

import { ErnieShell } from '@/components/ernie-shell';
import {
  applyColorTheme,
  storeColorTheme,
  type ColorTheme,
} from '@/color-theme';
import {
  isJsonNumber,
  isJsonRecord,
  parseJsonValue,
} from '@/packages/json-value';

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
    if (!toolbarInsideViewport) {
      storeSafeAgentationPosition();
    }
  } catch {
    storeSafeAgentationPosition();
  }
}

/** Own the renderer's interactive application state. */
export function RendererApp({
  initialColorTheme,
}: RendererAppProps): React.JSX.Element {
  const [agentationEnabled, setAgentationEnabled] = useState(true);
  const [agentationReady, setAgentationReady] = useState(false);
  const [colorTheme, setColorTheme] = useState(initialColorTheme);

  useLayoutEffect(() => {
    repairUnsafeAgentationPosition();
    setAgentationReady(true);
  }, []);

  const changeDarkMode = (enabled: boolean): void => {
    const nextTheme = enabled ? 'dark' : 'light';
    applyColorTheme(nextTheme);
    storeColorTheme(nextTheme);
    setColorTheme(nextTheme);
  };

  const reloadRenderer = (): void => {
    window.location.reload();
  };

  return (
    <>
      <ErnieShell
        agentationEnabled={agentationEnabled}
        darkModeEnabled={colorTheme === 'dark'}
        onAgentationEnabledChange={setAgentationEnabled}
        onDarkModeEnabledChange={changeDarkMode}
        onReload={reloadRenderer}
      />
      {agentationEnabled && agentationReady && (
        <Agentation
          className="ernie-agentation-toolbar"
          endpoint="http://localhost:4747"
        />
      )}
    </>
  );
}
