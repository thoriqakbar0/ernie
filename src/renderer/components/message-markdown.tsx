import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

const plugins = [remarkGfm]
const styles = stylex.create({
  body: { display: "grid", gap: 12, minWidth: 0, whiteSpace: "normal" },
  heading: { fontSize: "1.15em", fontWeight: 650, lineHeight: 1.3 },
  list: { paddingInlineStart: 24, listStyleType: "disc" },
  ordered: { paddingInlineStart: 24, listStyleType: "decimal" },
  link: { color: theme["--focus"], textDecoration: "underline", textUnderlineOffset: 3 },
  code: { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: ".875em", backgroundColor: theme["--surface-muted"], borderRadius: 4, padding: "2px 4px" },
  pre: { minWidth: 0, maxWidth: "100%", overflowX: "auto", whiteSpace: "pre", padding: 14, borderRadius: 10, backgroundColor: theme["--surface-muted"] },
  quote: { borderInlineStart: "3px solid", borderColor: theme["--rule"], paddingInlineStart: 14, color: theme["--muted"] },
  table: { display: "block", overflowX: "auto", borderCollapse: "collapse" },
  cell: { padding: "6px 10px", border: "1px solid", borderColor: theme["--rule"], textAlign: "start" },
})
/** Render source as markdown nodes; embedded HTML never becomes executable markup. */
export function MessageMarkdown({ content }: { content: string }) {
  return <div {...stylex.props(styles.body)}><Markdown skipHtml remarkPlugins={plugins} components={{
    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" {...stylex.props(styles.link)}>{children}</a>,
    img: ({ alt }) => <span>{alt ? `[Image: ${alt}]` : "[Image]"}</span>,
    h1: ({ children }) => <h2 {...stylex.props(styles.heading)}>{children}</h2>,
    h2: ({ children }) => <h3 {...stylex.props(styles.heading)}>{children}</h3>,
    h3: ({ children }) => <h4 {...stylex.props(styles.heading)}>{children}</h4>,
    ul: ({ children }) => <ul {...stylex.props(styles.list)}>{children}</ul>,
    ol: ({ children, start }) => <ol start={start} {...stylex.props(styles.ordered)}>{children}</ol>,
    code: ({ children }) => <code {...stylex.props(styles.code)}>{children}</code>,
    pre: ({ children }) => <pre {...stylex.props(styles.pre)}>{children}</pre>,
    blockquote: ({ children }) => <blockquote {...stylex.props(styles.quote)}>{children}</blockquote>,
    table: ({ children }) => <table {...stylex.props(styles.table)}>{children}</table>,
    th: ({ children }) => <th {...stylex.props(styles.cell)}>{children}</th>,
    td: ({ children }) => <td {...stylex.props(styles.cell)}>{children}</td>,
  }}>{content}</Markdown></div>
}
