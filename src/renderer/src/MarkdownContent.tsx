import { createElement, Fragment } from "react";
import type { ReactNode } from "react";

interface MarkdownListItem {
  readonly content: string;
  readonly checked?: boolean;
}

/** Semantic block representation produced by Ernie's safe, streaming-tolerant Markdown parser. */
export type MarkdownBlock =
  | { readonly kind: "blockquote"; readonly blocks: readonly MarkdownBlock[] }
  | { readonly kind: "code"; readonly code: string; readonly language?: string }
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly content: string }
  | { readonly kind: "list"; readonly ordered: boolean; readonly start: number; readonly items: readonly MarkdownListItem[] }
  | { readonly kind: "paragraph"; readonly content: string }
  | { readonly kind: "table"; readonly alignments: readonly ("start" | "center" | "end")[]; readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly kind: "thematic-break" };

interface InlineNode {
  readonly kind: "break" | "code" | "emphasis" | "link" | "strong" | "text";
  readonly text?: string;
  readonly href?: string;
  readonly children?: readonly InlineNode[];
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]{0,32})\s*$/u;
const HEADING = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u;
const ORDERED_ITEM = /^ {0,3}(\d{1,9})[.)]\s+(.+)$/u;
const UNORDERED_ITEM = /^ {0,3}[-+*]\s+(.+)$/u;
const QUOTE = /^ {0,3}>\s?(.*)$/u;
const THEMATIC_BREAK = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u;
const TABLE_DIVIDER_CELL = /^:?-{3,}:?$/u;

