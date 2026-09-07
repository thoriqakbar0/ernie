import { defineConfig } from "oxfmt"
import ultracite from "ultracite/oxfmt"

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...ultracite.ignorePatterns, "**/.zenbu", "**/.build", "repos"],
  // Preserve Ernie's source conventions and side-effect import ordering.
  printWidth: 100,
  semi: false,
  sortImports: false,
  sortPackageJson: false,
  sortTailwindcss: false,
  trailingComma: "all",
})
