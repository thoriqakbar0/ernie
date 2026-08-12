import { useState } from 'react';

import { ErnieShell } from '@/components/ernie-shell';
import {
  applyColorTheme,
  storeColorTheme,
  type ColorTheme,
} from '@/color-theme';

interface RendererAppProps {
  readonly initialColorTheme: ColorTheme;
}

/** Own the renderer's interactive application state. */
export function RendererApp({
  initialColorTheme,
}: RendererAppProps): React.JSX.Element {
  const [reactGrabEnabled, setReactGrabEnabled] = useState(true);
  const [colorTheme, setColorTheme] = useState(initialColorTheme);

  const changeDarkMode = (enabled: boolean): void => {
    const nextTheme = enabled ? 'dark' : 'light';
    applyColorTheme(nextTheme);
    storeColorTheme(nextTheme);
    setColorTheme(nextTheme);
  };

  const changeReactGrab = (enabled: boolean): void => {
    window.__REACT_GRAB__?.setEnabled(enabled);
    setReactGrabEnabled(enabled);
  };

  const reloadRenderer = (): void => {
    window.location.reload();
  };

  return (
    <>
      <ErnieShell
        darkModeEnabled={colorTheme === 'dark'}
        onDarkModeEnabledChange={changeDarkMode}
        onReload={reloadRenderer}
        onReactGrabEnabledChange={changeReactGrab}
        reactGrabEnabled={reactGrabEnabled}
      />
    </>
  );
}
