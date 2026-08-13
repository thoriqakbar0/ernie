import 'react-grab';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { RendererApp } from '@/components/renderer-app';
import { applyColorTheme, readInitialColorTheme } from '@/color-theme';

import './index.css';

const reactGrabOverlaySelector = '[data-testid="react-grab-overlay"]';
const reactGrabToolbarSelector = '[data-react-grab-toolbar]';

function isReactGrabToolbarVisible(): boolean {
  const overlay = document.querySelector(reactGrabOverlaySelector);
  const toolbar = overlay?.shadowRoot?.querySelector(reactGrabToolbarSelector);

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
  let frameId: number | undefined;
  let visibleFrameCount = 0;

  const signalWhenReady = (): void => {
    if (isReactGrabToolbarVisible()) {
      visibleFrameCount += 1;
      if (visibleFrameCount === 2) {
        window.ernie.signalReady();
        return;
      }
    } else {
      visibleFrameCount = 0;
    }

    frameId = requestAnimationFrame(signalWhenReady);
  };

  frameId = requestAnimationFrame(signalWhenReady);

  return () => {
    if (frameId !== undefined) cancelAnimationFrame(frameId);
  };
}

const container = document.querySelector<HTMLElement>('#app');

if (container === null) {
  throw new Error('Ernie renderer root is missing.');
}
const rendererContainer = container;

const initialColorTheme = readInitialColorTheme();
applyColorTheme(initialColorTheme);

function mountRenderer(): void {
  createRoot(rendererContainer).render(
    <StrictMode>
      <RendererApp initialColorTheme={initialColorTheme} />
    </StrictMode>,
  );

  const stopReadySignal = signalReadyAfterPaint();
  window.addEventListener('pagehide', stopReadySignal, { once: true });
}

window.addEventListener('ernie:preload-ready', mountRenderer, { once: true });
