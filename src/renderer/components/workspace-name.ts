export const getWorkspaceName = (cwd: string) => {
  if (/^[A-Za-z]:[\\/]?$/u.test(cwd)) {
    return cwd
  }
  const withoutTrailingSeparators = cwd.replace(/[\\/]+$/u, "")
  return withoutTrailingSeparators.split(/[\\/]/u).at(-1) || cwd
}
