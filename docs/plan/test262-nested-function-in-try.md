# Plan: Emit Nested Function Declarations (Test262 `try/12.14-10`)

Bug-fix plan for GitHub issue #40 — *"Nested function in try statement emits an
undefined LLVM callee"*. This is scoped to that single defect; the master roadmap
remains `docs/PLAN.md`.

## Goal

A function declaration nested inside another function body — including one whose
body contains `try`/`catch`, and one declared inside a `try`/`catch`/`finally`
block — must have its definition emitted whenever a call to it is emitted. The
pinned Test262 case `language/statements/try/12.14-10.js` must compile, match
Node, and stop failing the link with `error TSCN2003: use of undefined value
'@innerf'`.

## Context / Problem

The pinned case declares `innerf` inside `f` and calls it from `f`; `innerf`
itself throws inside a `try` and returns its parameter `x` from the `catch`.
Today the call is emitted but the callee definition is not:

```text
FAIL language/statements/try/12.14-10.js [compile-failure]
error TSCN2003: clang failed with exit code 1:
main.ll:2051:37: error: use of undefined value '@innerf'
  %call.0.result = call { i64, i1 } @innerf(i64 %arg.num.0, i64 %arg.num.1)
```

(TSCN2003 is the link/toolchain failure diagnostic, `src/compiler/linker.ts:49`.)

### Root cause (confirmed by reproduction)

The defect is in definition collection, not in `try` lowering. A minimal probe
with a nested function declaration and **no** `try` at all fails identically —
the `try` in the pinned case is incidental.

- The frontend lowers a `FunctionDeclaration` in any statement position:
  `lowerStatementCore` (`src/compiler/ir.ts:3953`) routes it to
  `lowerFunctionDeclaration` (`src/compiler/ir.ts:4799`), producing a
  `kind: "function"` IR op. For a nested declaration, that op lands inside the
  enclosing function's `body` operation list (`src/compiler/ir.ts:4882`).
- `updateBindings` (`src/compiler/ir.ts:3602`) registers a `function` binding
  for the nested op, so the call site lowers to a direct `call` op and the
  backend emits `call { i64, i1 } @innerf(...)` via `emitCallOperation`
  (`src/compiler/llvm.ts:4052`).
- The backend only turns **top-level** `function` ops into definitions:
  `emitLlvmIr` (`src/compiler/llvm.ts:323`) runs
  `classifyAndProcessOperation` over `sourceModule.operations`, and only that
  path has the `operation.kind === "function"` branch (`src/compiler/llvm.ts:506`)
  that pushes a `FunctionDef`. A nested `function` op reaches `emitOperation`
  inside the enclosing body and falls through to the `return []` default
  (`src/compiler/llvm.ts:1236`) — silently dropped, never defined.

So every call to a nested function declaration currently produces an undefined
LLVM callee; nothing diagnoses it before clang does.

### Catch-scope lookup

The second acceptance criterion (catch scope resolves `x` to the nested
function parameter) is expected to hold once the definition is emitted:
`lowerFunctionDeclaration` binds parameters in `fnBindings`
(`bindFunctionParameter`, `src/compiler/ir.ts:4912`), and both the direct-throw
shortcut (`lowerDirectThrowTryCatchShortcut`, `src/compiler/ir.ts:4062`) and the
general `tryCatch` path (`lowerTryCatchStatement`, `src/compiler/ir.ts:3987`)
lower the catch block against a fresh map derived from those bindings, shadowing
only the catch variable. This must be verified end to end against Node, not
assumed.

## Approach

Hoist nested `function` IR ops into module-level definitions in the LLVM
backend, reusing the existing top-level classification shape.

1. **Collect nested declarations.** In `emitLlvmIr` (`src/compiler/llvm.ts`),
   extend the existing `visitJsIrOperations` walk (`src/compiler/llvm.ts:352`,
   walker defined at `src/compiler/ir.ts:1524`) so any `kind: "function"` op
   with a parent — i.e. nested inside a function body, `block`, `bindingGroup`,
   `if`, loop, or `tryCatch` branch — is converted into a `FunctionDef` exactly
   like the top-level branch at `src/compiler/llvm.ts:506`, including the
   `returnClosure` companion definition. Verify `jsIrOperationChildren`
   (`src/compiler/ir.ts`) actually descends into `function` bodies and
   `tryCatch` operation lists; extend it if it does not.
