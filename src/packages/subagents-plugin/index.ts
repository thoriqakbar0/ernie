import {
  currentPluginApiVersion,
  type PluginManifest,
} from '../plugin-host/index.js';

/** Stable identifier for Ernie's built-in Subagents plugin. */
export const subagentsPluginId = 'ernie.subagents';

/** Stable identifier for delegated work inside a focused Agent. */
export const subagentsPluginViewId = 'ernie.subagents.tree';

/** Built-in Subagents metadata available before its code activates. */
export const subagentsPluginManifest: PluginManifest = Object.freeze({
  apiVersion: currentPluginApiVersion,
  id: subagentsPluginId,
  name: 'Subagents',
  version: '0.1.0',
  description: 'Show recursive delegated work for the focused Agent.',
  activationEvents: Object.freeze([
    Object.freeze({ event: 'view', viewId: subagentsPluginViewId }),
  ]),
  contributes: Object.freeze({
    commands: Object.freeze([]),
    views: Object.freeze([
      Object.freeze({
        id: subagentsPluginViewId,
        title: 'Subagents',
        description: 'Show recursive delegated work for the focused Agent.',
        icon: 'puzzle',
        location: 'agent',
      }),
    ]),
  }),
});
