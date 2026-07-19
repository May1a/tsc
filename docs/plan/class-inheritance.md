# Plan: Native Class Inheritance

Implementation plan for GitHub epic #15 and its tickets: #24 (`extends` with
`super(...)` construction), #25 (inherited instance methods and `super.method()`),
and #26 (static member inheritance and native `instanceof` across the chain).
This plan is scoped to that slice; the master roadmap remains `docs/PLAN.md`.

## Goal

Lower classes with an `extends` clause to native LLVM code instead of routing the
whole file to the B683 compile-time interpreter. Derived construction runs the
base constructor through `super(...)` with correct field-initialization order,
derived instances resolve inherited methods and accessors, static members
inherit through the class hierarchy, and `instanceof` traverses the real
prototype chain — all through native lowering that passes the Node correctness
oracle.

This is the first elimination of `compileTimeFallback` for class files, as
directed by the master roadmap's follow-up work, and it unblocks the explicitly
deferred follow-ups #32 (class expressions and computed members) and #33
(private fields), both of which are blocked by #24.

## Context

Native class lowering exists today for classes **without** heritage clauses. The
machinery lives almost entirely in `src/compiler/ir.ts`:

- `lowerClassDeclaration` (`ir.ts:1987`) rejects any class with a heritage
  clause: `ir.ts:1995-1997` throws `ClassLoweringUnsupportedError` with the
  comment "inheritance handled in a later phase". `tryLowerStatementsWithClasses`
  (`ir.ts:1925`) catches that and returns `undefined`, so the file falls through
  to `lowerB683NativeFeatureStatements` (`ir.ts:2596`) — the compile-time
  interpreter — and the module's trace map records
  `loweringMode: "compileTimeFallback"` (`src/compiler/trace.ts:28`).
- The class model is **static dispatch**: instances are runtime objects created
  by the `newInstance` IR op (`ir.ts:297`, emitted in
  `emitNewInstanceValueExpression`, `llvm.ts:4106`), the constructor is an
  ordinary function `C$constructor` whose first parameter is the synthetic
  `CLASS_THIS_NAME` (`ir.ts:13`), and method calls resolve at lowering time via
  `resolveReceiverClass` (`ir.ts:2485`) to direct calls of `C$m` /
  `C$static$m` functions (`lowerClassMethodCall`, `ir.ts:2439`).
- Each class gets a module-level prototype object `C$prototype`
  (`lowerClassPrototypeStorage`, `ir.ts:2040`) and, when it declares static
  fields, a statics storage object `C$statics` (`lowerClassStaticStorage`,
  `ir.ts:2052`). The prototype object is currently empty: methods are **not**
  installed on it, and instances never have their `[[Prototype]]` slot set —
  `emitNewInstanceValueExpression` calls `objectNew` + `valueBoxObject` only.
- The runtime already has the prototype machinery this slice needs: runtime
  objects carry a prototype slot, `objectGet` walks the prototype chain
  (`runtime-helpers.ts:6805`), `objectSetPrototype`/`objectGetPrototype` exist
  (`runtime-helpers.ts:6861`, `runtime-helpers.ts:6900`), and the GC marks
  through the object prototype slot (`gcMarkObject`, `runtime-helpers.ts:979-983`).
- `instanceof` lowers natively only for built-in error constructors via a static
  check (`lowerInstanceOfCondition`, `ir.ts:8284`, and `errorInstanceMatches`,
  `ir.ts:8306`); any other right-hand side produces the diagnostic in
  `unsupportedInstanceOfMessage` (`ir.ts:11342`), and for class files that means
  compile-time fallback.
- Verified current behavior: `class-basic-method.ts`, `class-static-method.ts`,
  `class-getter-setter.ts`, and `class-prototype-identity.ts` lower natively;
  `class-extends-super-constructor.ts`, `class-instanceof-inheritance.ts`, and
  `class-prototype-method-lookup.ts` currently fall back. The ABI groundwork —
  uniform `i64` NaN-boxed `JSValue` at every boundary (ADR 0012), `{ i64, i1 }`
  value-or-exception returns (ADR 0008), and the explicit GC root stack
  (ADR 0009) — is already in place and unchanged by this slice.

`test/integration/trace-map.test.ts:141-155` currently **asserts** that
`class-extends-super-constructor.ts` records `loweringMode: "compileTimeFallback"`,
and `trace-map.test.ts:181-185` asserts the Node oracle rejects it for that
reason. Both tests must be updated as part of this work.

