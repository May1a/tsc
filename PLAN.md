# Declare the support set, then widen the front door

## Goal

Make "what does tscn support" a fact the compiler can state, prove, and grow, instead of
something you discover by running it on a file and reading `TSCN1002`.

Then use that machinery to admit the roughly 30 TypeScript forms that already typecheck and are
already erased, so real programs stop bouncing off the compiler.

## What the compiler supports today

Measured on 2026-09-29, not estimated. 111 hand-written TypeScript programs were compiled with
`dist/cli/main.js` and every one that produced a binary was run and compared against the same
source transpiled to ESM and run under Node.

- 70 of 111 compiled. 41 did not.
- 33 of those 41 reported nothing but `TSCN1002: Unsupported statement in the current lowering
  slice: <SyntaxKind>`. The other 8 named a specific limitation. One code and one message shape
  for 80% of the failures, naming the TS `SyntaxKind` rather than the feature.
- 8 of the 33 print `FirstStatement` where the source is a `const` declaration.
  `ts.SyntaxKind[kind]` resolves the reverse enum alias, and TypeScript declares
  `FirstStatement = VariableStatement` after `VariableStatement`, so the lookup lands on the
  alias. The user is told their variable declaration is not a variable declaration.
- Of the 70 that compiled, 3 produced wrong output. Details in the preflight section.
- Everything that did not corrupt output agreed with Node, including generics on functions,
  union annotations, mapped and conditional and infer types, `keyof`, tuples, index signatures,
  `super.m()`, class fields, computed member keys, `as const`, non-null assertions, optional
  chaining, rest parameters, `catch` without a binding, and cross-module import and export.

So the language core is further along than a glance at the fixture directory suggests. What is
missing is almost entirely erasure and desugaring, and the diagnostics hide that.

## Why the current shape does not scale to "over time"

Three things make each new feature riskier than it needs to be.

**The support set is control flow, not data.** `src/compiler/ir.ts` holds 116
`lower*Binding`/`lower*Expression`/`lower*Statement` recognizers, 33 of them binding
recognizers, and 468 `ts.isX` guards. Each one pattern-matches an AST shape and returns
`undefined` when it does not match. That single `undefined` means both "this is not my shape,
ask the next recognizer" and "this is my shape and I cannot handle it". The two cases are
indistinguishable at the call site, so a recognizer that matched and then gave up looks
identical to one that never applied.

**The file is lowered twice.** `lowerStatements` (ir.ts:2003) runs the whole file in strict mode
where any `undefined` aborts, and if that aborts it runs the whole file again in non-strict mode
where the same `undefined` becomes a `TSCN1002` diagnostic. The allowlist is the strict pass.
That is why 41 distinct features produce one indistinguishable message: the diagnostic is
generated after the fact by `unsupportedStatementMessage` (ir.ts:12014), which re-walks the AST
trying to guess why, and falls back to the `SyntaxKind` name.

**Emission dispatches by if-chain too.** `emitOperation` (llvm.ts:1235) sorts 120 operation
kinds into 12 helper predicates (`emitBindingOperation`, `emitMutationOperation`,
`emitCallLikeOperation`, and so on) that each re-test the kind. A new operation can be
forgotten in any of them. `AGENTS.md` already names this as the blocker for
`no-open-union-narrowing` and says the fix is a `Record<JsIrOperation["kind"], Handler>` table.

The two god-files are 12,424 and 8,229 lines by `wc`, or 11,426 and 7,452 once blanks and comments
are skipped. `npm run lint` reports both on `max-lines` today, plus `max-lines-per-function` on
`emitValueExpression` at 505 lines. The 89 `eslint-disable` comments between the two files are 46
`complexity` and 43 `max-statements`, all but three of them on recognizers, which is the honest
measure of how tangled the dispatch is. `oxlint.config.ts` already flags
this as Phase 2 debt and names `runtime-helpers.ts`, a file that no longer exist after the `.ll`
extraction, along with a `src/runtime/**` entry that is also gone.

## Non-goals

- No change to emitted behavior for any program that compiles today. The oracle must stay green
  on all 122 fixtures.
- No new runtime capability. That is a separate plan. This one only makes room.
- No use of the type checker for representation choice. Narrowing and monomorphized generics
  are direction D and they want a settled frontend.

## Data model

Three new types carry the whole design.

**A three-way lowering result.** Every recognizer stops returning `JsIrOperation | undefined` and
returns:

```ts
type Lowered =
  | { readonly kind: "lowered"; readonly operation: JsIrOperation }
  | { readonly kind: "notApplicable" }
  | { readonly kind: "unsupported"; readonly reason: string };
```

