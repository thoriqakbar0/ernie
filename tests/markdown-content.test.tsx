import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent, parseMarkdown } from "../src/renderer/src/markdown-content";

describe("MarkdownContent", () => {
  it("parses semantic blocks used in agent responses", () => {
    const blocks = parseMarkdown(`# Result

- **Fast** path
- [x] Safe path

| Provider | Ready |
| :--- | ---: |
| OpenAI | yes |

> Keep going.

\`\`\`ts
const ready = true;
\`\`\``);

    expect(blocks.map((block) => block.kind)).toEqual(["heading", "list", "table", "blockquote", "code"]);
    expect(blocks.at(-1)).toEqual({ kind: "code", language: "ts", code: "const ready = true;" });
  });

  it("renders formatting as semantic React markup without evaluating HTML", () => {
    const html = renderToStaticMarkup(<MarkdownContent source={'**Bold** and `code` <script>alert(1)</script> [unsafe](javascript:alert(1))'} />);

    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("href=");
  });

  it("renders safe links and preserves unfinished fenced code while streaming", () => {
    const link = renderToStaticMarkup(<MarkdownContent source="[Pierre](https://pierre.co)" />);
    expect(link).toContain('href="https://pierre.co/"');
    expect(parseMarkdown("```go\nfunc main() {")).toEqual([{ kind: "code", language: "go", code: "func main() {" }]);
  });
});
