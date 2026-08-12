import {
  currentPluginApiVersion,
  type PluginManifest,
} from '../plugin-host/index.js';

/** Stable identifier for Ernie's built-in AI Chat plugin. */
export const aiChatPluginId = 'ernie.ai-chat';

/** Stable identifier for the transcript view inside a focused Agent. */
export const aiChatPluginViewId = 'ernie.ai-chat.transcript';

/** Built-in AI Chat metadata available before its code activates. */
export const aiChatPluginManifest: PluginManifest = Object.freeze({
  apiVersion: currentPluginApiVersion,
  id: aiChatPluginId,
  name: 'AI Chat',
  version: '0.1.0',
  description: 'Show the focused Agent conversation and execution work.',
  activationEvents: Object.freeze([
    Object.freeze({ event: 'view', viewId: aiChatPluginViewId }),
  ]),
  contributes: Object.freeze({
    commands: Object.freeze([]),
    views: Object.freeze([
      Object.freeze({
        id: aiChatPluginViewId,
        title: 'AI Chat',
        description: 'Show the focused Agent conversation and execution work.',
        icon: 'puzzle',
        location: 'agent',
      }),
    ]),
  }),
});