`notApplicable` continues the recognizer chain. `unsupported` stops it and carries the reason to
the diagnostic. This is the fix for both of the first two problems above: the strict pass
disappears, because a recognizer that matched and gave up now says so, and the reason is
available at the point of failure instead of reconstructed afterwards. A recognizer that
returns `notApplicable` for something it actually recognizes becomes a type error once the
builtin table below exists, because the table entry for that builtin is a `Lowered` producer.

**A builtin support table.** One entry per recognized builtin, keyed by owner and name, with the
lowering that implements it. A `Record` keyed by the entry union so a new builtin without a
lowering will not compile:

```ts
type ArrayBuiltin = "slice" | "splice" | "map" | "flatMap" | "with" | "at" | ...;
type ArraySupport = Readonly<Record<ArrayBuiltin, BuiltinEntry<"array">>>;
```

`BuiltinEntry` carries the owner, the name, the arity or arity range, the `Lowered` producer, and
a `state` of `"supported"` or `"planned"`. A `"planned"` entry is the important half: it is how
the compiler says "this is a builtin I know about and have not written yet", which is a far more
useful diagnostic than `Unsupported statement: CallExpression`, and it is free to generate once
the table exists.

**A support manifest**, derived from the tables, never hand-maintained. One entry per builtin
with its state, and one entry per erasure-only TypeScript form with whether it is admitted. The
manifest is what the test reads, so it cannot drift from the code.

## Target design

### 1. Split "not mine" from "mine but no"

Convert the 33 binding recognizers and the expression and statement dispatchers to `Lowered`.
This is mechanical but not trivial: the tricky part is that several recognizers currently
*fall through* to a later one after partially matching. Each of those becomes an explicit
`unsupported` with the reason the fallthrough was happening, and the fallthrough is removed. That
is where most of the diagnostic quality improvement comes from, and it will surface cases the old
code silently dropped.

Delete `lowerTopLevelStatements`'s `strict` parameter, `tryLowerStatementsWithClasses`, and
`ClassLoweringUnsupportedError` once nothing throws. The class path uses the exception to abort a
strict attempt; with `Lowered` it can just report `unsupported` and let the chain continue.

### 2. Build the builtin tables

Group the 33 recognizers by owner into `array`, `object`, `string`, `number`, `collection`,
`json`, `regexp`, `date`, `math`, `function`, `error`, `iterator`. That is 12 modules, and it is
the natural seam the file is already sorted by, which is a good sign the split is along existing
seams rather than invented ones.

Each module exports its owner type, its `Support` record, and its `lower*` producers. The
`Record` key is checked for completeness, so deleting a builtin and forgetting the table entry
does not compile, and adding a table entry without a producer does not compile.

### 3. A total operation emitter table

This is the one that is a pure win and should land early, because it is small and it makes the
IR closed-world property real in emission the way `jsIrLeafOperationKinds` already makes it for
the container and leaf split:

```ts
type OperationEmitter<T extends JsIrOperation["kind"]> =
  (operation: Extract<JsIrOperation, { readonly kind: T }>, context: EmitContext) => string[];

function operationEmitters<T extends JsIrOperation["kind"]>(
  handlers: { readonly [K in T]: OperationEmitter<K> }
): { readonly [K in T]: OperationEmitter<K> } {
  return handlers;
}

const emitters = operationEmitters({
  "arrayLiteral": emitArrayLiteralOperation,
  "runtimeArrayLiteral": emitRuntimeArrayLiteralOperation,
  // ... all 120
});
```

`Extract` gives each handler its narrowed operation, and the mapped parameter type forces all
120 keys. Replace the 12 helper predicates in `emitOperation` with the table. Deleting the
predicates is the point; keeping them alongside the table would leave two dispatchers, and the
if-chain would still be the one that runs when a key is missing at runtime.

### 4. The manifest and its test

`test/unit/support-manifest.test.ts` reads the manifest and asserts:

- Every `"supported"` builtin has a fixture, and the fixture name follows
  `<owner>-runtime-<name>.ts`. 138 of the 704 fixtures already match that shape, so the
  convention exists, it was just never written down. Note that the existing `-unsupported`
  fixtures do *not* follow a rejection convention: `array-runtime-map-unsupported-callback.ts` is
  a passing program where the callback is not inlined. Do not derive the manifest from filenames.
- Every `"planned"` builtin has a fixture that asserts the specific `unsupported` reason, so
  deleting a `"planned"` state has to delete a test with it.
