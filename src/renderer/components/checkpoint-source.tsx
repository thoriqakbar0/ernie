import * as stylex from "@stylexjs/stylex"
import { useEffect, useState } from "react"
import type { ThemedToken } from "shiki"
import type { HighlighterCore } from "shiki/core"

let highlighter: Promise<HighlighterCore> | undefined
const loadHighlighter = () => {
  highlighter ??= (async () => {
    try {
      const [core, engine, json, javascript, shellsession] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/shellsession.mjs"),
      ])
      return await core.createHighlighterCore({
        engine: engine.createJavaScriptRegexEngine(),
        langs: [json.default, javascript.default, shellsession.default],
        themes: [core.createCssVariablesTheme()],
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

/** Highlight source as escaped text using the current appearance tokens. */
export const CheckpointSource = ({
  source,
  language = "json",
}: {
  source: string
  language?: "json" | "javascript" | "shellsession"
}) => {
  const [highlight, setHighlight] = useState<{
    source: string
    language: string
    tokens: ThemedToken[][]
  }>()
  useEffect(() => {
    if (source.length > 40_000) {
      return
    }
    let current = true
    const highlightSource = async () => {
      try {
        const instance = await loadHighlighter()
        const { tokens } = instance.codeToTokens(source, {
          lang: language,
          theme: "css-variables",
        })
        if (current) {
          setHighlight({ source, language, tokens })
        }
      } catch {
        /* Keep source readable when highlighting is unavailable. */
      }
    }
    void highlightSource()
    return () => {
      current = false
    }
  }, [source, language])
  const tokens =
    highlight?.source === source && highlight.language === language ? highlight.tokens : undefined
  return (
    <code>
      {tokens
        ? tokens.flatMap((line, index) => [
            index ? "\n" : null,
            ...line.map((token) => (
              <span key={token.offset} {...stylex.props(styles.token(token.color ?? "inherit"))}>
                {token.content}
              </span>
            )),
          ])
        : source}
    </code>
  )
}