## Semantic Model

### Static dispatch, real prototype chain

This slice keeps the existing compile-time dispatch model and adds a **real
runtime prototype chain** only where observable semantics require it:

- `ClassInfo` (`ir.ts:24-35`) gains the base class name (and, where convenient,
  a resolved `ClassInfo` link). Member lookup that today consults exactly one
  `ClassInfo` walks the base chain through `activeClassRegistry` instead.
- At class-definition time the compiler emits `objectSetPrototype(D$prototype,
  C$prototype)` and, when both sides have statics storage,
  `objectSetPrototype(D$statics, C$statics)`. Because `objectGet` already walks
  the chain and the GC already traces prototype slots, inherited property
  visibility through dynamic access comes from the runtime, not from new IR.
- `emitNewInstanceValueExpression` sets the fresh instance's prototype to the
  class's `C$prototype` object via `objectSetPrototype`. This makes
  `Object.getPrototypeOf(new D())`, dynamic property fallback, and `instanceof`
  observe the real chain.

The heritage expression is restricted to a bare identifier resolving to another
class declared in the same file. Anything else — computed heritage, `extends`
of a built-in constructor such as `Error`, mixin calls — keeps throwing
`ClassLoweringUnsupportedError` and falls back as today.

### Construction order (`super(...)`)

`lowerClassConstructor` (`ir.ts:2270`) currently emits field stores first, then
constructor body statements — correct for base classes. For derived classes:

- An **omitted** derived constructor synthesizes parameters matching the base
  constructor's declared parameters and forwards them to `super(...)`, then
  runs derived field initialization. This matches the fixed-arity direct-call
  convention; rest-parameter forwarding is out of scope.
- An **explicit** `super(...)` must be the first statement of the derived
  constructor body in the supported surface. Lowering emits: super argument
  evaluation, a direct call to `Base$constructor(this, ...args)`, then the
  derived field stores, then the remaining body statements. This yields Node's
  observable order: base fields, base constructor body, derived fields, derived
  constructor body.
- `this` access before `super()` and constructor bodies where `super(...)` is
  not in first position throw `ClassLoweringUnsupportedError` (compile-time
  fallback) rather than receiving partial TDZ semantics. Node throws a
  `ReferenceError` there; modeling that is follow-up work, not silent divergence.

### Inherited instance members and `super.method()`

- `lowerClassMethodCall`, getter dispatch in `lowerClassValueExpression`
  (`ir.ts:2398`), and setter dispatch in `lowerClassPropertyAssignment`
  (`ir.ts:2579`) walk the base chain when the statically resolved class does not
  declare the member, emitting a direct call to the **defining** class's
  function with the derived receiver as `this`. Overriding methods shadow base
  implementations because the walk starts at the receiver's own class.
- `super.m(...)` inside an instance method lowers to a direct call
  `Base$m(this, ...args)`. Lowering gains an enclosing-class context (parallel
  to the existing `classThisInScope` module flag, `ir.ts:43`) so `super`
  resolves against the class whose method body is being lowered.

### Static inheritance and `instanceof`

- Static method resolution in `lowerClassMethodCall` (`ir.ts:2449-2458`) walks
  the base chain; `super.staticM()` inside a static method lowers to a direct
  call of `Base$static$m`. Static methods carry no `this` parameter today, so
  the supported surface covers base implementations that do not observe their
  receiver.
- Static fields inherit through the prototype-linked `C$statics` objects:
  `Derived.x` where `x` is declared on the base resolves to a dynamic access on
  the derived statics slot, and `objectGet`'s chain walk finds the base
  property.
- A new runtime helper `jsInstanceOf(i64 value, ptr prototype) -> i1` walks
  `objectGetPrototype` from the boxed value and pointer-compares each link
  against the class's prototype object. `lowerInstanceOfCondition` and the value
  positions feeding it extend to accept a class identifier from
  `activeClassRegistry` as the right-hand side; non-class right-hand sides keep
  the existing error-constructor path and diagnostics.

## Implementation Plan

### Phase 0 — `extends` and `super()` construction (#24)

Tracer bullet: flip `class-extends-super-constructor.ts` to native lowering.

- Parse the `extends` clause in `lowerClassDeclaration`: require a single
  `extends` type whose expression is an identifier resolving to an
  already-registered class in `activeClassRegistry`; record `baseName` on
  `ClassInfo`. Base-before-derived declaration order is required (forward
  references fall back).
