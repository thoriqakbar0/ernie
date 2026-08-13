import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { RendererApp } from '@/components/renderer-app';
import { applyColorTheme, readInitialColorTheme } from '@/color-theme';

import './index.css';

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

  signal();
  return cancelScheduledSignal;
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
