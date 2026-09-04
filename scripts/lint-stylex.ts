import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = fileURLToPath(new URL("../", import.meta.url))
const violations: string[] = []
const legacyPackages =
  /^(?:@tailwindcss\/|tailwindcss$|tw-animate-css$|tailwind-merge$|class-variance-authority$|clsx$)/
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

await inspectDirectory(join(root, "src/renderer"))
const manifest: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
if (typeof manifest !== "object" || manifest === null) throw new Error("Invalid package manifest")
const dependencies = "dependencies" in manifest ? manifest.dependencies : undefined
const devDependencies = "devDependencies" in manifest ? manifest.devDependencies : undefined
const dependencyNames = [dependencies, devDependencies].flatMap((value) =>
  typeof value === "object" && value !== null ? Object.keys(value) : [],
)
for (const name of dependencyNames) {
  if (legacyPackages.test(name)) violations.push(`package.json: legacy styling dependency ${name}`)
}
if (violations.length) {
  console.error(violations.join("\n"))
  process.exitCode = 1
} else {
  console.log("StyleX boundary: no legacy component styles or unsupported shorthands")
}

async function inspectDirectory(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".zenbu", ".git", "dist"].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await inspectDirectory(path)
    else if (entry.isFile()) await inspectFile(path)
  }
}

async function inspectFile(path: string): Promise<void> {
  const extension = extname(path)
  if (![".ts", ".tsx", ".css"].includes(extension)) return
  const source = await readFile(path, "utf8")
  const name = relative(root, path)
  if (extension === ".css") {
    if (name !== "src/renderer/main.css") violations.push(`${name}: component CSS must use StyleX`)
    if (/\.[a-zA-Z][\w-]*\s*[{,:]|@(?:theme|source|tailwind)\b/.test(source)) {
      violations.push(
        `${name}: bootstrap CSS must not contain component selectors or Tailwind directives`,
      )
    }
    return
  }
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
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
          if (unsupportedShorthands.has(key))
            report(child, `expand ${key}; StyleX does not emit this shorthand`)
        }
        ts.forEachChild(child, inspectStyle)
      }
      node.arguments.forEach((argument) => inspectStyle(argument))
    }
    ts.forEachChild(node, inspect)
  }
  inspect(file)
}
