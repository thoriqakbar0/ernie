import { Agentation } from 'agentation';
import { useState } from 'react';

import { CleanEnvironmentPrototype } from '@/components/clean-environment-prototype';
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
  const prototypeVariant = new URLSearchParams(window.location.search).get(
    'variant',
  );

  if (
    window.location.hostname === '127.0.0.1' &&
    window.location.port === '5173' &&
    prototypeVariant === 'A'
  ) {
    return <CleanEnvironmentPrototype />;
  }

  return <ProductionRendererApp initialColorTheme={initialColorTheme} />;
}

function ProductionRendererApp({
  initialColorTheme,
}: RendererAppProps): React.JSX.Element {
  const [agentationEnabled, setAgentationEnabled] = useState(true);
  const [colorTheme, setColorTheme] = useState(initialColorTheme);

  const changeDarkMode = (enabled: boolean): void => {
    const nextTheme = enabled ? 'dark' : 'light';
    applyColorTheme(nextTheme);
    storeColorTheme(nextTheme);
    setColorTheme(nextTheme);
  };

  const reloadRenderer = (): void => {
    window.location.reload();
  };

  return (
    <>
      <ErnieShell
        agentationEnabled={agentationEnabled}
        darkModeEnabled={colorTheme === 'dark'}
        onAgentationEnabledChange={setAgentationEnabled}
        onDarkModeEnabledChange={changeDarkMode}
        onReload={reloadRenderer}
      />
      {agentationEnabled && (
        <Agentation endpoint="http://localhost:4747" />
      )}
    </>
  );
}
