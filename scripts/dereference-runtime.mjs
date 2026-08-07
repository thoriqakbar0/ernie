#!/usr/bin/env node
import { cpSync, lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("runtime directory argument is required");

function dereferenceTree(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      const target = realpathSync(path);
      const targetStat = lstatSync(target);
      rmSync(path, { recursive: true, force: true });
      cpSync(target, path, { recursive: targetStat.isDirectory(), dereference: true });
      if (targetStat.isDirectory()) dereferenceTree(path);
      continue;
    }
    if (stat.isDirectory()) dereferenceTree(path);
  }
}

dereferenceTree(root);
