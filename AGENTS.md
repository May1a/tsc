# tsc - Native TypeScript Compiler

## Instructions

- Keep implementation work aligned with `docs/PLAN.md` and the ADRs in `docs/adr/`.
- Ensure a high level of code quality. Do not take shortcuts.
- Code which does not pass typecheck, lint, and relevant tests is not working code.

## Commands

- Run the linter with `npm run lint`.
- Run typechecking with `npm run check`.
- Run Vitest tests with `npm test`.
- Fetch the pinned Test262 checkout with `npm run test262:fetch`.
- Run the filtered Test262 suite with `npm run test262:run`; it skips when the checkout has not been fetched.

## Agent Skills

### Issue Tracker

Issues live in GitHub Issues on `github.com:may1a/tsc`. Use the `gh` CLI when asked to create, triage, or update issues.

### Triage Labels

Use the repository's GitHub labels if they exist. If labels are not configured, use the default triage vocabulary from the agent skills workflow.

### Domain Docs

This repo uses a single-context layout: `CONTEXT.md` at the repo root plus ADRs in `docs/adr/`.
