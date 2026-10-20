// PreToolUse hook (Bash): subagents must not commit, push, merge, rebase, tag or rewrite history.
// Exit 2 blocks the call and shows stderr to the agent. The main session is untouched: it is
// covered by the ask/deny rules in .claude/settings.json (commit and push prompt the user).
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
if (!input.agent_type) process.exit(0);

const command = String(input.tool_input?.command ?? "");
const BLOCKED =
  /\bgit\s+(?:(?:-[Cc]\s+\S+|-\S+)\s+)*(commit|push|merge|rebase|tag|cherry-pick|revert|am|stash|branch\s+-[dDmM]|reset\s+--hard|clean\s+-\w*f|checkout\s+--|restore)\b|\bgh\s+(pr\s+(merge|create)|release|workflow\s+run)\b/;

if (BLOCKED.test(command)) {
  console.error(
    `Subagents must not run this git/gh command ("${command.slice(0, 60)}"). Leave changes uncommitted and report to the orchestrator; only the user commits after Gate C.`,
  );
  process.exit(2);
}
