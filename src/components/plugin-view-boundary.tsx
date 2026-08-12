import { TriangleAlertIcon } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/trovecn/ui/button';

interface PluginViewBoundaryProps {
  readonly children: ReactNode;
  readonly onDisable: () => void;
  readonly pluginName: string;
  readonly viewId: string;
}

interface PluginViewBoundaryState {
  readonly failed: boolean;
}

/** Contain plugin render defects and keep host-owned recovery controls available. */
export class PluginViewBoundary extends Component<
  PluginViewBoundaryProps,
  PluginViewBoundaryState
> {
  state: PluginViewBoundaryState = { failed: false };

  static getDerivedStateFromError(): PluginViewBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The host intentionally avoids logging arbitrary plugin values.
  }

  componentDidUpdate(previous: PluginViewBoundaryProps): void {
    if (previous.viewId !== this.props.viewId && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div
        role="alert"
        className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center"
      >
        <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlertIcon aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-medium text-foreground">
            {this.props.pluginName} could not render
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Ernie contained the failure. Retry this view or disable its plugin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => this.setState({ failed: false })}
          >
            Try again
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={this.props.onDisable}
          >
            Disable plugin
          </Button>
        </div>
      </div>
    );
  }
}
