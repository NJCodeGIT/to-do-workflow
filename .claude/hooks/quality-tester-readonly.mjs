// PreToolUse hook (Bash): keeps the quality-tester subagent read-only.
// Exit 2 blocks the call and shows stderr to the agent. Other agents are untouched.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
if (input.agent_type !== "quality-tester") process.exit(0);

const command = String(input.tool_input?.command ?? "");

const ALLOWED = [
  /^npm (run )?(test|lint|typecheck|build|format:check)\b/,
  /^npm (test|run lint|run typecheck|run build|run format:check)( -w \w+)?\b/,
  /^npx vitest\b/,
  /^git (status|diff|log|show|rev-parse|ls-files|blame)\b/,
  /^git branch( --show-current| -a| -r| --list)?\s*$/,
  /^(ls|cat|head|tail|wc|grep|rg|pwd|echo|node --version)\b/,
];

// Strip harmless redirections, then reject any remaining write redirection.
const stripped = command.replace(/\d?>&\d|\d?>\s*\/dev\/null/g, "");
let reason = /(^|[^-])>/.test(stripped) ? "output redirection writes files" : "";
if (/\bsed\s+(-\w*i|--in-place)|\btee\b/.test(stripped)) reason ||= "in-place edit or tee";

if (!reason) {
  for (const part of stripped.split(/&&|\|\||;|\|/)) {
    const seg = part.trim();
    if (seg && !ALLOWED.some((re) => re.test(seg))) {
      reason = `"${seg.slice(0, 60)}" is not on the read-only allowlist`;
      break;
    }
  }
}

if (reason) {
  console.error(
    `quality-tester is read-only: ${reason}. Only tests, linters and read-only git/file commands are allowed. Report the issue instead of fixing it.`,
  );
  process.exit(2);
}