- Emit prototype linkage at class definition: `objectSetPrototype(D$prototype,
  C$prototype)` after `lowerClassPrototypeStorage`. Extend
  `emitNewInstanceValueExpression` (`llvm.ts:4106`) to set the instance
  prototype from the class prototype slot; the `newInstance` op may need the
  prototype slot name or the linkage emitted as a separate IR operation.
- Rework `lowerClassConstructor` for derived classes: omitted constructor →
  synthesized parameter forwarding; explicit `super(...)` in first position →
  super call, then derived field stores, then remaining statements.
- Flip `class-extends-super-constructor.ts` to a native Node-oracle fixture and
  update `trace-map.test.ts:141-155` to expect `loweringMode: "native"`. Replace
  the fixture used by the fallback-rejection test (`trace-map.test.ts:181-185`)
  with one that still legitimately falls back.
- Add fixtures: omitted derived constructor with argument forwarding, field
  initialization order across three hierarchy levels, and `this`-before-`super`
  remaining a fallback.

### Phase 1 — Inherited instance methods and `super.method()` (#25)

- Add a chain-walking member resolver over `ClassInfo` (methods, getters,
  setters) and use it in `lowerClassMethodCall`, the getter path of
  `lowerClassValueExpression`, and the setter path of
  `lowerClassPropertyAssignment`.
- Add the enclosing-class context and lower `super.m(...)` in instance methods
  to a direct base-method call with the same `this`.
- Add Node-oracle fixtures: inherited method call, overriding shadowing,
  `super.m()` receiver correctness, inherited getter and setter dispatch.

### Phase 2 — Static inheritance and `instanceof` (#26)

- Walk the base chain for static method resolution; lower `super.staticM()` in
  static methods to a direct base static call.
- Prototype-link `C$statics` storage objects at class-definition time so
  inherited static fields resolve through `objectGet`'s chain walk; extend
  `lowerClassStaticFieldAccess` (`ir.ts:2415`) to accept members declared on
  base classes.
- Add the `jsInstanceOf` runtime helper to `src/compiler/runtime-helpers.ts`
  (definition plus dependency-table registration alongside the existing
  entries) and emit it from the extended `instanceof` lowering in `ir.ts` /
  `llvm.ts`.
- Flip `class-instanceof-inheritance.ts` to native lowering with trace-map
  `loweringMode: "native"`. Add fixtures: inherited static method and field,
  `super.staticM()`, multi-level `instanceof` including negative cases;
  `class-instanceof-plain-object.ts` must keep passing.

## Affected Components

- `src/compiler/ir.ts` — `ClassInfo` base metadata, heritage-clause acceptance
  in `lowerClassDeclaration`, derived-constructor lowering, chain-walking member
  resolution, `super` lowering with enclosing-class context, `instanceof`
  extension in `lowerInstanceOfCondition`.
- `src/compiler/llvm.ts` — `emitNewInstanceValueExpression` instance-prototype
  setup, `jsInstanceOf` emission, prototype-linkage emission.
- `src/compiler/runtime-helpers.ts` — `jsInstanceOf` helper and dependency-table
  registration; reuse of `objectSetPrototype`/`objectGetPrototype`/`objectGet`.
- `test/fixtures/` — flip `class-extends-super-constructor.ts` and
  `class-instanceof-inheritance.ts` to native; add the per-phase fixtures above.
- `test/integration/trace-map.test.ts` — update the fallback assertions at
  lines 141-155 and 181-185.
- `test/integration/runtime.test.ts` — extend the class fixture block at
  lines 1375-1389.

## Test Plan

- Node-oracle fixtures for every acceptance-criterion case, each compiled with
  trace-map `loweringMode: "native"` — compile a fixture and inspect
  `trace-map.json`, as `trace-map.test.ts` does.
- `npm run check`, `npm run lint`, and `npm test` green; `llvm-as` verification
  stays green across fixtures.
- Test262: the `statements` group in `test262/filters.json` already includes
  `language/statements/class` (Symbol- and `Symbol.hasInstance`-gated tests are
  filtered by `unsupportedFeatures`). Measure with
  `npm run build && node dist/test262/run.js --path language/statements/class`
  against the pinned checkout at `build/test262/checkout`, then the full
  `npm run test262:run`. The thresholds in `test262/baseline.json`
  (`minimumPass` 785, `maximumFail` 5, `maximumBehaviorMismatch` 4) must not
  regress; newly passing class tests should move the pass count up. Refresh the
  baseline with `npm run test262:baseline` only for legitimate classification
  changes.