- Every erasure-only form the plan admits is listed.

This test is the thing that would have caught two of the three preflight bugs. Each of those sits
one shape away from a fixture that exists and passes today.

### 5. Decompose

`ir.ts` into `src/compiler/ir/`:

- `types.ts`: the IR unions, `jsIrLeafOperationKinds`, `jsIrOperationChildren`,
  `visitJsIrOperations`
- `module.ts`: `lowerToJsIr`, `lowerStatements`, trace plumbing, `JsIrResult`
- `statements.ts`, `functions.ts`, `classes.ts`, `destructuring.ts`, `expressions.ts`
- `bindings.ts`: `JsIrBindingValue` classification, `aggregateBindingForOperation`,
  `updateBindings`
- `builtins/*.ts`, one per owner, holding the support table and its producers

`llvm.ts` into `src/compiler/llvm/`: `module.ts` (`emitLlvmModule`, function definitions),
`context.ts` (`EmitContext`, `JsValue`, layout), `completion.ts` (cleanup frames, completion
transfer, throw entry), `operations.ts` (the table), `trace.ts`.

Split by concept, not by line range. Each cut is a separate commit that ends green, so a bad
cut is one `git revert` away rather than a 12,000-line merge conflict. Once both files are under
800 lines, promote `max-lines` and `max-lines-per-function` from `warn` to `error`, and enable
`max-len` at 140, which `AGENTS.md` records as an open proposal blocked on exactly this. Delete
the two `oxlint.config.ts` entries naming `runtime-helpers.ts` and `src/runtime/**`, which no
longer exist after the `.ll` extraction. `CONTEXT.md` needs a matching update, since it currently
tells readers the IR lives in `src/compiler/ir.ts`.

### 6. Fix the diagnostics

- `TSCN1002` for a recognized-but-unimplemented builtin reads `Array.prototype.with is a known
  builtin that this build does not implement yet` and cites the manifest id.
- `TSCN1002` for an unrecognized call target reads `Unrecognized call target: arr.foo()`. A
  call the compiler does not recognize at all is a different failure from a builtin it has not
  written, and today they are the same string.
- Keep the `SyntaxKind` fallback for genuinely unknown statements, but stop using it for
  expressions, where it is never the useful part of the message.
- Render the kind through a name table rather than `ts.SyntaxKind[kind]`. The enum declares 33
  range aliases, and the reverse lookup lands on whichever was declared last, so `const` prints
  `FirstStatement`. A `Record<ts.SyntaxKind, string>` over the statement range is enough.
- Add a new code for "compiled and miscompiled". Not part of this plan's scope, but the
  preflight bugs show the current codes have no room for "we produced this and it was wrong".

### 7. Fix `TS5110`

`defaultCompilerOptions` (frontend.ts:56) pairs `module: ESNext` with
`moduleResolution: NodeNext`, which TypeScript rejects. Every compile without a tsconfig prints
a spurious `error TS5110` before the real diagnostics. One line, and it was in the way of reading
the preflight output.

## Preflight: three miscompiles

These are not part of the support work. They are in the plan because they are the argument for
it, and because fixing them first proves the fixtures can catch a regression of this class.

**Array-literal spread into a call.** `function f(...a: number[]) {} f(...[1, 2])` segfaults with
exit 139. `f(...a)` with `a` a named binding works, and the four-argument `show(1, ...iterable, 4)`
in `call-iterable-spread.ts` works. `f(...["a"])` into `(...a: string[])` prints
`1.04858e+06`. No fixture covers the literal form; `call-spread-into-rest.ts` uses a named
binding. Add three fixtures and find the argv buffer sizing.

**Optional members on an object literal.** `const o: { m?(): void } = {}; o.m?.()` segfaults.
The same program without the annotation works, and the unannotated `o.m()` and even `const o: {
m?(): void } = {}; print(typeof o.m)` fail to compile. An object literal with an optional member
is a sparse shape and it is being lowered as a dense one.

**The `this` parameter reaches the call site.** `runtimeParameters` filters type-only `this`
parameters at three sites, but `lowerFunctionDeclaration` (ir.ts:4753) iterates
`statement.parameters` directly, so it records a runtime slot named `this`, and
`parameterValueKind` types it `number` because `this: void` is not `string`, `unknown`, or `any`.
The declaration and the call site then disagree about arity. One call to an existing helper
fixes it.

## Feature batches

These are the payload the new machinery carries. Ordered so each batch is independently
shippable and each is mostly erasure, which is why they are cheap once the table exists.

**Batch 1, pure erasure.** These are one missing `SyntaxKind` in an existing function, and
several already have partial support.

