import { useId } from "react";

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  bash: "Shell", c: "C", cc: "C++", cpp: "C++", css: "CSS", ex: "Elixir", exs: "Elixir",
  go: "Go", h: "C", hpp: "C++", html: "HTML", java: "Java", js: "JavaScript", json: "JSON",
  jsx: "JSX", kt: "Kotlin", kts: "Kotlin", md: "Markdown", php: "PHP", py: "Python", rb: "Ruby",
  rs: "Rust", scss: "SCSS", sh: "Shell", sql: "SQL", swift: "Swift", toml: "TOML", ts: "TypeScript",
  tsx: "TSX", yaml: "YAML", yml: "YAML", zsh: "Shell",
};

export interface NamedFileOutput {
  readonly prelude: string;
  readonly files: readonly {
    readonly name: string;
    readonly language: string;
    readonly content: string;
  }[];
}

const FILE_HEADER = /^\s*((?:[.@+\w-]+\/)*[.@+\w-]+\.([A-Za-z0-9]+))\s*$/u;

/** Recognizes deliberate, blank-line-separated filename headings in execution output. */
export function parseNamedFileOutput(output: string): NamedFileOutput | null {
  const lines = output.split("\n");
  const headers = lines.flatMap((line, index) => {
    if (index > 0 && lines[index - 1]?.trim() !== "") return [];
    const match = FILE_HEADER.exec(line);
    const extension = match?.[2]?.toLowerCase();
    if (!match?.[1] || !extension || LANGUAGE_BY_EXTENSION[extension] === undefined) return [];
    return [{ index, name: match[1], language: LANGUAGE_BY_EXTENSION[extension] }];
  });
  if (headers.length < 2) return null;

  const files = headers.flatMap((header, index) => {
    const nextIndex = headers[index + 1]?.index ?? lines.length;
    const contentLines = lines.slice(header.index + 1, nextIndex);
    while (contentLines[0] === "") contentLines.shift();
    while (contentLines.at(-1) === "") contentLines.pop();
    const content = contentLines.join("\n");
    return content === "" ? [] : [{ name: header.name, language: header.language, content }];
  });
  if (files.length < 2) return null;

  return { prelude: lines.slice(0, headers[0]?.index ?? 0).join("\n").trim(), files };
}

/** Presents structured file excerpts when recognizable and preserves a truthful plain-text fallback. */
export function ExecutionOutput({ detail, language }: { readonly detail: string; readonly language: string }) {
  const labelId = useId();
  const namedFiles = parseNamedFileOutput(detail);
  return <section className="ipython-execution-detail" aria-label={`${language} output`}>
    {namedFiles === null
      ? <pre tabIndex={0}>{detail}</pre>
      : <div className="execution-file-output">
        {namedFiles.prelude && <pre className="execution-output-preamble" tabIndex={0}>{namedFiles.prelude}</pre>}
        {namedFiles.files.map((file, index) => {
          const fileLabelId = `${labelId}-${index}`;
          return <section className="execution-file" aria-labelledby={fileLabelId} key={`${file.name}-${index}`}>
            <header><strong id={fileLabelId}>{file.name}</strong><span>{file.language}</span></header>
            <pre tabIndex={0}><code>{file.content}</code></pre>
          </section>;
        })}
      </div>}
  </section>;
}
