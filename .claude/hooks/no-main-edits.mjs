// PreToolUse hook (Edit|Write): app-developer must not edit files while on main/master.
// Exit 2 blocks the call and shows stderr to the agent. Other agents are untouched.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const input = JSON.parse(readFileSync(0, "utf8"));
if (input.agent_type !== "app-developer") process.exit(0);

let branch = "";
try {
  branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: input.cwd || process.cwd(),
    encoding: "utf8",
  }).trim();
} catch {
  process.exit(0); // not a git repo or git missing: do not block
}

if (branch === "main" || branch === "master") {
  console.error(
    `app-developer must not edit files on "${branch}". Stop and ask the orchestrator to create a feature branch (feat/... or fix/...).`,
  );
  process.exit(2);
}
