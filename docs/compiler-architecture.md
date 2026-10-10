# Compiler architecture

The production pipeline separates AST recognition, binding resolution, native
lowering, LLVM construction, verification, and rendering. Each pass consumes the
preceding model. Domain handlers receive operations from state owners instead of
a universal mutable context.

## Binding resolution

`resolveBindings` consumes `JsIrModule` and assigns lexical declarations opaque
`BindingId` identities. Function bodies have `FunctionId` identities. References
carry their resolved representation and location. Source spellings remain for
diagnostics and observable function names, never backend lookup.

Resolution predeclares lexical scopes and records parameters, captures, catches,
loops, and module declarations. `ModuleBindings` allocates their physical storage
before body emission. Number storage remains double precision. String storage
retains byte and length slots with a boxed GC owner. Fixed aggregate layouts remain
specialized, with stable object shadows where runtime identity is observable.
Captured mutable bindings share environment cells. Module owners use global roots.

## Native lowering

`emitNativeModule` consumes `ResolvedModule` and builds typed functions and blocks.
The operation and four expression unions have total handler tables. Adding a
variant without a handler fails typechecking. Recognition fallthrough belongs only
to AST Lowering's `Lowered` result.

`NativeModule`, `FunctionCursor`, and `ControlFlow` own symbols, instruction
positions, and completion destinations. Their private state belongs to one
compilation. Handler capabilities expose readonly references and named operations.

Generated functions use the uniform `argc`, `argv`, `environment`, and `thisValue`
ABI, with boxed arguments and a `{ i64, i1 }` completion result. Parameter
initialization restores proven Number and String representations. Function objects
own captures and callable addresses. Module function declarations and tagged
templates use global caches. Function expressions and nested declarations create
fresh objects each time their enclosing code runs.

Return, throw, break, continue, `finally`, and IteratorClose become explicit CFG
edges and payload storage. Completion-producing calls require an exception edge.
General property reads check nullish receivers and dispatch by value kind.

## LLVM construction and rendering

The closed instruction model takes typed operands and owned block labels.
Function sealing checks signatures, ownership, terminators, predecessors, phi
inputs, and SSA dominance across the whole graph. Module sealing freezes verified
data before rendering. The renderer consumes no AST, JavaScript IR, or binding
resolution logic.

Static Runtime IR remains in `.ll` files. The compiler boundary supplies immutable
fragments through `createLlvmModule({ staticRuntime })`. Generated functions cannot
append text. Trace provenance belongs to typed instructions, and rendering derives
line ranges from that provenance.

## Runtime contracts and garbage collection

Runtime contracts derive signatures from Static Runtime IR and propagate effects
through its call graph. They classify semantic results and pointer ownership.
`npm run runtime:contracts` regenerates the catalog and reports its current size.
The lint command checks freshness.

The runtime-call capability checks operands and fulfills completion and root
requirements. Indirect calls conservatively allocate and collect. GC verification
uses backward SSA liveness and forward root analysis on finished functions. Every
heap argument and heap value live across a collecting call needs protection on
every incoming path. Phi edges and root restoration participate in that analysis.
Root frame verification checks joins and exits. A failure prevents rendering.

## Verification contract

`npm run check`, `npm run lint`, and the compiler tests must pass. Native fixtures
preserve lexical shadowing, closures, exceptions, `finally`, IteratorClose, inline
C++, GC, and trace maps. The correctness oracle compares observable native behavior
with Node. Typed builder tests verify ownership and CFG properties. GC tests force
real collections and retain literal output expectations.

A syntax lint cannot prove GC liveness. Matching source names or exact temporary
names in LLVM text cannot prove rooting behavior. Typed graph checks and native
execution provide separate evidence for those properties.
