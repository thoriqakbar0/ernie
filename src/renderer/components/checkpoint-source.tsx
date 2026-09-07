import { Fragment, useEffect, useState } from "react"
import type { ThemedTokenWithVariants } from "shiki"

let highlighter: Promise<import("shiki/core").HighlighterCore> | undefined
function loadHighlighter() {
  return highlighter ??= Promise.all([
    import("shiki/core"), import("shiki/engine/javascript"),
    import("shiki/langs/json.mjs"), import("shiki/themes/github-light.mjs"),
    import("shiki/themes/github-dark.mjs"),
  ]).then(([core, engine, json, light, dark]) => core.createHighlighterCore({
    engine: engine.createJavaScriptRegexEngine(),
    langs: [json.default], themes: [light.default, dark.default],
  })).catch(error => { highlighter = undefined; throw error })
}

/** Highlight checkpoint JSON as escaped React text, with a readable loading fallback. */
export function CheckpointSource({ source }: { source: string }) {
  const [highlight, setHighlight] = useState<{ source: string; tokens: ThemedTokenWithVariants[][] }>()
  useEffect(() => {
    if (source.length > 40_000) return
    let current = true
    void loadHighlighter().then(instance => {
      const tokens = instance.codeToTokensWithThemes(source, {
        lang: "json", themes: { light: "github-light", dark: "github-dark" },
      })
      if (current) setHighlight({ source, tokens })
    }).catch(() => { /* Keep source readable when highlighting is unavailable. */ })
    return () => { current = false }
  }, [source])
  const tokens = highlight?.source === source ? highlight.tokens : undefined
  return <code>{tokens ? tokens.map((line, index) => <Fragment key={index}>{index ? "\n" : null}{line.map((token, column) => <span key={column} style={{ color: token.variants?.light?.color && token.variants?.dark?.color ? `light-dark(${token.variants.light.color}, ${token.variants.dark.color})` : undefined }}>{token.content}</span>)}</Fragment>) : source}</code>
}
