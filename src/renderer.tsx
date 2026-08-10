import { Agentation } from 'agentation';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ErnieShell } from '@/components/ernie-shell';

import './index.css';

declare const __ENABLE_AGENTATION__: boolean;

const agentationToolbarSelector = '[data-agentation-toolbar]';

function isAgentationToolbarVisible(): boolean {
  const toolbar = document.querySelector(agentationToolbarSelector);

  if (!(toolbar instanceof HTMLElement)) {
    return false;
  }

  const bounds = toolbar.getBoundingClientRect();
  const style = getComputedStyle(toolbar);

  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity) > 0
  );
}

function signalReadyAfterPaint(): () => void {
  let firstFrameId: number | undefined;
  let secondFrameId: number | undefined;

  const signal = (): void => {
    firstFrameId = requestAnimationFrame(() => {
      secondFrameId = requestAnimationFrame(() => {
        window.ernie.signalReady();
      });
    });
  };

  const cancelScheduledSignal = (): void => {
    if (firstFrameId !== undefined) cancelAnimationFrame(firstFrameId);
    if (secondFrameId !== undefined) cancelAnimationFrame(secondFrameId);
  };

  if (!__ENABLE_AGENTATION__) {
    signal();
    return cancelScheduledSignal;
  }

  const observer = new MutationObserver(() => {
    if (!isAgentationToolbarVisible()) {
      return;
    }

    observer.disconnect();
    signal();
  });

  if (isAgentationToolbarVisible()) {
    signal();
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  return () => {
    observer.disconnect();
    cancelScheduledSignal();
  };
}

const container = document.querySelector<HTMLElement>('#app');

if (container === null) {
  throw new Error('Ernie renderer root is missing.');
}

function RendererApp(): React.JSX.Element {
  const [devMode, setDevMode] = useState(__ENABLE_AGENTATION__);

  return (
    <>
      <ErnieShell
        devMode={devMode}
        devModeAvailable={__ENABLE_AGENTATION__}
        onDevModeChange={setDevMode}
      />
      {__ENABLE_AGENTATION__ && devMode && (
        <Agentation endpoint="http://localhost:4747" />
      )}
    </>
  );
}

createRoot(container).render(
  <StrictMode>
    <RendererApp />
  </StrictMode>,
);

const stopReadySignal = signalReadyAfterPaint();
window.addEventListener('pagehide', stopReadySignal, { once: true });
