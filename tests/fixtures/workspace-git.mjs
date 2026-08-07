#!/usr/bin/env node
const root = process.env.ERNIE_FIXTURE_ROOT;
if (!root) process.exit(2);
process.stdout.write(`worktree ${root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/feat/worktree-workspace

worktree /tmp/ernie-feature
HEAD 2222222222222222222222222222222222222222
branch refs/heads/feature/child

`);
