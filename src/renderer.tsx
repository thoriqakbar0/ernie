import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { RendererApp } from '@/components/renderer-app';
import {
  applyAccentColor,
  applyColorTheme,
  readInitialAccentColor,
  readInitialColorThemePreference,
  resolveColorTheme,
} from '@/color-theme';

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

const initialColorThemePreference = readInitialColorThemePreference();
const initialAccentColor = readInitialAccentColor();
applyColorTheme(resolveColorTheme(initialColorThemePreference));
applyAccentColor(initialAccentColor);

function mountRenderer(): void {
  createRoot(rendererContainer).render(
    <StrictMode>
      <RendererApp
        initialAccentColor={initialAccentColor}
        initialColorThemePreference={initialColorThemePreference}
      />
    </StrictMode>,
  );

  const stopReadySignal = signalReadyAfterPaint();
  window.addEventListener('pagehide', stopReadySignal, { once: true });
}

window.addEventListener('ernie:preload-ready', mountRenderer, { once: true });
