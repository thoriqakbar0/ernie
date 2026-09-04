import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const sourceRoots = ["src", "cypress"]
const sourceExtensions = new Set([".css", ".html", ".js", ".jsx", ".mjs", ".ts", ".tsx"])
const allowedUtilities = new Set(["hidden", "none"])
const violations: string[] = []

for (const sourceRoot of sourceRoots) {
  await inspectDirectory(join(projectRoot, sourceRoot))
}

if (violations.length > 0) {
  console.error("visible css outlines are forbidden; use a border or box-shadow instead")
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}

async function inspectDirectory(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (["node_modules", ".zenbu", ".git", "dist"].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await inspectDirectory(path)
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      await inspectFile(path)
    }
  }
}

async function inspectFile(path: string): Promise<void> {
  const source = await readFile(path, "utf8")
  if (/\.[cm]?[jt]sx?$/.test(path)) {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    const inspect = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node)) {
        const property =
          ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : ""
        if (
          /^outline(?:Color|Offset|Style|Width)?$/.test(property) &&
          !(
            (property === "outline" || property === "outlineStyle") &&
            hiddenOutline(node.initializer)
          )
        ) {
          addViolation(path, source, node.getStart(file), node.getText(file))
        }
      }
      ts.forEachChild(node, inspect)
    }
    inspect(file)
  }
  if (extname(path) === ".css" || extname(path) === ".html") {
    const declarations = /\b(outline(?:-(?:color|offset|style|width))?)\s*:\s*([^;}\n]+)/g
    for (const match of source.matchAll(declarations)) {
      const property = match[1]
      const value = match[2].trim()
      if (property === "outline" && /^(?:["']?none["']?)$/.test(value)) continue
      addViolation(path, source, match.index, `${property}: ${value}`)
    }
  }

  if (extname(path) !== ".css") {
    const utilities = /\boutline-([a-z0-9_./[\]-]+)/gi
    for (const match of source.matchAll(utilities)) {
      if (allowedUtilities.has(match[1])) continue
      addViolation(path, source, match.index, match[0])
    }
  }
}

function hiddenOutline(value: ts.Expression): boolean {
  if (value.kind === ts.SyntaxKind.NullKeyword) return true
  if (ts.isStringLiteral(value)) return value.text === "none"
  return (
    ts.isObjectLiteralExpression(value) &&
    value.properties.every(
      (property) => ts.isPropertyAssignment(property) && hiddenOutline(property.initializer),
    )
  )
}

function addViolation(path: string, source: string, offset: number, value: string): void {
  const line = source.slice(0, offset).split("\n").length
  violations.push(`${relative(projectRoot, path)}:${line} ${value}`)
}
