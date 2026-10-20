// Self-test for the PreToolUse hooks: node --test .claude/hooks/hooks.test.mjs
// Guards against the runtime no longer sending `agent_type`, or a hook silently failing open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const run = (hook, input) =>
  spawnSync("node", [join(dir, hook)], { input: JSON.stringify(input), encoding: "utf8" }).status;
const bash = (agent_type, command) => ({ agent_type, tool_input: { command } });

test("quality-tester may run tests and read-only git", () => {
  assert.equal(run("quality-tester-readonly.mjs", bash("quality-tester", "npm test")), 0);
  assert.equal(run("quality-tester-readonly.mjs", bash("quality-tester", "git diff main")), 0);
});

test("quality-tester cannot write", () => {
  for (const c of ["rm -rf x", "echo hi > a.txt", "sed -i s/a/b/ f", "git checkout ."]) {
    assert.equal(run("quality-tester-readonly.mjs", bash("quality-tester", c)), 2, c);
  }
});

test("quality-tester hook ignores other agents", () => {
  assert.equal(run("quality-tester-readonly.mjs", bash("app-developer", "rm -rf x")), 0);
});

test("subagents cannot commit, push, merge, rebase or tag", () => {
  for (const c of [
    "git commit -m x",
    "git push -u origin feat/x",
    "git -C . merge main",
    "git rebase main",
    "git tag v1",
    "git reset --hard HEAD~1",
    "gh pr merge 1",
  ]) {
    assert.equal(run("no-git-writes.mjs", bash("app-developer", c)), 2, c);
  }
});

test("subagents may run read-only git and tests", () => {
  for (const c of ["git status", "git diff", "git log --oneline", "npm run lint"]) {
    assert.equal(run("no-git-writes.mjs", bash("test-engineer", c)), 0, c);
  }
});

test("main session (no agent_type) is not blocked by the subagent git hook", () => {
  assert.equal(run("no-git-writes.mjs", bash(undefined, "git commit -m x")), 0);
});

test("app-developer edit hook ignores other agents", () => {
  assert.equal(run("no-main-edits.mjs", { agent_type: "test-engineer" }), 0);
});
