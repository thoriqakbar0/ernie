import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { LanguageInput } from "@shikijs/core";

interface HighlightToken {
  readonly content: string;
  readonly color?: string;
  readonly fontStyle?: number;
}

type HighlightedLines = readonly (readonly HighlightToken[])[];
type LanguageLoader = () => Promise<{ readonly default: LanguageInput }>;

const MAX_HIGHLIGHT_CHARACTERS = 50_000;
const MAX_HIGHLIGHT_LINES = 1_000;
const MAX_CACHE_ENTRIES = 64;
const MAX_CACHE_CHARACTERS = 500_000;
const MAX_PENDING_HIGHLIGHTS = 16;

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  bash: "bash", c: "c", "c++": "cpp", cc: "cpp", cpp: "cpp", css: "css", elixir: "elixir", ex: "elixir", exs: "elixir",
  go: "go", html: "html", ipython: "python", java: "java", javascript: "javascript", js: "javascript", json: "json",
  jsx: "jsx", kotlin: "kotlin", kt: "kotlin", kts: "kotlin", markdown: "markdown", md: "markdown", php: "php",
  py: "python", python: "python", rb: "ruby", ruby: "ruby", rs: "rust", rust: "rust", scss: "scss", sh: "bash",
  shell: "bash", shellscript: "bash", sql: "sql", swift: "swift", toml: "toml", ts: "typescript", tsx: "tsx",
  typescript: "typescript", yaml: "yaml", yml: "yaml", zsh: "bash",
};

