import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Globe2Icon,
  RefreshCwIcon,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { Button } from '@/components/trovecn/ui/button';
import {
  browserPluginBackCommand,
  browserPluginForwardCommand,
  browserPluginManifest,
  browserPluginReloadCommand,
  browserPluginViewId,
  parseBrowserPluginAcknowledgement,
  parseBrowserPluginLeaseResult,
  parseBrowserPluginResult,
  parseBrowserPluginState,
  resolveBrowserAddress,
  type BrowserPluginRendererApi,
  type BrowserPluginState,
} from './index.js';
import type {
  PluginActivationContext,
  PluginModule,
  PluginResult,
} from '../plugin-host/index.js';

/** Inputs supplied by Ernie when rendering the Browser plugin view. */
export interface BrowserPluginViewProps {
  readonly renderer: BrowserPluginRendererApi;
  readonly executeCommand: (commandId: string) => Promise<PluginResult<void>>;
}

const initialState: BrowserPluginState = {
  url: '',
  title: 'New tab',
  loading: false,
  canGoBack: false,
  canGoForward: false,
};

/** Render the Browser plugin toolbar and reserve bounds for its native page view. */
export function BrowserPluginView({
  renderer,
  executeCommand,
}: BrowserPluginViewProps): React.JSX.Element {
  const pageRef = useRef<HTMLDivElement>(null);
  const [navigation, setNavigation] = useState(initialState);
  const [address, setAddress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const applyState = (value: Parameters<typeof parseBrowserPluginState>[0]): void => {
      const result = parseBrowserPluginState(value);
      if (!result.ok) return;
      setNavigation(result.value);
      setAddress(result.value.url);
      setErrorMessage(null);
    };
    const stopListening = renderer.onBrowserPluginState(applyState);

    const showAtCurrentBounds = async (): Promise<void> => {
      const page = pageRef.current;
      if (page === null) return;
      const bounds = page.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;
      try {
        const result = parseBrowserPluginResult(
          await renderer.showBrowserPlugin({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          }),
        );
        if (result.ok) {
          setNavigation(result.value);
          setAddress(result.value.url);
          setErrorMessage(null);
        } else {
          setErrorMessage(result.error.message);
        }
      } catch {
        setErrorMessage('Browser is unavailable.');
      }
    };

    const observer =
      window.ResizeObserver === undefined
        ? null
        : new ResizeObserver(() => {
            void showAtCurrentBounds();
          });
    if (pageRef.current !== null) observer?.observe(pageRef.current);
    void showAtCurrentBounds();

    return () => {
      observer?.disconnect();
      stopListening();
      void renderer.hideBrowserPlugin().catch(() => undefined);
    };
  }, [renderer]);

  const navigate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const destination = resolveBrowserAddress(address);
    if (!destination.ok) {
      setErrorMessage(destination.error.message);
      return;
    }
    setErrorMessage(null);
    try {
      const result = parseBrowserPluginResult(
        await renderer.navigateBrowserPlugin(destination.value),
      );
      if (result.ok) {
        setNavigation(result.value);
        setAddress(result.value.url);
      } else {
        setErrorMessage(result.error.message);
      }
    } catch {
      setErrorMessage('The page could not be loaded.');
    }
  };

  const runCommand = async (commandId: string): Promise<void> => {
    const result = await executeCommand(commandId);
    if (!result.ok) setErrorMessage(result.error.message);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border/60 px-2 sm:px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Go back"
          disabled={!navigation.canGoBack}
          onClick={() => void runCommand(browserPluginBackCommand)}
        >
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Go forward"
          disabled={!navigation.canGoForward}
          onClick={() => void runCommand(browserPluginForwardCommand)}
        >
          <ArrowRightIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Reload page"
          onClick={() => void runCommand(browserPluginReloadCommand)}
        >
          <RefreshCwIcon
            aria-hidden="true"
            className={navigation.loading ? 'animate-spin motion-reduce:animate-none' : undefined}
          />
        </Button>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => void navigate(event)}
        >
          <label className="flex h-8 items-center gap-2 rounded-lg border border-border/70 bg-muted/45 px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
            <Globe2Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="sr-only">Browser address</span>
            <input
              type="text"
              aria-label="Browser address"
              className="min-w-0 flex-1 select-text bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search or enter address"
              spellCheck={false}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        </form>
      </div>
      {errorMessage === null ? null : (
        <div
          role="status"
          className="shrink-0 border-b border-destructive/20 bg-destructive/8 px-4 py-2 text-xs text-destructive"
        >
          {errorMessage}
        </div>
      )}
      <div
        ref={pageRef}
        role="region"
        aria-label="Browser page"
        className="relative min-h-0 flex-1 bg-white"
      >
        {navigation.url.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Opening Browser…
          </div>
        ) : null}
      </div>
    </div>
  );
}

async function requireSuccessfulOperation(
  operation: Promise<Parameters<typeof parseBrowserPluginResult>[0]>,
): Promise<void> {
  const result = parseBrowserPluginResult(await operation);
  if (!result.ok) throw result.error;
}

async function acquireBrowserPluginLease(
  renderer: BrowserPluginRendererApi,
) {
  const acquired = parseBrowserPluginLeaseResult(
    await renderer.acquireBrowserPlugin(),
  );
  if (!acquired.ok) throw acquired.error;

  return {
    value: acquired.value,
    cleanup: async (): Promise<void> => {
      const released = parseBrowserPluginAcknowledgement(
        await renderer.releaseBrowserPlugin(acquired.value),
      );
      if (!released.ok) throw released.error;
    },
  };
}

function registerBrowserCommands(
  context: PluginActivationContext<React.JSX.Element>,
  renderer: BrowserPluginRendererApi,
): void {
  context.registerCommand(browserPluginBackCommand, () =>
    requireSuccessfulOperation(renderer.goBackBrowserPlugin()),
  );
  context.registerCommand(browserPluginForwardCommand, () =>
    requireSuccessfulOperation(renderer.goForwardBrowserPlugin()),
  );
  context.registerCommand(browserPluginReloadCommand, () =>
    requireSuccessfulOperation(renderer.reloadBrowserPlugin()),
  );
}

/** Create the Browser plugin module with its commands and owned workbench UI. */
export function createBrowserPluginModule(
  renderer: BrowserPluginRendererApi,
): PluginModule<React.JSX.Element> {
  return {
    manifest: browserPluginManifest,
    async activate(context) {
      await context.acquire(() => acquireBrowserPluginLease(renderer));
      registerBrowserCommands(context, renderer);
      context.registerView(browserPluginViewId, ({ executeCommand }) => (
        <BrowserPluginView
          renderer={renderer}
          executeCommand={executeCommand}
        />
      ));
    },
  };
}
