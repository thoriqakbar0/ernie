import { Fragment, memo, useEffect, useState } from "react"
import type { ThemedToken } from "shiki"

const maximumHighlightedLength = 40_000
const cache = new Map<string, ThemedToken[][]>()
let highlighter: Promise<import("shiki/core").HighlighterCore> | undefined
function loadHighlighter() {
  return highlighter ??= Promise.all([
    import("shiki/core"), import("shiki/engine/javascript"),
    import("shiki/langs/python.mjs"), import("shiki/themes/github-light.mjs"),
  ]).then(([core, engine, python, theme]) => core.createHighlighterCore({
    engine: engine.createJavaScriptRegexEngine(), langs: [python.default], themes: [theme.default],
  })).catch(error => { highlighter = undefined; throw error })
}
/** A single lazy Python grammar; cached tokens remain text nodes, never source HTML. */
export const PythonSource = memo(function PythonSource({ source }: { source: string }) {
  const [highlight, setHighlight] = useState<{ source: string; tokens: ThemedToken[][] }>()
  useEffect(() => {
    if (source.length > maximumHighlightedLength) return
    let current = true
    const cached = cache.get(source)
    if (cached) { setHighlight({ source, tokens: cached }); return }
    void loadHighlighter().then(instance => {
      if (!current) return
      const tokens = instance.codeToTokens(source, { lang: "python", theme: "github-light" }).tokens
      cache.set(source, tokens)
      if (cache.size > 32) cache.delete(cache.keys().next().value!)
      setHighlight({ source, tokens })
    }).catch(() => { /* Preserve readable source if the grammar cannot load. */ })
    return () => { current = false }
  }, [source])
  const tokens = cache.get(source) ?? (highlight?.source === source ? highlight.tokens : undefined)
  return <code>{tokens ? tokens.map((line, index) => <Fragment key={index}>{index ? "\n" : null}{line.map((token, column) => <span key={column} style={{ color: token.color }}>{token.content}</span>)}</Fragment>) : source}</code>
})