function splitTableRow(line: string): readonly string[] {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  let inCode = false;
  for (const character of trimmed) {
    if (escaped) { cell += character; escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (character === "`") { inCode = !inCode; cell += character; continue; }
    if (character === "|" && !inCode) { cells.push(cell.trim()); cell = ""; continue; }
    cell += character;
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells;
}

function tableAt(lines: readonly string[], index: number): { readonly header: readonly string[]; readonly alignments: readonly ("start" | "center" | "end")[] } | undefined {
  const heading = lines[index];
  const divider = lines[index + 1];
  if (!heading?.includes("|") || !divider?.includes("|")) return undefined;
  const header = splitTableRow(heading);
  const dividerCells = splitTableRow(divider);
  if (header.length < 2 || dividerCells.length !== header.length || !dividerCells.every((cell) => TABLE_DIVIDER_CELL.test(cell))) return undefined;
  return {
    header,
    alignments: dividerCells.map((cell) => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "end" : "start"),
  };
}

function beginsBlock(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  return line.trim() === "" || FENCE.test(line) || HEADING.test(line) || THEMATIC_BREAK.test(line)
    || ORDERED_ITEM.test(line) || UNORDERED_ITEM.test(line) || QUOTE.test(line) || tableAt(lines, index) !== undefined;
}

function normalizeParagraphLines(lines: readonly string[]): string {
  return lines.map((line) => line.endsWith("  ") ? `${line.trimEnd()}\n` : line.trim()).join(" ").replace(/\n /gu, "\n");
}

function taskItem(content: string): MarkdownListItem {
  const match = /^\[([ xX])\]\s+(.+)$/u.exec(content);
  return match?.[2] ? { content: match[2], checked: match[1]?.toLowerCase() === "x" } : { content };
}

/** Parses a safe CommonMark-inspired subset without evaluating HTML or loading remote resources. */
export function parseMarkdown(source: string): readonly MarkdownBlock[] {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") { index += 1; continue; }

    const fence = FENCE.exec(line);
    if (fence?.[1]) {
      const marker = fence[1];
      const language = fence[2] || undefined;
      const code: string[] = [];
      index += 1;
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const closing = /^ {0,3}(`{3,}|~{3,})\s*$/u.exec(candidate)?.[1];
        if (closing !== undefined && closing[0] === marker[0] && closing.length >= marker.length) { index += 1; break; }
        code.push(candidate);
        index += 1;
      }
      blocks.push({ kind: "code", code: code.join("\n"), ...(language ? { language } : {}) });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading?.[1] && heading[2]) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6, content: heading[2] });
      index += 1;
      continue;
    }
    if (THEMATIC_BREAK.test(line)) { blocks.push({ kind: "thematic-break" }); index += 1; continue; }

    const table = tableAt(lines, index);
    if (table) {
      const rows: (readonly string[])[] = [];
      index += 2;
      while (index < lines.length && (lines[index]?.includes("|") ?? false) && lines[index]?.trim() !== "") {
        const row = splitTableRow(lines[index] ?? "");
        rows.push(table.header.map((_, column) => row[column] ?? ""));
        index += 1;
      }
      blocks.push({ kind: "table", header: table.header, alignments: table.alignments, rows });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const match = QUOTE.exec(lines[index] ?? "");
        if (!match) break;
        quoted.push(match[1] ?? "");
        index += 1;
      }
      blocks.push({ kind: "blockquote", blocks: parseMarkdown(quoted.join("\n")) });
      continue;
    }

    const ordered = ORDERED_ITEM.exec(line);
    const unordered = UNORDERED_ITEM.exec(line);
    if (ordered || unordered) {
      const isOrdered = ordered !== null;
      const start = ordered?.[1] ? Number.parseInt(ordered[1], 10) : 1;
      const items: MarkdownListItem[] = [];
      while (index < lines.length) {
        const match = isOrdered ? ORDERED_ITEM.exec(lines[index] ?? "") : UNORDERED_ITEM.exec(lines[index] ?? "");
        const content = match?.[2] ?? match?.[1];
        if (!content) break;
        items.push(taskItem(content));
        index += 1;
      }
      blocks.push({ kind: "list", ordered: isOrdered, start, items });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && !beginsBlock(lines, index)) { paragraph.push(lines[index] ?? ""); index += 1; }
    blocks.push({ kind: "paragraph", content: normalizeParagraphLines(paragraph) });
  }
  return blocks;
}

function safeLinkTarget(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:" ? url.toString() : undefined;
  } catch { return undefined; }
}

function parseInline(source: string): readonly InlineNode[] {
  const nodes: InlineNode[] = [];
  const pushText = (text: string) => {
    const last = nodes.at(-1);
    if (last?.kind === "text") nodes[nodes.length - 1] = { kind: "text", text: `${last.text ?? ""}${text}` };
    else nodes.push({ kind: "text", text });
  };
  let index = 0;
  while (index < source.length) {
    if (source[index] === "\\" && index + 1 < source.length && /[\\`*_[\]()>#+.!-]/u.test(source[index + 1] ?? "")) {
      pushText(source[index + 1] ?? ""); index += 2; continue;
    }
    if (source[index] === "\n") { nodes.push({ kind: "break" }); index += 1; continue; }
    if (source[index] === "`") {
      const end = source.indexOf("`", index + 1);
      if (end > index + 1) { nodes.push({ kind: "code", text: source.slice(index + 1, end) }); index = end + 1; continue; }
    }
    const strongMarker = source.slice(index, index + 2);
    if (strongMarker === "**" || strongMarker === "__") {
      const end = source.indexOf(strongMarker, index + 2);
      if (end > index + 2) { nodes.push({ kind: "strong", children: parseInline(source.slice(index + 2, end)) }); index = end + 2; continue; }
    }
    const marker = source[index];
    if (marker === "*" || marker === "_") {
      const end = source.indexOf(marker, index + 1);
      if (end > index + 1) { nodes.push({ kind: "emphasis", children: parseInline(source.slice(index + 1, end)) }); index = end + 1; continue; }
    }
    if (source[index] === "[") {
      const labelEnd = source.indexOf("](", index + 1);
      const targetEnd = labelEnd < 0 ? -1 : source.indexOf(")", labelEnd + 2);
      if (labelEnd > index + 1 && targetEnd > labelEnd + 2) {
        const href = safeLinkTarget(source.slice(labelEnd + 2, targetEnd).trim());
        if (href) { nodes.push({ kind: "link", href, children: parseInline(source.slice(index + 1, labelEnd)) }); index = targetEnd + 1; continue; }
      }
    }
    if (source[index] === "<") {
      const end = source.indexOf(">", index + 1);
      const href = end > index ? safeLinkTarget(source.slice(index + 1, end)) : undefined;
      if (href) { nodes.push({ kind: "link", href, children: [{ kind: "text", text: source.slice(index + 1, end) }] }); index = end + 1; continue; }
    }
    pushText(source[index] ?? "");
    index += 1;
  }
  return nodes;
}

function renderInline(source: string, keyPrefix: string): readonly ReactNode[] {
  return parseInline(source).map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case "break": return <br key={key} />;
      case "code": return <code key={key}>{node.text}</code>;
      case "emphasis": return <em key={key}>{renderInlineNodes(node.children ?? [], key)}</em>;
      case "link": return <a key={key} href={node.href} target="_blank" rel="noreferrer">{renderInlineNodes(node.children ?? [], key)}</a>;
      case "strong": return <strong key={key}>{renderInlineNodes(node.children ?? [], key)}</strong>;
      case "text": return <Fragment key={key}>{node.text}</Fragment>;
    }
  });
}

