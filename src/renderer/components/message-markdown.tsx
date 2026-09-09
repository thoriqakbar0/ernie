import type { Components } from "react-markdown"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

const plugins = [remarkGfm]
const styles = stylex.create({
  body: { display: "grid", gap: 12, minWidth: 0, whiteSpace: "normal" },
  cell: {
    borderColor: theme["--rule"],
    borderStyle: "solid",
    borderWidth: 1,
    padding: "6px 10px",
    textAlign: "start",
  },
  code: {
    backgroundColor: theme["--surface-muted"],
    borderRadius: 4,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: ".875em",
    padding: "2px 4px",
  },
  heading: { fontSize: "1.15em", fontWeight: 650, lineHeight: 1.3 },
  link: { color: theme["--focus"], textDecorationLine: "underline", textUnderlineOffset: 3 },
  list: { listStyleType: "disc", paddingInlineStart: 24 },
  ordered: { listStyleType: "decimal", paddingInlineStart: 24 },
  pre: {
    backgroundColor: theme["--surface-muted"],
    borderRadius: 10,
    maxWidth: "100%",
    minWidth: 0,
    overflowX: "auto",
    padding: 14,
    whiteSpace: "pre",
  },
  quote: {
    borderColor: theme["--rule"],
    borderInlineStart: "3px solid",
    color: theme["--muted"],
    paddingInlineStart: 14,
  },
  table: { borderCollapse: "collapse", display: "block", overflowX: "auto" },
})
const components: Components = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...stylex.props(styles.link)}>
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote {...stylex.props(styles.quote)}>{children}</blockquote>,
  code: ({ children }) => <code {...stylex.props(styles.code)}>{children}</code>,
  h1: ({ children }) => <h2 {...stylex.props(styles.heading)}>{children}</h2>,
  h2: ({ children }) => <h3 {...stylex.props(styles.heading)}>{children}</h3>,
  h3: ({ children }) => <h4 {...stylex.props(styles.heading)}>{children}</h4>,
  img: ({ alt }) => <span>{alt ? `[Image: ${alt}]` : "[Image]"}</span>,
  ol: ({ children, start }) => (
    <ol start={start} {...stylex.props(styles.ordered)}>
      {children}
    </ol>
  ),
  pre: ({ children }) => <pre {...stylex.props(styles.pre)}>{children}</pre>,
  table: ({ children }) => <table {...stylex.props(styles.table)}>{children}</table>,
  td: ({ children }) => <td {...stylex.props(styles.cell)}>{children}</td>,
  th: ({ children }) => <th {...stylex.props(styles.cell)}>{children}</th>,
  ul: ({ children }) => <ul {...stylex.props(styles.list)}>{children}</ul>,
}

/** Render source as markdown nodes; embedded HTML never becomes executable markup. */
export const MessageMarkdown = ({ content }: { content: string }) => (
  <div {...stylex.props(styles.body)}>
    <Markdown skipHtml remarkPlugins={plugins} components={components}>
      {content}
    </Markdown>
  </div>
)
