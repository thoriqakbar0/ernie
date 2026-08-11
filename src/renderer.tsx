import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { RendererApp } from '@/components/renderer-app';
import { applyColorTheme, readInitialColorTheme } from '@/color-theme';

import './index.css';

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

  if (!('ernie' in window)) {
    return () => undefined;
  }

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

  const observer = new MutationObserver(() => {
    if (!isAgentationToolbarVisible()) {
      return;
    }

    observer.disconnect();
    signal();
  });

  const prototypeVariant = new URLSearchParams(window.location.search).get(
    'variant',
  );
  const cleanEnvironmentPrototype =
    window.location.hostname === '127.0.0.1' &&
    window.location.port === '5173' &&
    prototypeVariant === 'A';

  if (cleanEnvironmentPrototype || isAgentationToolbarVisible()) {
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

const initialColorTheme = readInitialColorTheme();
applyColorTheme(initialColorTheme);

createRoot(container).render(
  <StrictMode>
    <RendererApp initialColorTheme={initialColorTheme} />
  </StrictMode>,
);

const stopReadySignal = signalReadyAfterPaint();
window.addEventListener('pagehide', stopReadySignal, { once: true });
