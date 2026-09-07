import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = fileURLToPath(new URL("../", import.meta.url))
const legacyPackages =
  /^(?:@tailwindcss\/|tailwindcss$|tw-animate-css$|tailwind-merge$|class-variance-authority$|clsx$)/u
const unsupportedShorthands = new Set([
  "background",
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "font",
  "outline",
  "textDecoration",
])

const inspectFile = async (filePath: string): Promise<string[]> => {
  const violations: string[] = []
  const extension = path.extname(filePath)
  if (![".ts", ".tsx", ".css"].includes(extension)) {
    return violations
  }
  const source = await readFile(filePath, "utf-8")
  const name = path.relative(root, filePath)
  if (extension === ".css") {
    if (name !== "src/renderer/main.css") {
      violations.push(`${name}: component CSS must use StyleX`)
    }
    if (/\.[a-zA-Z][\w-]*\s*[{,:]|@(?:theme|source|tailwind)\b/u.test(source)) {
      violations.push(
        `${name}: bootstrap CSS must not contain component selectors or Tailwind directives`,
      )
    }
    return violations
  }
  const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
  const report = (node: ts.Node, message: string) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
    violations.push(`${name}:${line}: ${message}`)
  }
  const inspect = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ["className", "style"].includes(node.name.getText(file))) {
      report(node, "use stylex.props or the component's typed xstyle prop")
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      legacyPackages.test(node.moduleSpecifier.text)
    ) {
      report(node, "legacy styling imports are forbidden")
    }
    if (ts.isCallExpression(node) && node.expression.getText(file) === "stylex.create") {
      const inspectStyle = (child: ts.Node): void => {
        if (ts.isPropertyAssignment(child)) {
          const key =
            ts.isIdentifier(child.name) || ts.isStringLiteral(child.name) ? child.name.text : ""
          if (unsupportedShorthands.has(key)) {
            report(child, `expand ${key}; StyleX does not emit this shorthand`)
          }
        }
        ts.forEachChild(child, inspectStyle)
      }
      for (const argument of node.arguments) {
        inspectStyle(argument)
      }
    }
    ts.forEachChild(node, inspect)
  }
  inspect(file)
  return violations
}

const inspectDirectory = async (directory: string): Promise<string[]> => {
  const inspections: Promise<string[]>[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".zenbu", ".git", "dist"].includes(entry.name)) {
      continue
    }
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      inspections.push(inspectDirectory(entryPath))
    } else if (entry.isFile()) {
      inspections.push(inspectFile(entryPath))
    }
  }
  const results = await Promise.all(inspections)
  return results.flat()
}

const violations = await inspectDirectory(path.join(root, "src/renderer"))
const manifest: unknown = JSON.parse(await readFile(path.join(root, "package.json"), "utf-8"))
if (typeof manifest !== "object" || manifest === null) {
  throw new Error("Invalid package manifest")
}
const dependencies = "dependencies" in manifest ? manifest.dependencies : undefined
const devDependencies = "devDependencies" in manifest ? manifest.devDependencies : undefined
const dependencyNames = [dependencies, devDependencies].flatMap((value) =>
  typeof value === "object" && value !== null ? Object.keys(value) : [],
)
for (const name of dependencyNames) {
  if (legacyPackages.test(name)) {
    violations.push(`package.json: legacy styling dependency ${name}`)
  }
}
if (violations.length) {
  console.error(violations.join("\n"))
  process.exitCode = 1
} else {
  console.log("StyleX boundary: no legacy component styles or unsupported shorthands")
}
