import { readdir, readFile } from "node:fs/promises"
import nodePath from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const sourceRoots = ["src", "cypress"]
const sourceExtensions = new Set([".css", ".html", ".js", ".jsx", ".mjs", ".ts", ".tsx"])
const allowedUtilities = new Set(["hidden", "none"])
const violations: string[] = []

const hiddenOutline = (value: ts.Expression): boolean => {
  if (value.kind === ts.SyntaxKind.NullKeyword) {
    return true
  }
  if (ts.isStringLiteral(value)) {
    return value.text === "none"
  }
  return (
    ts.isObjectLiteralExpression(value) &&
    value.properties.every(
      (property) => ts.isPropertyAssignment(property) && hiddenOutline(property.initializer),
    )
  )
}

const addViolation = (path: string, source: string, offset: number, value: string): void => {
  const line = source.slice(0, offset).split("\n").length
  violations.push(`${nodePath.relative(projectRoot, path)}:${line} ${value}`)
}

const inspectFile = async (path: string): Promise<void> => {
  const source = await readFile(path, "utf-8")
  if (/\.[cm]?[jt]sx?$/u.test(path)) {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    const inspect = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node)) {
        const property =
          ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : ""
        if (
          /^outline(?:Color|Offset|Style|Width)?$/u.test(property) &&
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
  if (nodePath.extname(path) === ".css" || nodePath.extname(path) === ".html") {
    const declarations =
      /\b(?<property>outline(?:-(?:color|offset|style|width))?)\s*:\s*(?<value>[^;}\n]+)/gu
    for (const match of source.matchAll(declarations)) {
      const [, property, rawValue] = match
      const value = rawValue.trim()
      if (property === "outline" && /^(?:["']?none["']?)$/u.test(value)) {
        continue
      }
      addViolation(path, source, match.index, `${property}: ${value}`)
    }
  }

  if (nodePath.extname(path) !== ".css") {
    const utilities = /\boutline-(?<utility>[a-z0-9_./[\]-]+)/giu
    for (const match of source.matchAll(utilities)) {
      if (allowedUtilities.has(match[1])) {
        continue
      }
      addViolation(path, source, match.index, match[0])
    }
  }
}

const inspectDirectory = async (directory: string): Promise<void> => {
  const entries = await readdir(directory, { withFileTypes: true })
  let inspection = Promise.resolve()
  for (const entry of entries) {
    if (["node_modules", ".zenbu", ".git", "dist"].includes(entry.name)) {
      continue
    }
    const path = nodePath.join(directory, entry.name)
    const previous = inspection
    inspection = (async () => {
      await previous
      if (entry.isDirectory()) {
        await inspectDirectory(path)
      } else if (entry.isFile() && sourceExtensions.has(nodePath.extname(entry.name))) {
        await inspectFile(path)
      }
    })()
  }
  await inspection
}

let inspection = Promise.resolve()
for (const sourceRoot of sourceRoots) {
  const previous = inspection
  inspection = (async () => {
    await previous
    await inspectDirectory(nodePath.join(projectRoot, sourceRoot))
  })()
}
await inspection

if (violations.length > 0) {
  console.error("visible css outlines are forbidden; use a border or box-shadow instead")
  for (const violation of violations) {
    console.error(`  ${violation}`)
  }
  process.exit(1)
}