- `satisfies`: add to `unwrapTypeOnlyExpression` (ir.ts:6537), which already handles `as`,
  `<T>`, `!` and parens. One line.
- `this` parameter: the preflight fix, plus routing all declaration sites through
  `runtimeParameters`.
- Optional parameters: lower to a parameter with a default of `undefined`.
- `abstract`, `implements`, `override`, `declare`, `readonly`, `public`, `private`, `protected` on
  members: `override` already works. The rest are modifier filtering.
- Type parameters on classes: erase, keeping the `extends` clause.
- Function overload signatures: lower only the implementation signature.
- `accessor` keyword: desugar to a getter and setter pair, which the class path already has.

**Batch 2, desugaring to shapes that already work.** Each of these becomes an object literal or a
`switch`, and both are supported.

- `enum`: an object literal with the forward and reverse mappings, following the C-style
  semantics. Numeric and string members separately, since a string member has no reverse entry.
- `namespace`: an object literal, hoisted for the IIFE form and lazy for the non-IIFE form.
- Labeled statements: the one item here that adds a form rather than reusing one. `break` and
  `continue` currently carry a target depth, and the `LoopLabels` type at llvm.ts:144 is an
  exception-unwinding depth stack for `try`/`finally`, not a source label. A label is a named
  target the IR does not represent, so this needs one first.
- Comma declarators in `for` initializers: currently `lowerForInitializer` handles one
  declarator.
- Object literal `get`/`set` accessors: the class path has `lowerClassAccessor`; the object
  literal path does not.
- `new.target`: a synthetic binding initialized from a runtime call.

**Batch 3, narrowing the known-wrong shapes.** These are the ones where the honest answer is that
the current lowering is wrong for a shape it accepts, not that it is missing.

- Array-literal spread into a call (preflight).
- Sparse object literals with optional members (preflight).
- Computed method names in object literals. `const o = { m() {} }` lowers, `const o = {
  [Symbol.iterator]() {} }` reports `Object methods are not supported by known-shape numeric
  objects`, which is both a different limitation and a misleading name, since the array is
  numeric and the object is not. Class members already handle computed keys through
  `ClassComputedKeyInfo`; the object literal path does not.

Runtime breadth is deliberately out of scope. Generators and `async`, `Symbol` beyond `iterator`,
`Intl`, full `Date`, `WeakMap`, `Proxy`, `TypedArray`, `BigInt` each need a new `.ll` domain plus
a table entry plus fixtures, and they are a good fit for the table once it exists. That is the
next plan.

## Implementation sequence

Each step ends green and is separately revertable.

1. `TS5110` fix. One line.
2. The three preflight miscompiles, each with its fixtures.
3. `operationEmitters` table in llvm.ts, the 12 predicates deleted. Emitted text must be
   byte-identical for every fixture.
4. `Lowered` introduced. Mechanical, no behavior change. The double-lower is still there.
5. The double-lower removed. `strict`, `tryLowerStatementsWithClasses` and
   `ClassLoweringUnsupportedError` go.
6. The builtin tables, one owner at a time, `array` first because it has the most entries.
7. The manifest and `support-manifest.test.ts`.
8. Decomposition of both files, one cut per commit.
9. Promote `max-lines` and `max-lines-per-function` to `error`, enable `max-len` at 140. Delete
   the stale `oxlint.config.ts` entries. Update `CONTEXT.md`.
10. Batches 1 and 2, one feature per fixture pair, so each is a revertable commit.

Steps 3 through 5 are the ones that pay for steps 6 through 10. If the plan has to be cut short,
cut it after step 5 and the next person inherits a compiler that can state what it supports.

## Verification

Run after every step, not just at the end.

1. `npm test`
2. `npm run check`
3. `npm run lint`
4. `npm run test262:run`, which is gated on `minimumPass: 955` and `maximumFail: 0` in
   `test262/baseline.json`. A step that does not change behavior must not move either number.
5. For step 3 specifically, diff `main.ll` for every oracle fixture against the pre-step
   output. Byte-identical or revert.
6. For step 4 and 5, `npm test` must pass with the same 122 oracle fixtures and the same
   diagnostics for the 3 currently-asserted rejections in `core.test.ts`.

The baseline was green when this plan was written, on 2026-09-29: `npm run check` clean,
`npm run lint` clean apart from the three size warnings named above, and 605 tests across 18
files passing. The 111-probe matrix above was produced from a working `dist/`.

## Completion criteria

