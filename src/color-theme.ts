import type { JsonValue } from '@/packages/json-value';

const colorThemeStorageKey = 'ernie.color-theme';

/** The two color appearances supported by Ernie. */
export type ColorTheme = 'dark' | 'light';

/** Parse one renderer-boundary value into a supported color appearance. */
export function parseColorTheme(
  value: JsonValue | undefined,
): ColorTheme | null {
  if (value === 'dark' || value === 'light') return value;
  return null;
}

/** Read the saved appearance, or use the current system appearance. */
export function readInitialColorTheme(): ColorTheme {
  const storedTheme = parseColorTheme(
    window.localStorage.getItem(colorThemeStorageKey),
  );

  if (storedTheme !== null) return storedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Apply an appearance to the renderer document. */
export function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Save an explicit appearance selection for the next launch. */
export function storeColorTheme(theme: ColorTheme): void {
  window.localStorage.setItem(colorThemeStorageKey, theme);
}
