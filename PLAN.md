# Make ordinary programs compile, and compile correctly

## Goal

Two silent miscompiles reach ordinary programs today. Fix those first. Then admit the shapes that
ordinary TypeScript programs hit in their first ten lines: a counter closure, a `number[]` literal
that is later sorted, a field that holds an array, and a variable that is later assigned `null`.

The previous plan covered the support manifest, `Lowered`, total handler tables and the module split. It is in
git as `ff1513f:PLAN.md`.

## Evidence

Measured on 2026-10-11 against `ff1513f`. About 75 small probe programs were compiled with
`dist/cli/main.js`. Each one that produced a binary was run and compared against the same source
transpiled by TypeScript and run under Node. Test262 was rerun with `--classification coverage-gap`
so that each refused test carries its diagnostic.

**Test262.** 987 pass, 0 fail, 3,280 coverage-gap, 19,719 skip. The `class` family alone accounts
for 1,559 of the gaps. Generators account for 1,324 skips, and the async families for about 1,400 more.

**Half the gaps do not name their cause.** 1,652 of the 3,280 gap tests report only
`Unsupported statement in the current lowering slice: <Kind>` or
`Unrecognized call target: __t262SameValue()`. The specific refusal is lost on the way out and is
attributed to the enclosing statement or call. Two of them, read by hand:

- `language/statements/continue/no-label-continue.js` is refused because its `for` has no update
  clause.
- `language/statements/for-of/array-expand.js` is refused because `var second = 1` is later
  assigned `null`.

**Probe results.**

| Program | Result |
| --- | --- |
| `print(1234567)` | prints `1.23457e+06` |
| `String(12586269025) === "12586269025"` | `false` |
| `print(0.1 + 0.2)` | prints `0.3` |
| `this.area()` in a base method, overridden in a subclass | `TypeError: value is not a function` |
| `const xs: S[] = [new Sq()]; xs[0].area()` with `area` overridden | base result `0`, not `4` |
| `let a: number \| null = 0; a = null;` | refused |
| `const a = [3, 1, 2]; a.join(",")` | refused: array method calls need a runtime array |
| `class B { items: number[] = []; add(x) { this.items.push(x) } }` | refused |
| `let n = 0; const inc = () => ++n;` | refused |
| `counts[w] = (counts[w] ?? 0) + 1` on `Record<string, number>` | refused |
| `for (let x = 0; x < 3;) { x++; }` | refused |
| `class MyErr extends Error {}` | refused: `Error` is not a class declared in this module |
| `console.log("hi")` | refused |

Getters, setters, private fields, `Map`, `Set`, `JSON`, regular expressions, object spread, optional
chaining, destructured parameters, higher-order generic functions and parameter properties all
agreed with Node.

## Non-goals

- No new value representation. Boxed JSValues, Number, String and fixed aggregates stay the storage
  kinds. Workstream 2 changes which kind a binding *receives*, not the set of kinds.
- No use of the type checker for representation choice. Storage is derived from the writes the
  lowering sees.
- No regression in the Test262 baseline (`test262/baseline.json`): `minimumPass` only rises,
  `maximumFail` and `maximumBehaviorMismatch` stay 0.

## Workstreams

Each step ends green and is separately revertable. Each admitted feature lands with an oracle
fixture in `test/fixtures/` that is listed in `oracleFixtures` (`test/integration/oracle.ts`), and with
any support manifest entry it moves from `"planned"` to `"supported"`.

### 0. The two miscompiles

**0a. Number to String.** ECMA-262 `Number::toString(10)` produces the shortest decimal string that
round-trips to the same double. The runtime uses `%g`, which keeps six significant digits, at four
sites:

- `values.ll:637` (`print` of a number, through `@.value.fmt.number`)
- `values.ll:720` (`valueToString`, through `@.tostring.fmt.number`)
- `numbers.ll:160` (`@.number.fmt.default`)
- `json.ll:303` (`JSON.stringify`, through `@.json.fmt.number`)

`globals.ll:2` declares a fifth `%g` constant.

Add one runtime function to `numbers.ll`, `numberToShortestString(double) -> { ptr, i64 }`, and
route all four sites through it. Find the shortest precision `p` in 1 through 17 whose `%.*e` output
parses back to the same double through `strtod`. Then lay out its digits and exponent following the
`Number::toString` steps:

- `NaN`, `Infinity`, `-Infinity`, and `"0"` for both zeros
- plain decimal for exponents 1e-7 ≤ |x| < 1e21
- otherwise `d.ddde+N` or `d.ddde-N`

