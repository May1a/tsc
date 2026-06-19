# Handoff: Real class compilation — eliminating the B683 interpreter for classes

**Date:** 2026-06-19
**Branch this lives on:** see commit; work is uncommitted-on-top-of `main @ ba7bf98`.
**Plan file:** `/Users/mac/.claude/plans/yes-i-agree-that-reactive-cocoa.md` (full original plan + progress log).

## Goal

`tsc` (TypeScript → LLVM → clang) currently intercepts any file containing a `class`
(also regex / `new RegExp` / dynamic `JSON`) with a **compile-time interpreter** (the
`B683Native` family in `src/compiler/ir.ts`). That interpreter *executes the program at
build time* and bakes `print` output into the binary as constant strings — classes are
not compiled, just constant-folded.

This effort replaces that with **genuine LLVM class codegen** (static dispatch via the TS
checker). Decisions already locked (do not relitigate):
- **Dispatch: static, resolved via the TS type checker.** Polymorphic call sites should
  emit a diagnostic, never silently mis-dispatch.
- **Scope: classes first.** Regex / `RegExp` / dynamic `JSON` stay on B683 for a separate
  follow-up. Only class predicates get removed from the B683 gate (last step).

## Migration safety net (important mental model)

Real class lowering is attempted **first** for class-using files
(`lowerStatements` → `tryLowerStatementsWithClasses`, `ir.ts`). Any unsupported class
feature throws `ClassLoweringUnsupportedError`, which routes the **whole file** back to the
B683 interpreter. So the suite stays green throughout: unimplemented features silently fall
back, implemented ones use real codegen. A fixture passing its test does **not** prove it
uses real codegen — verify with the probe below.

## Status: what compiles via REAL codegen now (9 of 15 `class-*` fixtures)

`class-public-field`, `class-constructor`, `class-basic-method`, `class-static-method`,
`class-instance-method-call`, `class-accessor-prototype-lookup`, `class-field-order`,
and **newly this session**: `class-getter-setter` (stable variable instances + setter
dispatch + numeric getter bodies).

Still on B683 fallback (6): `class-static-field`, `class-prototype-method-lookup`,
`class-prototype-identity`, `class-instanceof-basic`, `class-instanceof-inheritance`,
`class-instanceof-plain-object`, `class-instanceof-non-constructor-unsupported`,
`class-extends-super-constructor`. (Plus the `*-unsupported` ones that should stay
diagnostics.)

## What this session added (the uncommitted diff)

All in `src/compiler/ir.ts` + `src/compiler/llvm.ts`:

1. **`letValue` IR op** — a stable JSValue memory slot (alloca + store once, load on each
   reference). Added to the `JsIrOperation` union (`ir.ts`, after `constValue`), registered
   as a `valueVariable` binding in `updateBindings` (`ir.ts`) and in both llvm.ts passes
   (the classify pass ~line 235 and the emit pass via new `emitLetValueOperation`).
2. **`lowerConstVariableBinding`** emits `letValue` (not `constValue`) when the initializer
   lowers to a `newInstance`, so `const c = new C()` allocates once and later references
   share object identity instead of re-running the constructor.
3. **`lowerClassInstanceExpression`** now resolves an identifier bound to a class instance
   (a `valueVariable` whose checker type is a registered class) to `{ kind: "variable" }`.
   This makes named-variable receivers work for method calls, field reads, getters.
4. **`lowerClassPropertyAssignment`** (new helper, called near the top of
   `lowerObjectPropertyAssignment`) — `c.prop = v` dispatches to `@C$set$prop(c, v)` for
   setters, or stores the field on the instance for plain fields.
5. **`lowerClassNumberAccess`** (new helper, called in `lowerNumberExpression` just before
   `lowerNumberAccessExpression`) — bridges a **numeric-typed** class member (field or
   getter) into the number path via `valueToNumber`, so `this.value * 2` etc. work.
   **Critically gated on `activeTypeChecker.getTypeAtLocation(expr)` having
   `TypeFlags.Number | NumberLiteral`** — without that gate it greedily coerced *string*
   members to NaN in number-first contexts like `print` (this regressed `class-field-order`
   → "nan"; the type gate fixed it).

`npm run check` + `npm run lint` are CLEAN. `class-getter-setter` verified end-to-end:
compiles via real codegen (markers: `@C$get$doubled`, `@C$set$doubled`, `@C$constructor`,
`@objectNew`) and runs to the correct output `3\n8\n`.

## OPEN ITEM — must resolve before claiming this increment done

Full suite last run: **251 pass / 2 fail**. One fail is the **known pre-existing
environmental** `json-stringify` SIGSEGV (homebrew clang/SDK libm issue on this box; system
clang at `/usr/bin/clang` links fine — that's why tests need
`PATH=/usr/bin:/opt/homebrew/opt/llvm/bin:$PATH bun test`).

**The second failure is unidentified** — its details scrolled out of the captured buffer.
Need to confirm whether it is (a) a second pre-existing environmental SIGSEGV (most likely —
my changes are no-ops for non-class-instance code), or (b) an actual regression. The
conversation summary claimed baseline was "251 pass / 1 fail", but a stale earlier task
output showed "2 fail", so the baseline count itself is uncertain.

