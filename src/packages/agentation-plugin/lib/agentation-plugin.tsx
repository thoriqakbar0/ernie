import { Agentation } from 'agentation';
import { createRoot } from 'react-dom/client';

import {
  ernieUiSidebarDefaultWidth,
  ernieUiSidebarMaximumWidth,
  ernieUiSidebarMinimumWidth,
} from '../../ernie-ui-control/sidebar-control.js';
import {
  isJsonNumber,
  isJsonRecord,
  parseJsonValue,
} from '../../json-value/index.js';
import {
  currentPluginApiVersion,
  type PluginEffectCleanup,
  type PluginManifest,
  type PluginModule,
} from '../../plugin-host/index.js';

/** Stable identifier for Ernie's built-in Agentation plugin. */
export const agentationPluginId = 'ernie.agentation';

const agentationPositionStorageKey = 'feedback-toolbar-position';
const agentationToolbarWidth = 337;
const desktopSidebarBreakpoint = 768;
const sidebarWidthStorageKey = 'ernie:sidebar-width:v1';

function storedSidebarWidth(): number {
  const value = Number(window.localStorage.getItem(sidebarWidthStorageKey));
  return Number.isFinite(value) &&
    value >= ernieUiSidebarMinimumWidth &&
    value <= ernieUiSidebarMaximumWidth
    ? value
    : ernieUiSidebarDefaultWidth;
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

function mountAgentationToolbar(): PluginEffectCleanup {
  const container = document.createElement('div');
  container.dataset.erniePlugin = agentationPluginId;
  document.body.append(container);
  const root = createRoot(container);

  try {
    root.render(
      <Agentation
        className="ernie-agentation-toolbar"
        endpoint="http://localhost:4747"
      />,
    );
  } catch (cause) {
    container.remove();
    throw cause;
  }

  return () => {
    try {
      root.unmount();
    } finally {
      container.remove();
    }
  };
}

/** Renderer resources used by the Agentation plugin lifecycle. */
export interface AgentationPluginRuntime {
  /** Repair persisted toolbar position before mounting Agentation. */
  readonly prepareToolbar: () => void;

  /** Mount Agentation and return the cleanup that removes it. */
  readonly mountToolbar: () => PluginEffectCleanup;
}

const browserAgentationRuntime: AgentationPluginRuntime = {
  prepareToolbar: repairUnsafeAgentationPosition,
  mountToolbar: mountAgentationToolbar,
};

/** Built-in Agentation metadata available before its code activates. */
export const agentationPluginManifest: PluginManifest = Object.freeze({
  apiVersion: currentPluginApiVersion,
  id: agentationPluginId,
  name: 'Agentation',
  version: '3.0.2',
  description: 'Annotate Ernie and sync visual feedback to coding agents.',
  activationEvents: Object.freeze([Object.freeze({ event: 'startup' })]),
  contributes: Object.freeze({
    commands: Object.freeze([]),
    views: Object.freeze([]),
  }),
});

/** Create the Agentation plugin with application-wide toolbar ownership. */
export function createAgentationPluginModule(
  runtime: AgentationPluginRuntime = browserAgentationRuntime,
): PluginModule<React.JSX.Element> {
  return {
    manifest: agentationPluginManifest,
    async activate(context) {
      await context.acquire(() => {
        runtime.prepareToolbar();
        return {
          value: undefined,
          cleanup: runtime.mountToolbar(),
        };
      });
    },
  };
}