Regenerate the contract catalog with `npm run runtime:contracts`.

The fixture covers 1234567, 12586269025, 0.1 + 0.2, 1e21, 1e-7, 123e-20, -0, 2 ** 53, 5e-324,
`Number.MAX_VALUE` and the `String`, template and `JSON.stringify` paths. `toFixed`, `toPrecision` and
`toExponential` keep their explicit-precision formats.

**0b. Overridden methods.** `lowerClassMethodCall` (`ir/class-calls.ts`) resolves the method through
`findClassInChain` on the receiver's static class and emits a direct `call` to
`classMethodFunctionName(definingClass.name, ...)`. That is correct only when no class declared in the
module overrides the method below the receiver's static class. In every other case it binds the
base implementation:

- `this.m()` inside a base method
- a call through a base-typed binding
- a call on an element of a base-typed array

When some subclass overrides the method, the call must dispatch through the instance's prototype
chain, the object `classPrototypeName` names. The direct call stays when no override exists, which
keeps today's fast path and byte-identical output for every existing fixture.

Find out why `this.area()` reports `TypeError: value is not a function` rather than the base result.
The two symptoms may have one cause or two.

The fixture includes a three-level chain, an override that calls `super.m()`, dispatch through `this`,
through a base-typed `const`, and through a `for...of` over a base-typed array.

**0c. Optional calls on a nullish receiver.** Found while verifying 0b. `o?.f()` throws
`TypeError: value is not a function` when `o` is `undefined`. This happens for a plain object, for a
class instance, and with or without an override. Node yields `undefined` without evaluating the
arguments. The optional-call lowering (`ir/optional-call.ts`, `ir/optional-chains.ts`) has to
short-circuit on the receiver's nullish check, not only on the callee's.

The fixture covers `o?.f()` and `o?.f(sideEffect())` on `undefined` and `null`, the chained form
`a?.b.f()`, and the optional call `o.f?.()`.

**0d. Untyped call results printed as numbers.** Found while verifying workstream 2.
`const f: any = () => "x"; print(f())` prints `NaN`. The same happens for `for (const f of fns) f()`
over an `any[]`, for a callee typed `() => unknown`, and for a spread call to a function returning
`any`. `lowerNumberCallExpression` claimed every call whose checker type is `any` or `unknown`, and
coerced the result with `valueToNumber`. `print` tries the number tier before the value tier.

A call through a boxed callee is now claimed only when its static type is a number. A call to a
declared function is still claimed under `any`, because its return kind is known and the checker
types a recursive call in an unannotated function as `any`. The fixture is
`call-untyped-result-not-number.ts`.

`f() * 2` with an `any`-typed `f` is now refused, as `v * 2` with an `any`-typed `v` already was.
Arithmetic operands need a ToNumber coercion of boxed values, including `valueOf`, before either can
be admitted.

**0e. `const` re-evaluated at every read.** Found while verifying workstream 2. `updateConstBindings`
recorded a `const` by its initializer expression, and every read through an expression tier inlined
it. `let n = 1; const m = n * 10; n = 2; return m` returned `20`, and `const a = ++i` incremented `i`
at every read of `a`. This affected numbers, strings, booleans and values, inside functions and at
module scope through another `const`. The Test262 harness already worked around it in
`verifyProperty`.

A `const` is now inlined only when its initializer is stable: constants, parameters, aggregate
references and effect-free operators over them (`stable-expressions.ts`). Any other `const` is
read from the slot its declaration stored. The fixture is `const-snapshot.ts`.

**0f. Stores through an unchecked boxed receiver.** Found with 0e. `valueObjectSet`, `valueArraySet`,
`valueArraySetLength` and `valueArrayDelete` turn the receiver's bits into a pointer without
checking its tag. `isProvenBoxedAggregateBinding` admits an element read of an `any[]` as proof of an
object, so `const t = xs[0]; t["k"] = 1` with `xs = [5]` writes through a number and the process
dies silently. Assigning to a property of `undefined` dies instead of throwing a `TypeError`.

Make those helpers dispatch on the receiver's tag with the language's semantics, then accept any boxed
binding as a receiver. Then remove the 0e exception in `isShapeRecognizedReceiver`. For now, a
`const` initialized by an element read, or by `new Number`/`Boolean`/`String`, is still re-evaluated
at every read, so `n === n` is `false` for such a wrapper.

