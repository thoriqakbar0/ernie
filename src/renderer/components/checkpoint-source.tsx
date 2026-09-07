import * as stylex from "@stylexjs/stylex"
import { useEffect, useState } from "react"
import type { ThemedTokenWithVariants } from "shiki"
import type { HighlighterCore } from "shiki/core"

let highlighter: Promise<HighlighterCore> | undefined
const loadHighlighter = () => {
  highlighter ??= (async () => {
    try {
      const [core, engine, json, light, dark] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
        import("shiki/langs/json.mjs"),
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/github-dark.mjs"),
      ])
      return await core.createHighlighterCore({
        engine: engine.createJavaScriptRegexEngine(),
        langs: [json.default],
        themes: [light.default, dark.default],
      })
    } catch (error) {
      highlighter = undefined
      throw error
    }
  })()
  return highlighter
}

const styles = stylex.create({
  token: (color: string) => ({ color }),
})

/** Highlight checkpoint JSON as escaped React text, with a readable loading fallback. */
export const CheckpointSource = ({ source }: { source: string }) => {
  const [highlight, setHighlight] = useState<{
    source: string
    tokens: ThemedTokenWithVariants[][]
  }>()
  useEffect(() => {
    if (source.length > 40_000) {
      return
    }
    let current = true
    const highlightSource = async () => {
      try {
        const instance = await loadHighlighter()
        const tokens = instance.codeToTokensWithThemes(source, {
          lang: "json",
          themes: { dark: "github-dark", light: "github-light" },
        })
        if (current) {
          setHighlight({ source, tokens })
        }
      } catch {
        /* Keep source readable when highlighting is unavailable. */
      }
    }
    void highlightSource()
    return () => {
      current = false
    }
  }, [source])
  const tokens = highlight?.source === source ? highlight.tokens : undefined
  return (
    <code>
      {tokens
        ? tokens.flatMap((line, index) => [
            index ? "\n" : null,
            ...line.map((token) => (
              <span
                key={token.offset}
                {...stylex.props(
                  styles.token(
                    token.variants?.light?.color && token.variants?.dark?.color
                      ? `light-dark(${token.variants.light.color}, ${token.variants.dark.color})`
                      : "inherit",
                  ),
                )}
              >
                {token.content}
              </span>
            )),
          ])
        : source}
    </code>
  )
}