**How to resolve (cheaply — user is on a low-core VPS, minimize full-suite runs):**
1. `git stash && npm run build && PATH=/usr/bin:/opt/homebrew/opt/llvm/bin:$PATH bun test 2>&1 | grep -E '\(fail\)| fail|Ran '` then `git stash pop && npm run build`.
   This gives the clean-`main` baseline fail count + names.
2. Diff the failing-test names against the with-changes run. If the set is identical → both
   are pre-existing environmental; this increment is done. If a new name appears → it's a
   regression to fix.
   Capture full output to a file (`> /tmp/x.log 2>&1`) so `(fail)` lines don't scroll off —
   bun only prints them once.

## Remaining work (in priority order)

**Phase 2 finish:**
- `class-static-field` — needs per-class static storage object (`objectNew` once at module
  init) read/written by name; `C.x` resolves to it. Static method dispatch already exists.

**Phase 3 (inheritance / prototype / instanceof):**
- Per-class prototype objects: `C.prototype` identity, `Object.getPrototypeOf`,
  `hasOwnProperty` → unblocks `class-prototype-method-lookup`, `class-prototype-identity`.
  (`class-prototype-method-lookup` currently fails real lowering only on the
  `Object.prototype.hasOwnProperty.call(c, "value")` line — confirmed via DEBUG probe.)
- `instanceof` via class-id slot (object header offset 48; `errorNew` is the precedent for
  writing it) compared against the compile-time-closed set `{C ∪ subclasses(C)}`. Replaces
  `b683InstanceOf`. Unblocks the `class-instanceof-*` fixtures.
- Single inheritance + `super`: `super(...)` → `@Base$constructor(this, …)` emitted before
  own-field init (JS order); `super.m(…)` → `@Base$m(this, …)`. `lowerClassDeclaration`
  currently *rejects* `heritageClauses` (throws unsupported). Unblocks
  `class-extends-super-constructor`.

**Phase 4 (correctness + cleanup):**
- Polymorphism guard: at a resolved method-call site, if `m` is overridden in any subclass
  of the receiver's static type, emit a precise new diagnostic (e.g. `TSCN1010`
  "Polymorphic method dispatch is not supported yet") instead of mis-dispatching.
- Relocate class-feature rejections (`class-expression-unsupported`,
  `class-private-field-unsupported`, `class-computed-field-unsupported`, and the
  `instanceof-non-constructor` TypeError) out of the B683 path into the real path so the
  diagnostics survive B683 removal.
- Final fixture audit, then **drop the class predicates from
  `usesB683NativeFeatureSurface`** so classes never touch B683 again.

## Useful probes / commands

- Build: `npm run build` (tsc). Check: `npm run check`. Lint: `npm run lint`.
- Tests (need working clang on PATH): `PATH=/usr/bin:/opt/homebrew/opt/llvm/bin:$PATH bun test --timeout 30000`
  Filter: append `-t "supports minimal class declarations"` for the class fixture test.
- **Real-vs-B683 probe** (write to repo root, run with `bun`, delete after): import
  `compile` from `./src/compiler/pipeline.js` with `DiagnosticsLive`, `ToolchainLive`,
  `NodeContext.layer`, compile a fixture with `link:false`, read `main.ll`, and check for
  `define i64 @C$get$`, `define void @C$set$`, `@C$constructor`, `call ptr @objectNew`.
  Zero markers ⇒ the fixture fell back to B683.
- **Why-did-it-fall-back probe**: temporarily add a `process.env.DEBUG_CLASS` stderr log in
  the `strict` branch of `lowerTopLevelStatements` (prints the unsupported statement) and in
  the `ClassLoweringUnsupportedError` catch of `tryLowerStatementsWithClasses` (prints
  `error.stack`). Remove before committing.

## Key code landmarks (`src/compiler/ir.ts`)

- `lowerStatements` / `tryLowerStatementsWithClasses` / `lowerTopLevelStatements(strict)` —
  the real-first, B683-fallback routing.
- `lowerClassDeclaration` → `collectClassMembers`, `lowerClassConstructor`,
  `lowerClassMethod`, `lowerClassAccessor`, `lowerClassMethodBody`,
  `lowerClassFieldInitializer`.
- `lowerClassValueExpression` (called first in `lowerValueExpression`) → `this`,
  `lowerClassInstanceExpression` (new/this/identifier instances), `lowerClassMethodCall`,
  getter access, field access.
- `resolveReceiverClass` (uses the checker for identifier/param receivers),
  `lowerInstanceReceiverValue`.
- Naming: `classConstructorName`, `classMethodFunctionName`,
  `classStaticMethodFunctionName`, `classGetterFunctionName`, `classSetterFunctionName`
  (`Class$constructor`, `Class$m`, `Class$static$m`, `Class$get$p`, `Class$set$p`).
- `ClassInfo` registry: module-scoped `activeClassRegistry` (per-file, restored in a
  `finally`); `activeTypeChecker` set by `lowerToJsIr(entry, sourceFiles, checker)`.

`src/compiler/llvm.ts`: `emitNewInstanceValueExpression` (objectNew + box + ctor call),
`emitLetValueOperation` (new), `emitNamedValueBinding`, function `this`-param support in
`emitFunctionDefinition`/`emitFunctionParameters`.
