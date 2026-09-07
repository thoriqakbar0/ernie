import * as stylex from "@stylexjs/stylex"
import { Fragment, memo, useEffect, useState } from "react"
import type { ThemedToken } from "shiki"
import type { HighlighterCore } from "shiki/core"

const maximumHighlightedLength = 40_000
interface HighlightedLine {
  offset: number
  tokens: ThemedToken[]
}
const cache = new Map<string, HighlightedLine[]>()
let highlighter: Promise<HighlighterCore> | undefined
const loadHighlighter = () =>
  (highlighter ??= (async () => {
    try {
      const [core, engine, python, theme] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
        import("shiki/langs/python.mjs"),
        import("shiki/themes/github-light.mjs"),
      ])
      return await core.createHighlighterCore({
        engine: engine.createJavaScriptRegexEngine(),
        langs: [python.default],
        themes: [theme.default],
      })
    } catch (error) {
      highlighter = undefined
      throw error
    }
  })())

const styles = stylex.create({
  token: (color: string) => ({ color }),
})

/** A single lazy Python grammar; cached tokens remain text nodes, never source HTML. */
const PythonSourceComponent = ({ source }: { source: string }) => {
  const [highlight, setHighlight] = useState<{ source: string; tokens: HighlightedLine[] }>()
  useEffect(() => {
    if (source.length > maximumHighlightedLength) {
      return
    }
    let current = true
    const highlightSource = async () => {
      try {
        const instance = await loadHighlighter()
        if (current) {
          const cached = cache.get(source)
          if (cached) {
            setHighlight({ source, tokens: cached })
            return
          }
          const result = instance.codeToTokens(source, { lang: "python", theme: "github-light" })
          let offset = 0
          const tokens = result.tokens.map((line) => {
            const highlightedLine = { offset, tokens: line }
            offset += line.reduce((length, token) => length + token.content.length, 0) + 1
            return highlightedLine
          })
          cache.set(source, tokens)
          if (cache.size > 32) {
            const oldest = cache.keys().next()
            if (!oldest.done) {
              cache.delete(oldest.value)
            }
          }
          setHighlight({ source, tokens })
        }
      } catch {
        /* Preserve readable source if the grammar cannot load. */
      }
    }
    void highlightSource()
    return () => {
      current = false
    }
  }, [source])
  const tokens = cache.get(source) ?? (highlight?.source === source ? highlight.tokens : undefined)
  return (
    <code>
      {tokens
        ? tokens.map((line) => (
            <Fragment key={line.offset}>
              {line.offset ? "\n" : null}
              {line.tokens.map((token) => (
                <span key={token.offset} {...stylex.props(styles.token(token.color ?? "inherit"))}>
                  {token.content}
                </span>
              ))}
            </Fragment>
          ))
        : source}
    </code>
  )
}

/** Memoized lazy Python source highlighting with a readable fallback. */
export const PythonSource = memo(PythonSourceComponent)
