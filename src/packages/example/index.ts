import { createGreeting } from "./lib/impl"

/** Returns Ernie's greeting for a named person. */
export function greet(name: string): string {
  return createGreeting(name.trim())
}
