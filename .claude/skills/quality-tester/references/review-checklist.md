# Review Checklist

## Correctness
- [ ] Meets every acceptance criterion in `docs/BACKLOG.md`
- [ ] Edge cases handled: empty input, max length (title 200), unknown id, duplicate email
- [ ] Status changes keep `completed_at` and `updated_at` consistent

## Architecture (from CLAUDE.md)
- [ ] Routes hold no business logic; controllers hold no SQL
- [ ] Client calls HTTP only through `client/src/api.ts`
- [ ] Schema changes are new numbered migrations; applied ones untouched
- [ ] Code matches `docs/API_SPEC.md` and `docs/DB_SCHEMA.md`, or the docs were updated

## Conventions
- [ ] Naming, error handling, and validation follow `docs/CONVENTIONS.md`
- [ ] Conventional Commit messages; no unrelated changes in the diff

## Tests
- [ ] New behavior has tests; bug fixes have a regression test
- [ ] Tests assert behavior, not implementation details
- [ ] No skipped, weakened, or deleted tests

## Maintainability
- [ ] No dead code, stray debug output, or commented-out blocks
- [ ] No needless new dependencies

## Accessibility (UI changes)
- [ ] Every input has a visible label; errors are announced or linked to the field
- [ ] Fully usable by keyboard; visible focus state
- [ ] Buttons and links are real `button` / `a` elements with clear names
- [ ] Task status is not conveyed by color alone
- [ ] Sufficient color contrast; loading, empty, and error states exist
