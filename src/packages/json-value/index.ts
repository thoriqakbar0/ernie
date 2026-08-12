import { Predicate } from 'effect';

/** A value that can cross Ernie's JSON and Electron IPC boundaries. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonRecord;

/** A keyed value that can cross Ernie's JSON and Electron IPC boundaries. */
export interface JsonRecord {
  readonly [key: string]: JsonValue;
}

/** Narrow one serialized boundary value to a plain keyed record. */
export function isJsonRecord(
  value: JsonValue | undefined,
): value is JsonRecord {
  return Predicate.isRecord(value);
}

/** Narrow one serialized boundary value to text. */
export function isJsonString(
  value: JsonValue | undefined,
): value is string {
  return Predicate.isString(value);
}

/** Narrow one serialized boundary value to a finite number. */
export function isJsonNumber(
  value: JsonValue | undefined,
): value is number {
  return Predicate.isNumber(value) && Number.isFinite(value);
}

/** Narrow one serialized boundary value to a boolean. */
export function isJsonBoolean(
  value: JsonValue | undefined,
): value is boolean {
  return Predicate.isBoolean(value);
}

/** Parse one external value into Ernie's serializable boundary contract. */
export function parseJsonValue(cause: unknown): JsonValue | undefined {
  if (
    cause === null ||
    Predicate.isBoolean(cause) ||
    Predicate.isString(cause)
  ) {
    return cause;
  }
  if (Predicate.isNumber(cause)) {
    return Number.isFinite(cause) ? cause : undefined;
  }
  if (Array.isArray(cause)) {
    const values: JsonValue[] = [];
    for (const item of cause) {
      const value = parseJsonValue(item);
      if (value === undefined) return undefined;
      values.push(value);
    }
    return values;
  }
  if (!Predicate.isRecord(cause)) return undefined;

  const record: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(cause)) {
    const value = parseJsonValue(item);
    if (value === undefined) return undefined;
    record[key] = value;
  }
  return record;
}