function renderInlineNodes(nodes: readonly InlineNode[], keyPrefix: string): readonly ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-child-${index}`;
    switch (node.kind) {
      case "break": return <br key={key} />;
      case "code": return <code key={key}>{node.text}</code>;
      case "emphasis": return <em key={key}>{renderInlineNodes(node.children ?? [], key)}</em>;
      case "link": return <a key={key} href={node.href} target="_blank" rel="noreferrer">{renderInlineNodes(node.children ?? [], key)}</a>;
      case "strong": return <strong key={key}>{renderInlineNodes(node.children ?? [], key)}</strong>;
      case "text": return <Fragment key={key}>{node.text}</Fragment>;
    }
  });
}

function languageLabel(language: string): string {
  const labels: Readonly<Record<string, string>> = { bash: "Shell", js: "JavaScript", jsx: "JSX", py: "Python", rs: "Rust", sh: "Shell", ts: "TypeScript", tsx: "TSX" };
  return labels[language.toLowerCase()] ?? language;
}

function renderBlocks(blocks: readonly MarkdownBlock[], keyPrefix: string): readonly ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (block.kind) {
      case "blockquote": return <blockquote key={key}>{renderBlocks(block.blocks, key)}</blockquote>;
      case "code": return <figure className="markdown-code" key={key}>
        {block.language && <figcaption>{languageLabel(block.language)}</figcaption>}
        <pre tabIndex={0}><code>{block.code}</code></pre>
      </figure>;
      case "heading": return createElement(`h${block.level}`, { key }, renderInline(block.content, key));
      case "list": {
        const children = block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>
          {item.checked !== undefined && <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} aria-label={item.checked ? "Completed" : "Not completed"} />}
          <span>{renderInline(item.content, `${key}-${itemIndex}`)}</span>
        </li>);
        return block.ordered ? <ol key={key} start={block.start}>{children}</ol> : <ul key={key}>{children}</ul>;
      }
      case "paragraph": return <p key={key}>{renderInline(block.content, key)}</p>;
      case "table": return <div className="markdown-table-scroll" tabIndex={0} key={key}><table>
        <thead><tr>{block.header.map((cell, cellIndex) => <th key={`${key}-h-${cellIndex}`} scope="col" style={{ textAlign: block.alignments[cellIndex] }}>{renderInline(cell, `${key}-h-${cellIndex}`)}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${key}-r-${rowIndex}-${cellIndex}`} style={{ textAlign: block.alignments[cellIndex] }}>{renderInline(cell, `${key}-r-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody>
      </table></div>;
      case "thematic-break": return <hr key={key} />;
    }
  });
}

/** Renders semantic, dependency-free Markdown while treating raw HTML and unsafe links as inert text. */
export function MarkdownContent({ source, trailing }: { readonly source: string; readonly trailing?: ReactNode }) {
  return <div className={`markdown-content ${trailing ? "streaming" : ""}`}>{renderBlocks(parseMarkdown(source), "markdown")}{trailing}</div>;
}
