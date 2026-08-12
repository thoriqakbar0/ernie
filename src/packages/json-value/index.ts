import { Predicate } from 'effect';

/** A value that can cross Ernie's JSON and Electron IPC boundaries. */
export type JsonValue =
  | null
  | undefined
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
export function isJsonRecord(value: JsonValue): value is JsonRecord {
  return Predicate.isObject(value);
}

/** Narrow one serialized boundary value to text. */
export function isJsonString(value: JsonValue): value is string {
  return Predicate.isString(value);
}

/** Narrow one serialized boundary value to a finite or non-finite number. */
export function isJsonNumber(value: JsonValue): value is number {
  return Predicate.isNumber(value);
}

/** Narrow one serialized boundary value to a boolean. */
export function isJsonBoolean(value: JsonValue): value is boolean {
  return Predicate.isBoolean(value);
}

/** Parse one external value into Ernie's serializable boundary contract. */
export function parseJsonValue(cause: unknown): JsonValue | null {
  if (
    cause === null ||
    cause === undefined ||
    Predicate.isBoolean(cause) ||
    Predicate.isNumber(cause) ||
    Predicate.isString(cause)
  ) {
    return cause;
  }
  if (Array.isArray(cause)) {
    const values: JsonValue[] = [];
    for (const item of cause) {
      const value = parseJsonValue(item);
      if (value === null && item !== null) return null;
      values.push(value);
    }
    return values;
  }
  if (!Predicate.isObject(cause)) return null;

  const record: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(cause)) {
    const value = parseJsonValue(item);
    if (value === null && item !== null) return null;
    record[key] = value;
  }
  return record;
}