**0g. Array methods through a boxed value.** Found while verifying workstream 2. A method call on a
boxed value that holds an array takes the generic dynamic-call path, and the runtime array has no
property of that name. `for (const row of [[1, 2], [3]]) print(row.join("-"))` throws
`TypeError: value is not a function`. A runtime array receiver has to reach the array builtins,
either by a tag check before the dynamic call or by array prototype methods in the runtime.

**0h. Class methods missing from the prototype.** Found while verifying workstream 2. 0b installed only
overridden methods on a class prototype, so `obj["m"]()` threw `TypeError: value is not a function`
for any other method, and `inst.hasOwnProperty(k)` did the same. Every instance method is now
installed (`lowerPrototypeMethodStores`), and `hasOwnProperty` on a boxed receiver lowers to
`runtimeObjectHas`. Other `Object.prototype` methods called through a class instance, such as
`toString` or `isPrototypeOf`, still throw, because the runtime has no `Object.prototype` functions.
That belongs with 0g. The fixture is `class-method-dynamic-access.ts`.

0d drops the Test262 floor from 1,013 to 1,012, and 0e restores it to 1,013. `language/statements/function/S13.2.1_A7_T2.js` passed
only because `var x = __func()` bound `x` to `valueToNumber(null)`, which is `0`, and the test never
reads `x`. It is now refused, because a `var` cannot hold a boxed value yet. Workstream 2 admits it.

### 1. Refusal reasons reach the diagnostic

1,652 Test262 gaps carry only a generic message. Find each place where an inner `unsupported` is
replaced by `Unsupported statement in the current lowering slice` or `Unrecognized call target`. These
include call-argument lowering for user functions and the statement-list fallback. Propagate the inner
reason with `withRefusal`, which `class-calls.ts` already does for method arguments.

The generic message stays only for a shape that no recognizer claimed.

Rerun the gap census when this lands. Its counts are the input for ordering workstreams 2 and 3.

In the same step:

- Admit a `for` statement without an update clause, and without a condition. Both are refused today.
- Add a test asserting that every fixture named `*-unsupported.ts` produces `TSCN1002`. At least
  four of them no longer do (`class-expression-unsupported`, `class-getter-unsupported`,
  `class-private-field-unsupported`, `class-computed-field-unsupported`). Rename those, and add them to
  the oracle, since they now compile.

**Lint proposal.** Add `fixture-name-matches-outcome`: a fixture named `-unsupported` must be refused,
and a `defect-` fixture must be listed in a test that asserts the defect.

**Census after workstream 1** (2026-10-11): 1,013 pass, 0 fail, 3,254 coverage-gap. 4 gap tests carry
only a generic message. Each figure below is the number of tests whose *first* diagnostic, which is the
likely root cause, is that reason.

| Tests | First diagnostic | Workstream |
| --- | --- | --- |
| 520 | a `let` or `var` binding cannot hold an object literal (199), a class instance (177), or another value (144) | 2 |
| 467 | `X` cannot be used as a value yet: builtin constructors such as `ReferenceError` or `Test262Error` used as values | 3.4 |
| 255 | method names must be identifiers, string literals, or computable from constants | 3.3 |
| 205 | a variable declaration without an initializer | 2 |
| 255 | parameters with defaults (137) and destructuring parameters (118) on class members | 3.1 |
| 134 | a `for...of` item declared with something other than `const` | 2 |
| 129 | multiple bindings in one declaration | 1 (follow-up) |

Workstream 2 comes first, as planned. Every `let` or `var` that holds a non-scalar is refused, and that
is the largest single cause.

### 2. Storage from every write

A binding's storage is chosen from its initializer and never widened. Each write or use that does not
fit the initializer's kind is refused rather than demoting the binding to a boxed slot.

Make storage a fact derived from all writes and uses before native lowering:

- A Number or String binding stays specialized only when every write produces that kind. Any other
  write demotes it to a boxed `value` binding.
- A fixed numeric array stays fixed only when every use is an indexed numeric read or write, or
  `length`. A method call, an escape to a function, or a non-number element demotes it to a runtime
  array.
- The same rule applies to fixed-shape objects that gain a dynamic key, and to class fields that hold
  arrays.
