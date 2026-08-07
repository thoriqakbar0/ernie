#!/usr/bin/env node
const root = process.env.ERNIE_FIXTURE_ROOT;
if (!root) process.exit(2);
if (process.env.ERNIE_FIXTURE_EMPTY === "1") process.exit(0);
if (process.env.ERNIE_FIXTURE_MALFORMED_GIT === "1") {
  process.stdout.write("worktree /tmp/incomplete\0\0");
  process.exit(0);
}

const record = (...fields) => `${fields.join("\0")}\0\0`;
if (process.env.ERNIE_FIXTURE_NUL_EDGE === "1") {
  process.stdout.write([
    record("worktree /tmp/ernie feature\nline", "HEAD 4444444444444444444444444444444444444444", "branch refs/heads/feature/newline"),
    record("worktree /tmp/ernie-prunable", "HEAD 5555555555555555555555555555555555555555", "branch refs/heads/feature/stale", "prunable gitdir file points to non-existent location"),
  ].join(""));
  process.exit(0);
}

const extraWorktrees = process.env.ERNIE_FIXTURE_MANY_WORKTREES === "1"
  ? Array.from({ length: 8 }, (_, index) => record(
      `worktree /tmp/ernie-feature-${index + 1}`,
      `HEAD ${String(index + 3).repeat(40)}`,
      `branch refs/heads/feature/stress-${index + 1}`,
    )).join("")
  : "";
process.stdout.write([
  record(`worktree ${root}`, "HEAD 1111111111111111111111111111111111111111", "branch refs/heads/feat/worktree-workspace"),
  record("worktree /tmp/ernie-feature", "HEAD 2222222222222222222222222222222222222222", "branch refs/heads/feature/child"),
  extraWorktrees,
].join(""));
