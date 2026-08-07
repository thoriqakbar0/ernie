#!/usr/bin/env node
const root = process.env.ERNIE_FIXTURE_ROOT;
if (!root) process.exit(2);
if (process.env.ERNIE_FIXTURE_EMPTY === "1") process.exit(0);
const extraWorktrees = process.env.ERNIE_FIXTURE_MANY_WORKTREES === "1"
  ? Array.from({ length: 8 }, (_, index) => `worktree /tmp/ernie-feature-${index + 1}
HEAD ${String(index + 3).repeat(40)}
branch refs/heads/feature/stress-${index + 1}

`).join("")
  : "";
process.stdout.write(`worktree ${root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/feat/worktree-workspace

worktree /tmp/ernie-feature
HEAD 2222222222222222222222222222222222222222
branch refs/heads/feature/child

${extraWorktrees}`);