const LANGUAGE_LOADERS: Readonly<Record<string, LanguageLoader>> = {
  bash: () => import("@shikijs/langs/bash"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  css: () => import("@shikijs/langs/css"),
  elixir: () => import("@shikijs/langs/elixir"),
  go: () => import("@shikijs/langs/go"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  markdown: () => import("@shikijs/langs/markdown"),
  php: () => import("@shikijs/langs/php"),
  python: () => import("@shikijs/langs/python"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  scss: () => import("@shikijs/langs/scss"),
  sql: () => import("@shikijs/langs/sql"),
  swift: () => import("@shikijs/langs/swift"),
  toml: () => import("@shikijs/langs/toml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  yaml: () => import("@shikijs/langs/yaml"),
};

type Highlighter = Awaited<ReturnType<(typeof import("@shikijs/core"))["createHighlighterCore"]>>;

interface HighlightJob {
  readonly key: string;
  readonly code: string;
  readonly language: string;
  readonly consumers: Set<(lines: HighlightedLines) => void>;
  started: boolean;
}

let highlighterPromise: Promise<Highlighter> | undefined;
const languageLoads = new Map<string, Promise<void>>();
const resultCache = new Map<string, HighlightedLines>();
const jobsByKey = new Map<string, HighlightJob>();
let pendingJobs: HighlightJob[] = [];
let highlightActive = false;
let cachedCharacters = 0;

function highlighter(): Promise<Highlighter> {
  highlighterPromise ??= Promise.all([
    import("@shikijs/core"),
    import("@shikijs/engine-javascript"),
    import("@shikijs/themes/github-dark-default"),
  ]).then(([core, engine, theme]) => core.createHighlighterCore({
    themes: [theme.default],
    langs: [],
    engine: engine.createJavaScriptRegexEngine(),
  }));
  return highlighterPromise;
}

function normalizedLanguage(language: string | undefined): string | undefined {
  if (!language) return undefined;
  return LANGUAGE_ALIASES[language.trim().toLowerCase()];
}

async function ensureLanguage(language: string): Promise<void> {
  const current = languageLoads.get(language);
  if (current) return current;
  const load = (async () => {
    const instance = await highlighter();
    if (instance.getLoadedLanguages().includes(language)) return;
    const loader = LANGUAGE_LOADERS[language];
    if (!loader) return;
    const module = await loader();
    await instance.loadLanguage(module.default);
  })();
  languageLoads.set(language, load);
  try { await load; } catch (error) { languageLoads.delete(language); throw error; }
}

function rememberHighlight(key: string, lines: HighlightedLines): void {
  resultCache.set(key, lines);
  cachedCharacters += key.length;
  while (resultCache.size > MAX_CACHE_ENTRIES || cachedCharacters > MAX_CACHE_CHARACTERS) {
    const oldest = resultCache.keys().next().value;
    if (oldest === undefined) break;
    resultCache.delete(oldest);
    cachedCharacters -= oldest.length;
  }
}

function runNextHighlight(): void {
  if (highlightActive) return;
  let job = pendingJobs.shift();
  while (job && job.consumers.size === 0) {
    jobsByKey.delete(job.key);
    job = pendingJobs.shift();
  }
  if (!job) return;
  job.started = true;
  highlightActive = true;
  void (async () => {
    await ensureLanguage(job.language);
    const instance = await highlighter();
    return instance.codeToTokens(job.code, { lang: job.language, theme: "github-dark-default" }).tokens;
  })().then((lines) => {
    rememberHighlight(job.key, lines);
    for (const consumer of job.consumers) consumer(lines);
  }).catch(() => {}).finally(() => {
    jobsByKey.delete(job.key);
    highlightActive = false;
    runNextHighlight();
  });
}

function subscribeHighlight(code: string, language: string, consumer: (lines: HighlightedLines) => void): () => void {
  const key = `${language}\u0000${code}`;
  const cached = resultCache.get(key);
  if (cached) {
    let active = true;
    queueMicrotask(() => { if (active) consumer(cached); });
    return () => { active = false; };
  }

  let job = jobsByKey.get(key);
  if (!job) {
    pendingJobs = pendingJobs.filter((candidate) => candidate.started || candidate.consumers.size > 0);
    if (jobsByKey.size >= MAX_PENDING_HIGHLIGHTS + 1) return () => {};
    job = { key, code, language, consumers: new Set(), started: false };
    jobsByKey.set(key, job);
    pendingJobs.push(job);
  }
  job.consumers.add(consumer);
  runNextHighlight();
  return () => {
    job?.consumers.delete(consumer);
    if (job && !job.started && job.consumers.size === 0) jobsByKey.delete(job.key);
  };
}

function tokenStyle(token: HighlightToken): CSSProperties {
  const fontStyle = token.fontStyle ?? 0;
  return {
    ...(token.color ? { color: token.color } : {}),
    ...(fontStyle & 1 ? { fontStyle: "italic" } : {}),
    ...(fontStyle & 2 ? { fontWeight: 700 } : {}),
    ...(fontStyle & 4 ? { textDecoration: "underline" } : {}),
  };
}

/** Lazily highlights bounded code with Shiki while keeping immediate, safe plain-text fallback content. */
export function HighlightedCode({ code, language }: { readonly code: string; readonly language: string | undefined }) {
  const resolvedLanguage = normalizedLanguage(language);
  const eligible = resolvedLanguage !== undefined
    && code.length <= MAX_HIGHLIGHT_CHARACTERS
    && code.split("\n", MAX_HIGHLIGHT_LINES + 1).length <= MAX_HIGHLIGHT_LINES;
  const highlightKey = eligible && resolvedLanguage ? `${resolvedLanguage}\u0000${code}` : undefined;
  const [highlighted, setHighlighted] = useState<{ readonly key: string; readonly lines: HighlightedLines }>();

  useEffect(() => {
    setHighlighted(undefined);
    if (!eligible || resolvedLanguage === undefined || highlightKey === undefined) return;
    let unsubscribe = () => {};
    const start = () => {
      unsubscribe = subscribeHighlight(code, resolvedLanguage, (lines) => setHighlighted({ key: highlightKey, lines }));
    };
    const idle = window.requestIdleCallback(start, { timeout: 500 });
    return () => { window.cancelIdleCallback(idle); unsubscribe(); };
  }, [code, eligible, highlightKey, resolvedLanguage]);

  const lines = highlighted && highlighted.key === highlightKey ? highlighted.lines : undefined;
  if (!lines) return <code>{code}</code>;
  return <code className="shiki-highlighted">{lines.map((line, lineIndex) => <span className="shiki-line" key={lineIndex}>
    {line.map((token, tokenIndex) => <span key={tokenIndex} style={tokenStyle(token)}>{token.content}</span>)}
    {lineIndex < lines.length - 1 ? "\n" : null}
  </span>)}</code>;
}