- A mutable `let` captured by a closure receives a boxed environment cell, which `CONTEXT.md`
  describes as already supported. Find out why `let n = 0; const inc = () => ++n;` and the counter
  closure are still refused.

  Done (2b). Lowering removed every mutable scalar from a nested function's bindings, and most
  nested-function forms carried no capture list, so no environment cell was ever created. Captured
  `let`, `const`, loop items and `catch` bindings declared inside a loop now get a fresh cell each
  time their declaration runs (`perIteration`). A `for (let ...)` header is copied into a fresh cell
  before each update, as ECMA-262 CreatePerIterationEnvironment requires. A `var` is one cell per
  frame: `let`-path operations carry `functionScoped`, and resolution gives them the `var` kind.

- Done (2a) for scalars and boxed values. `storage-plan.ts` reads every write to every `let` and
  `var` of a source file before it lowers, classifying each write from syntax. A binding written
  only by its initializer keeps the representation its initializer chooses. A binding without an
  initializer, or with a later nullish, non-scalar or differently-typed scalar write, is boxed
  (`letValue`, `assignValue`). Undecided writes, such as a call, change nothing and are refused
  where they do not fit. A non-scalar `let` initializer with no later write lowers to a boxed slot.
  A statement may declare several bindings, a `for` header may declare any of them, and a
  `for...of` or `for...in` item may be a `let`. The number tier reads a boxed binding as a number
  where the checker proves its type is `number`.

  Still open in 2a: a `let` holding a `Map`, `Set` or error (a `const` keeps those in aggregate
  storage); a `var` loop item; and `typeof` on a boxed value, which only the string tier answers, at
  compile time. A runtime `typeof` belongs with workstream 5.

Where it lives: Lowering records a `JsIrBindingValue` per declaration. A pre-pass over the function body
or module collects the writes and uses per declaration and chooses the representation before the
statements are lowered. The representation must not be patched afterwards. Native lowering continues
to read resolved storage descriptions and gains no source-name lookup.

The fixtures cover every probe row of this kind in the evidence table.

### 3. Class members, then classes as values

Ordered by Test262 gap counts:

1. Class members get function parameter parity: default parameters (173 gaps) and destructured
   parameters (146). Function declarations already support both.
2. Static accessors (36), private methods and accessors (22), and static private fields (82).
3. Computed method and accessor names (287 + 118). Class fields already handle computed keys through
   `ClassComputedKeyInfo`.
4. Classes as boxed values: `const K = A`, unbound class expressions (66), and `extends` of a class not
   declared in the module (115), starting with `Error`. The manifest names this as the prerequisite
   for `new.target` and decorators.

### 4. Generators, then async

Lower a generator to a state machine whose locals live in a heap frame object traced by the GC, with
`yield` points as resumption labels. Do not use LLVM coroutine intrinsics: their frames would hide
live heap values from the GC-root verifier. `return` and `throw` on the generator object reuse the
completion edges `ControlFlow` already owns.

Async then becomes generator lowering plus `Promise` and a microtask queue that drains before `main`
exits.

Generators unblock `*[Symbol.iterator]()` in classes and 1,324 Test262 skips. Remove `generators` from
`unsupportedFeatures` in `test262/filters.json` when they land.

### 5. Builtin breadth

`console.log` first: almost every real program uses it, and it is refused outright. Its formatting of
objects and arrays follows Node's `util.inspect` closely enough for the oracle, so start with
primitives and arrays of primitives.

Then the `"planned"` manifest entries:

- Array: `every`, `some`, `findLast`, `findLastIndex`, `toSorted`, `toReversed`, `toSpliced`, `with`
- Function: `call`, `apply`, `bind`
- Math: `tan`, `asin`, `acos`, `atan`

### 6. Frontend: ambient types from the working directory

Compiling a standalone file without a tsconfig from inside this repository loads `bun-types` from
the repository's own `node_modules`, and the compile fails with TS2694 before lowering. The default
compiler options in `frontend.ts` should not pick up `@types` from the working directory when no
tsconfig selects them.

## Sequence

1. 0a, 0b and 0c, independently.
2. 1, then rerun the census.
3. 2.
4. 3.1 and 3.2, then 3.3, then 3.4.
5. 6, and 5's `console.log`, whenever convenient. Both are independent of everything above.
6. 4.

## Verification

After every step:

1. `npm run check`
2. `npm run lint`
3. `npm test`
4. `npm run test262:run -- --baseline test262/baseline.json` must report no regressions. Raise
   `minimumPass` when a step admits tests.

## Completion criteria

- Every row of the evidence table either agrees with Node or names its specific limitation.
- No Test262 gap reports only a generic message.
- The `class` family's coverage gap is below 600.
- Generators are removed from `unsupportedFeatures` and their tests pass.
