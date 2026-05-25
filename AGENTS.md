# tsc - Native TypeScript Compiler

## Instructions

- This project is a native compiler for TypeScript programs. It preserves JavaScript-compatible behavior for the supported language while producing native executables instead of JavaScript output.
- Use the project language from `CONTEXT.md`. Prefer "JavaScript-compatible native TypeScript", "compiler runtime", "native CLI subset", "synchronous runtime milestone", and "correctness oracle".
- Do not describe the project as implementing full JavaScript semantics. `eval` and `with` are excluded by design.
- Keep implementation work aligned with `docs/PLAN.md` and the ADRs in `docs/adr/`.
- Ensure a high level of code quality. Do not take shortcuts.
- Code which does not pass typecheck, lint, and relevant tests is not working code.

## Commands

- Run the linter with `bun x oxlint`.
- Run typechecking with `bun run check`.
- Run Bun tests with `bun test`.
- Run Node integration tests with `bun run test:node`.
- Run the full expected local verification with `bun x oxlint`, `bun run check`, `bun test`, and `bun run test:node` when the change can affect compiler behavior.
- If `bun` is not available in `PATH`, fix the shell environment before claiming verification passed.

## Codebase Boundaries

- `src/compiler` contains compiler frontend loading, JS-semantics IR lowering, LLVM emission, linking, diagnostics, and shared compiler types.
- `src/runtime` contains compiler runtime support for generated programs.
- `src/cli` contains the `tscn` native CLI subset entrypoint and command wiring.
- `test/fixtures` contains input programs and fixture tsconfig files.
- `test/integration` and `test/node` contain compiler behavior tests.
- `docs/adr` contains accepted architecture decisions. Update or add an ADR when changing a durable compiler/runtime decision.

## Implementation Guidelines

- Write strict, typesafe TypeScript.
- Use Effect where the project already uses it for CLI, filesystem, diagnostics, process execution, pass orchestration, and failure handling.
- Preserve JavaScript-compatible runtime behavior for supported language features.
- Reject unsupported features with clear compile-time diagnostics rather than best-effort lowering or runtime traps.
- Treat Node behavior and the documented correctness oracle as external behavior references, not as a commitment to build a Node-compatible runtime.
- Keep the first target focused on the native CLI subset and the synchronous runtime milestone.
- Avoid adding async functions, promises, fibers, or microtask behavior unless the task explicitly moves beyond the synchronous runtime milestone.
- Prefer small, explicit compiler transformations over clever abstractions.
- Keep generated LLVM IR debuggable. Preserve source-span comments and trace-map behavior when touching backend code.
- Do not introduce npm package compilation support unless the task explicitly requires it. Project-local ES modules are the initial module boundary.

## Error Handling and Diagnostics

- Prefer precise diagnostics with stable codes, categories, and source spans.
- Do not silently ignore unsupported syntax, unsupported imports, or failed toolchain steps.
- JavaScript exceptions in compiled programs lower to explicit value-or-exception returns, not native unwinding.
- If a bug is directly related to the task, fix it. If an unrelated bug is discovered, report it clearly and avoid mixing broad unrelated fixes into the current change unless asked.

## Testing Expectations

- Add or update tests for observable compiler behavior changes.
- For code generation changes, verify both emitted artifacts and runtime behavior when practical.
- Runtime behavior should be checked by comparing stdout, stderr, exit code, and thrown error class/message against the correctness oracle for supported fixtures.
- Keep tests focused on supported JavaScript-compatible native TypeScript behavior.
- Do not weaken lint or typecheck configuration to make a change pass unless the task is specifically about tooling configuration.

## Agent Skills

### Issue Tracker

Issues live in GitHub Issues on `github.com:may1a/tsc`. Use the `gh` CLI when asked to create, triage, or update issues.

### Triage Labels

Use the repository's GitHub labels if they exist. If labels are not configured, use the default triage vocabulary from the agent skills workflow.

### Domain Docs

This repo uses a single-context layout: `CONTEXT.md` at the repo root plus ADRs in `docs/adr/`.