- A single lowering pass. No `strict` flag, no exception-based abort, no second traversal.
- Emission dispatches through one total `Record` table, and the 12 if-chain predicates are gone.
- The support manifest is derived from the tables, and a test fails if a table entry has no
  fixture.
- A program using a `"planned"` builtin gets a diagnostic naming the builtin.
- All 122 oracle fixtures pass, and the Test262 baseline is unmoved.
- Neither god-file warns on `max-lines`, `max-lines-per-function` or `max-len`, and `npm run lint`
  enforces all three.
- Every one of the 41 probes that failed to compile at the start either compiles and agrees
  with Node, or reports a diagnostic that names the specific feature.

## Step 5 remainder: converting the class and expression tiers

The statement tier returns `Lowered`; the class and expression tiers still return
`JsIrOperation | undefined` and the class tier aborts by throwing. The conversion is
mechanical and was done once, so the shape it needs is written down here rather than
rediscovered.

**Three shapes, not one.** `Lowered` has three cases because a *chain* recognizer needs
`notApplicable` to mean "try the next one". Once a chain has matched, the steps below it
have no next one, and a `notApplicable` there would be a bug dressed as a fallback. So:

```ts
export type Lowered<T = JsIrOperation> =
  | { readonly kind: "lowered"; readonly operation: T }
  | { readonly kind: "notApplicable" }
  | { readonly kind: "unsupported"; readonly reason: string };

export type Produced<T> =
  | { readonly kind: "lowered"; readonly operation: T }
  | { readonly kind: "unsupported"; readonly reason: string };

type LoweredStatementList = Produced<readonly JsIrOperation[]>;
```

`Produced` is for the class path and the per-member helpers; `Lowered` is for the
expression-tier recognizers that are genuinely a chain.

**`notApplicable` has to be assignable to every `Lowered<T>`.** One shared constant
typed `Lowered` pins it to `Lowered<JsIrOperation>` and makes every other return site a
type error. `const notApplicable: Lowered<never>` works, because `Lowered<never>`'s
lowered branch carries `operation: never`, which fits `operation: T` for every `T`.

**Name the constructor for its shape, not its verb.** `const lowered = <T>(...)` collides
with the many local `lowered` bindings in `ir.ts` and `no-shadow` fires at seven sites.
`produced` does not.

**The 26 bare throws become reasons, one per omission.** They are the diagnostic quality
win and they are why the conversion is worth doing. `classCallableParameters` alone had
five, all reported as `class lowering unsupported`, and they are five different omissions:

| shape | reason |
| --- | --- |
| `param.dotDotDotToken !== undefined` | `Rest parameters are not supported on class members yet` |
| `param.questionToken !== undefined` | `Optional parameters are not supported on class members yet` |
| `param.initializer !== undefined` | `Parameters with defaults are not supported on class members yet` |
| `ts.getModifiers(param)?.length > 0` | `Parameter properties are not supported on class members yet` |
| `!ts.isIdentifier(param.name)` | `Destructuring parameters are not supported on class members yet` |

`collectClassMembers` classifies members by shape and its final `else` is where the
unclassified ones land; `classMemberRefusalReason(member)` names which, and it has to
narrow `member.name === undefined` first because a construct signature has no name.
`class-this-before-super.ts` asserted the old blanket string and now asserts
`A derived constructor must call 'super(...)' as its first statement`.

**One regression to avoid.** With the conversion applied, nine Test262 class tests failed
with `Error: Expected JSValue binding` from `emitValueObjectSetPrototypeOperation`, which
means `emitNamedValueBinding(operation.targetName)` found no binding. The two class entry
points are `lowerClassDeclaration` (a declaration) and `lowerClassExpressionStatement` (an
expression bound to a `const`); folding them into one `lowerClassStatement` that returns
`Produced<readonly JsIrOperation[]> | undefined` is what makes the caller branch once
instead of twice, and it is where the bug was introduced. Every early return added to
`lowerClassDeclaration` has to happen **before** `classes.set(info.name, info)` and before
the operations list is built, so a refusal cannot leave the registry half-populated.
`class-static-inheritance.ts` and `class-expression-named.ts` catch it; `class Base { y = 0 }
class Derived extends Base {}` does not, because a base with no constructor takes a
different path.

**Merging `classMethodFunctionName` and `classStaticMethodFunctionName` is a trap.** The
static suffix is `` `${className}$static$${methodName}` `` — one `$` before `static` and
one after. Written as `` `$static$$${methodName}` `` it silently renames every generated
static method, and `class-static-inheritance.ts` is the only fixture that notices. Three
call sites also pass staticness explicitly rather than through a name.