## Acceptance Criteria

Mirrored from issues #24, #25, and #26:

- An omitted derived constructor forwards arguments to the base constructor. (#24)
- An explicit `super(...)` call forwards the given arguments before derived
  initialization. (#24)
- Instance fields initialize in Node's order across the hierarchy. (#24)
- `this` access before `super()` follows Node's observable behavior for the
  supported surface — in this slice, such constructors remain on the
  compile-time fallback rather than being mis-lowered. (#24)
- `class-extends-super-constructor.ts` matches Node with trace-map
  `loweringMode: "native"` and no compile-time fallback. (#24)
- A derived instance calls base-class methods it does not define. (#25)
- An overriding method shadows the base method for ordinary dispatch. (#25)
- `super.m()` inside a method reaches the base implementation with the derived
  `this`. (#25)
- Inherited getters and setters dispatch correctly through the chain. (#25)
- Node correctness-oracle fixtures cover each #25 case and report native
  lowering. (#25)
- A derived class resolves inherited static methods and fields. (#26)
- `super.staticM()` inside a static method reaches the base implementation. (#26)
- `x instanceof Base` is true for a `Derived` instance, matching Node. (#26)
- `class-instanceof-inheritance.ts` reports trace-map
  `loweringMode: "native"`. (#26)
- Typecheck, lint, Vitest, and LLVM verification pass. (#24, #25, #26)

## Non-Goals

- Class expressions (named or anonymous) and computed class members — issue #32.
- Private class fields (`#field`) and brand checks — issue #33.
- `extends` of anything other than a same-file class identifier: built-in
  constructors (`class E extends Error`), expression heritage, mixins.
- `this`-before-`super()` ReferenceError (TDZ) semantics; conditional or
  non-first-position `super(...)` calls; derived constructors returning
  replacement objects.
- Rest/spread argument forwarding for omitted derived constructors beyond the
  fixed-arity call convention.
- Virtual dispatch through real prototype-installed methods: method values
  extracted from instances and dynamic method lookup through the prototype
  object remain static-dispatch-only (this is why
  `class-prototype-method-lookup.ts` stays on the fallback in this slice).
- `Symbol.hasInstance` customization and `Function.prototype`/`Object.prototype`
  built-in prototype objects.
- Any change to the B683 compile-time interpreter itself; fallback behavior for
  out-of-scope files must remain exactly as today.

## Verification

- `npm run check` — typecheck.
- `npm run lint` — oxlint.
- `npm test` — Vitest, including the flipped trace-map assertions and the class
  fixture block in `test/integration/runtime.test.ts`.
- `npm run build && node dist/test262/run.js --path language/statements/class`
  — focused Test262 measurement for the slice.
- `npm run test262:run` — full filtered suite against the baseline thresholds.
- Direct fixture check: `node dist/cli/main.js test/fixtures/<fixture>.ts
  --out-dir <dir>` and confirm `"loweringMode": "native"` in the emitted
  `trace-map.json`, then run the produced executable against Node output.

## Risks

- **Static receiver resolution is fragile across the hierarchy.**
  `resolveReceiverClass` depends on registry names and the TypeScript checker;
  a base-typed binding holding a derived instance will dispatch to the base
  implementation, diverging from Node. The supported surface is same-class
  static types; mismatched static types that observably require virtual dispatch
  must fall back, not mis-lower.
- **Construction-order regressions.** Splitting derived construction at the
  `super(...)` call changes when field stores are emitted. Mitigation:
  dedicated field-order fixtures across three hierarchy levels compared against
  Node, and unchanged behavior for base classes.
- **Prototype mutation creates cycles or shared-state surprises.** Linking
  `D$prototype` → `C$prototype` and statics objects makes base members visible
  through derived objects; `objectSetPrototype` already guards against cycles,
  and the GC already traces prototype slots, but GC-stress and mutation fixtures
  should cover the linked objects.
- **Fallback coverage erosion.** Updating `trace-map.test.ts` removes the only
  assertion that class files *can* fall back; the replacement fixture must keep
  exercising the `ClassLoweringUnsupportedError` → B683 path.
