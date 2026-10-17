# Alternative Paths

Use the same setup, subagent-call format, and rules as `SKILL.md`. In the work file,
mark skipped sections `n/a (<path>)`.

## bug-fix
Use when the behavior is wrong and the intended behavior is already documented.
If the fix needs a spec change (API, schema, UI), switch to the `feature` path from step 2.

1. Put the bug in `## Story`: steps to reproduce, expected vs actual, affected area. Ask the user for missing details.
2. `test-engineer` (Reads Story; writes Tests): write a failing regression test and confirm it fails for the right reason.
3. `app-developer` (Reads Story, Tests; writes Build): fix the code so the test passes without weakening it.
4. `quality-tester` (Reads Story, Build, Tests; you save to Review): review the fix; apply the fix loop from `SKILL.md` if needed.
5. Docs only if behavior visible to users or docs changed: `document-writer`.
6. Gate C.

No Gate A or B. Confirm the reproduction with the user before step 2 if the bug report is unclear.

## docs-only
1. `document-writer` (Reads Story; writes Docs/Release > Documentation).
2. Gate C. No other agents unless it reports a code/doc mismatch needing a decision.

## ci-release
1. `delivery-operator` (Reads Story; writes Docs/Release > Release).
2. If it changes `docs/CICD.md` or the release checklist, `document-writer` can follow.
3. Gate C. Deploying and merging stay with the user.
