import type { JsonValue } from '@/packages/json-value';

const colorThemeStorageKey = 'ernie.color-theme';
const accentColorStorageKey = 'ernie.accent-color';

/** The accent shown by the color input when no customization is active. */
export const defaultAccentColor = '#5969b8';

/** The two color appearances supported by Ernie. */
export type ColorTheme = 'dark' | 'light';

/** A saved appearance choice, including following the operating system. */
export type ColorThemePreference = ColorTheme | 'system';

/** Parse one renderer-boundary value into a supported color appearance. */
export function parseColorTheme(
  value: JsonValue | undefined,
): ColorTheme | null {
  if (value === 'dark' || value === 'light') return value;
  return null;
}

/** Parse one persisted value into a supported appearance preference. */
export function parseColorThemePreference(
  value: JsonValue | undefined,
): ColorThemePreference | null {
  if (value === 'system') return value;
  return parseColorTheme(value);
}

/** Read the saved preference, following the operating system by default. */
export function readInitialColorThemePreference(): ColorThemePreference {
  return (
    parseColorThemePreference(
      window.localStorage.getItem(colorThemeStorageKey),
    ) ?? 'system'
  );
}

/** Resolve a saved preference to the appearance currently shown. */
export function resolveColorTheme(
  preference: ColorThemePreference,
): ColorTheme {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Apply an appearance to the renderer document. */
export function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Save an appearance preference for the next launch. */
export function storeColorTheme(preference: ColorThemePreference): void {
  window.localStorage.setItem(colorThemeStorageKey, preference);
}

/** Parse a browser color input value into the persisted accent format. */
export function parseAccentColor(value: string | null): string | null {
  return value !== null && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

/** Read the saved custom accent, if one exists. */
export function readInitialAccentColor(): string | null {
  return parseAccentColor(window.localStorage.getItem(accentColorStorageKey));
}

type RgbColor = readonly [red: number, green: number, blue: number];

function parseHexColor(color: string): RgbColor {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function relativeLuminance(color: RgbColor): number {
  const linearize = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linearize(color[0]) +
    0.7152 * linearize(color[1]) +
    0.0722 * linearize(color[2])
  );
}

function contrastRatio(first: RgbColor, second: RgbColor): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function formatHexColor(color: RgbColor): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function ensureContrast(
  color: RgbColor,
  foreground: RgbColor,
  target: RgbColor,
  minimumRatio: number,
): string {
  for (let amount = 0; amount <= 1; amount += 0.02) {
    const mixed: RgbColor = [
      Math.round(color[0] + (target[0] - color[0]) * amount),
      Math.round(color[1] + (target[1] - color[1]) * amount),
      Math.round(color[2] + (target[2] - color[2]) * amount),
    ];
    if (contrastRatio(mixed, foreground) >= minimumRatio) {
      return formatHexColor(mixed);
    }
  }
  return formatHexColor(target);
}

/** Apply or remove the custom semantic accent tokens. */
export function applyAccentColor(color: string | null): void {
  const root = document.documentElement;
  if (color === null) {
    root.style.removeProperty('--custom-accent');
    root.style.removeProperty('--custom-primary-dark');
    root.style.removeProperty('--custom-primary-light');
    delete root.dataset.customAccent;
    return;
  }

  const rgb = parseHexColor(color);
  root.style.setProperty('--custom-accent', color);
  root.style.setProperty(
    '--custom-primary-light',
    ensureContrast(rgb, [255, 255, 255], [0, 0, 0], 4.5),
  );
  root.style.setProperty(
    '--custom-primary-dark',
    ensureContrast(rgb, [0, 0, 0], [255, 255, 255], 5.5),
  );
  root.dataset.customAccent = '';
}

/** Persist a custom accent, or restore Ernie's default accent. */
export function storeAccentColor(color: string | null): void {
  if (color === null) {
    window.localStorage.removeItem(accentColorStorageKey);
    return;
  }
  window.localStorage.setItem(accentColorStorageKey, color);
}
