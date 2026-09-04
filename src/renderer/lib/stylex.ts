import type { CSSProperties } from "react"

/** Adds compiled styles without losing a Base UI state-dependent class name. */
export function withClassName(compiled: string | undefined, className: string | undefined): string
export function withClassName<State>(
  compiled: string | undefined,
  className: string | ((state: State) => string | undefined) | undefined,
): string | ((state: State) => string)
export function withClassName<State>(
  compiled: string | undefined,
  className: string | ((state: State) => string | undefined) | undefined,
): string | ((state: State) => string) {
  const join = (extra: string | undefined) => [compiled, extra].filter(Boolean).join(" ")
  return typeof className === "function" ? (state) => join(className(state)) : join(className)
}

/** Preserves dynamic StyleX variables and caller-owned Base UI inline styles. */
export function withStyle<State>(
  compiled: CSSProperties | undefined,
  style: CSSProperties | ((state: State) => CSSProperties | undefined) | undefined,
): CSSProperties | ((state: State) => CSSProperties) {
  return typeof style === "function"
    ? (state) => ({ ...compiled, ...style(state) })
    : { ...compiled, ...style }
}
