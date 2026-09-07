// @ts-check

/** Where packages live. One immediate child directory per package. */
const PACKAGES_ROOT = "src/packages"
const R = PACKAGES_ROOT
const PACKAGE_INTERNALS = `^${R}/[^/]+/[^/]+/`

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      comment: "App code may import package entry points, but not package internals.",
      from: { pathNot: `^${R}/` },
      name: "entrypoint-boundary-from-app",
      severity: "error",
      to: { path: PACKAGE_INTERNALS },
    },
    {
      comment: "Packages may reach other packages only through root entry points.",
      from: { path: `^${R}/([^/]+)/`, pathNot: `^${R}/[^/]+/tests/` },
      name: "entrypoint-boundary-across-packages",
      severity: "error",
      to: {
        path: PACKAGE_INTERNALS,
        pathNot: `^${R}/$1/`,
      },
    },
    {
      comment: "Tests exercise packages through entry points, including their own package.",
      from: { path: `^${R}/([^/]+)/tests/` },
      name: "tests-through-entrypoints",
      severity: "error",
      to: {
        path: PACKAGE_INTERNALS,
        pathNot: `^${R}/$1/tests/`,
      },
    },
    {
      comment: "Only tests may import files from a package tests folder.",
      from: { pathNot: `^${R}/[^/]+/tests/` },
      name: "tests-folder-is-private",
      severity: "error",
      to: { path: `^${R}/[^/]+/tests/` },
    },
    {
      comment: "Modules may not form dependency cycles.",
      from: {},
      name: "no-circular",
      severity: "error",
      to: { circular: true },
    },

    // Add project-specific package layering rules here when a real need exists.
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
    tsConfig: { fileName: "tsconfig.json" },
  },
}
