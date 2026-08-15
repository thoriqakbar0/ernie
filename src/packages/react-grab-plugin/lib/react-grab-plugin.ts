import type { ReactGrabAPI } from 'react-grab';

import {
  currentPluginApiVersion,
  type PluginManifest,
  type PluginModule,
} from '../../plugin-host/index.js';

/** Stable identifier for Ernie's built-in React Grab plugin. */
export const reactGrabPluginId = 'ernie.react-grab';

/** React Grab controls owned by the plugin lifecycle. */
export type ReactGrabPluginApi = Pick<
  ReactGrabAPI,
  'dispose' | 'isEnabled' | 'setEnabled'
>;

/** Lazy browser dependency used when React Grab activates. */
export interface ReactGrabPluginRuntime {
  /** Load or create one React Grab API instance. */
  readonly load: () => Promise<ReactGrabPluginApi>;
}

const browserReactGrabRuntime: ReactGrabPluginRuntime = {
  async load() {
    const reactGrab = await import('react-grab');
    const api = reactGrab.getGlobalApi() ?? reactGrab.init();
    reactGrab.setGlobalApi(api);
    return api;
  },
};

/** Built-in React Grab metadata available before its code activates. */
export const reactGrabPluginManifest: PluginManifest = Object.freeze({
  apiVersion: currentPluginApiVersion,
  id: reactGrabPluginId,
  name: 'React Grab',
  version: '0.1.50',
  description: 'Select Ernie interface elements with their React source context.',
  activationEvents: Object.freeze([Object.freeze({ event: 'startup' })]),
  contributes: Object.freeze({
    commands: Object.freeze([]),
    views: Object.freeze([]),
  }),
});

/** Create the React Grab plugin with lazy startup and reversible cleanup. */
export function createReactGrabPluginModule(
  runtime: ReactGrabPluginRuntime = browserReactGrabRuntime,
): PluginModule<React.JSX.Element> {
  return {
    manifest: reactGrabPluginManifest,
    async activate(context) {
      await context.acquire(async () => {
        const api = await runtime.load();
        api.setEnabled(true);
        return {
          value: api,
          cleanup: () => api.dispose(),
        };
      });
    },
  };
}