2. **Keep body emission a no-op.** The nested `function` op must remain a
   fall-through no-op in `emitOperation` — hoisting is definition collection
   only, not an emission-ordering change. LLVM IR permits the `define` to
   appear anywhere at module scope, so no forward-declaration plumbing is
   needed.
3. **Name uniqueness.** Module-level defines share one namespace. Two nested
   declarations with the same source name in different enclosing scopes would
   collide. For this slice, detect a collision while collecting and emit a
   compiler diagnostic instead of a duplicate `define`; do not silently mangle
   (call sites bind by source name). A single nested `innerf` — the pinned
   case — is unaffected.
4. **Scope to non-capturing declarations.** A nested declaration that references
   enclosing locals has no capture machinery on the direct-call path (closures
   are handled separately via `returnClosure`/function objects). This slice
   covers non-capturing nested declarations — sufficient for the pinned case —
   and must not regress the existing top-level path. Capturing nested
   declarations are follow-up work, not silent miscompiles: if collection
   cannot support one, prefer a diagnostic over a wrong define.

No frontend (`src/compiler/ir.ts`) lowering change is expected; the IR already
carries the nested op and the call-site binding. If step 1 reveals the walker
skips `function` bodies, the fix stays backend-local.

## Regression Coverage

- **Test262 (primary):** `language/statements/try/12.14-10.js` flips from
  `compile-failure` to `PASS` under
  `npm run build && node dist/test262/run.js --path language/statements/try`,
  and the previously passing 27 tests in that prefix stay green. The full
  filtered suite (`npm run test262:run`) must not regress the baseline in
  `test262/baseline.json`; no `test262/filters.json` change should be needed.
- **Fixture:** add a `test/fixtures/` case for a non-capturing nested function
  declaration called from its enclosing function, including one declared
  inside a `try` block and one called from a `catch` block, with Node-oracle
  comparison, so the hoisting walk is covered independently of the Test262
  checkout.
- **LLVM verification:** generated LLVM for the new fixtures and the pinned
  case must parse and verify before linking (the toolchain already probes
  `llvm-as` in `src/compiler/toolchain.ts`; clang's parse of `main.ll` is what
  surfaces TSCN2003 today). No `use of undefined value` diagnostics may reach
  the linker for these inputs.
- **Catch-scope semantics:** the pinned case asserts `f({}) === 42`, i.e. the
  `catch (e)` block returns the nested parameter `x`, not the caught value —
  the Node-oracle comparison covers the second acceptance criterion directly.

## Acceptance Criteria

Mirrors GitHub issue #40:

- Nested function declarations are emitted whenever their calls are emitted.
- Catch-scope lookup resolves `x` to the nested function parameter.
- The pinned Test262 case `language/statements/try/12.14-10.js` matches Node
  and no longer produces TSCN2003.
- Generated LLVM verifies before linking.
- Typecheck, lint, Vitest, and focused Test262 execution pass.

## Verification

- `npm run check` — typecheck clean.
- `npm run lint` — lint clean.
- `npm test` — Vitest suite green, including the new fixture.
- `npm run build && node dist/test262/run.js --path language/statements/try` —
  `12.14-10.js` passes; no new failures in the prefix.
- `npm run test262:run` — filtered suite matches or improves on
  `test262/baseline.json`.

## Non-Goals

- Capturing nested function declarations (closure conversion for direct calls).
- Block-scope (`{ ... }`, `if`, loop body) function-declaration semantics beyond
  what the hoisting walk already reaches, and Annex B sloppy-mode hoisting
  rules.
- Function declarations nested inside class methods or the B683 interpreter
  fallback (`lowerB683NativeFeatureStatements`, `src/compiler/ir.ts`).
- Any change to the function-object/`jsCall` dispatch path.
