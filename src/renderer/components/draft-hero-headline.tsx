import { getWorkspaceName } from "./workspace-name"

export function DraftHeroHeadline({ cwd }: Readonly<{ cwd: string }>) {
  const workspaceName = getWorkspaceName(cwd)
  return (
    <div className="draft-heading">
      <p className="draft-heading__context">Ready in <span title={cwd}>{workspaceName}</span></p>
      <h2 aria-label={`What should we build in ${cwd}?`}>What should we build in <span title={cwd}>{workspaceName}</span>?</h2>
      <p>Describe the outcome, the constraints, and how Prime Agent should prove the work.</p>
    </div>
  )
}
