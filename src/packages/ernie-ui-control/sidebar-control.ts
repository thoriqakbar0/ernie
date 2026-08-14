import {
  isJsonBoolean,
  isJsonNumber,
  isJsonRecord,
  parseJsonValue,
} from '../json-value/index.js';

/** Narrowest supported desktop sidebar width in pixels. */
export const ernieUiSidebarMinimumWidth = 192;

/** Default desktop sidebar width in pixels. */
export const ernieUiSidebarDefaultWidth = 280;

/** Widest supported desktop sidebar width in pixels. */
export const ernieUiSidebarMaximumWidth = 384;

/** One parsed renderer request that changes only sidebar presentation. */
export type ErnieUiSidebarRequest =
  | Readonly<{ open: boolean; type: 'set-sidebar-open' }>
  | Readonly<{ type: 'set-sidebar-width'; width: number }>;

/** Parse one untrusted value into a supported sidebar presentation request. */
export function parseErnieUiSidebarRequest(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This function owns the renderer IPC boundary and returns the parsed request.
  value: unknown,
): ErnieUiSidebarRequest | null {
  const parsed = parseJsonValue(value);
  if (!isJsonRecord(parsed) || Object.keys(parsed).length !== 2) return null;

  if (
    parsed.type === 'set-sidebar-open' &&
    isJsonBoolean(parsed.open)
  ) {
    return { open: parsed.open, type: 'set-sidebar-open' };
  }
  if (
    parsed.type === 'set-sidebar-width' &&
    isJsonNumber(parsed.width) &&
    Number.isInteger(parsed.width) &&
    parsed.width >= ernieUiSidebarMinimumWidth &&
    parsed.width <= ernieUiSidebarMaximumWidth
  ) {
    return { type: 'set-sidebar-width', width: parsed.width };
  }
  return null;
}
