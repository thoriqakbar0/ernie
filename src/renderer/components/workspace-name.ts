export function getWorkspaceName(cwd: string) {
  if (/^[A-Za-z]:[\\/]?$/.test(cwd)) return cwd
  const withoutTrailingSeparators = cwd.replace(/[\\/]+$/, "")
  return withoutTrailingSeparators.split(/[\\/]/).at(-1) || cwd
}
