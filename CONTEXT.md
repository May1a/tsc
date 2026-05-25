# tsc

This project is a native compiler for TypeScript programs. It preserves JavaScript-compatible behavior for the supported language while producing native executables instead of JavaScript output.

## Language

**JavaScript-compatible native TypeScript**:
TypeScript source code compiled to a native executable while preserving JavaScript runtime behavior for the supported language. This project excludes `eval` and `with` by design.
_Avoid_: Full JS semantics, JavaScript replacement, TypeScript-to-JavaScript compiler

**Compiler runtime**:
The runtime support required by compiled programs for JavaScript values, objects, functions, memory management, errors, and platform interaction.
_Avoid_: Standard library, shim, polyfill

**Native CLI subset**:
The initial execution environment for compiled programs, covering command-line process behavior rather than browser or Node compatibility.
_Avoid_: Node-compatible runtime, browser runtime

**Synchronous runtime milestone**:
The first runtime milestone focused on synchronous JavaScript behavior before asynchronous promises and microtasks are supported.
_Avoid_: MVP runtime, full runtime

**Correctness oracle**:
The external behavior used to decide whether compiled output matches expected JavaScript behavior.
_Avoid_: Golden output, test baseline

## Flagged Ambiguities

**Full JS semantics**:
This phrase is ambiguous because the project intentionally excludes `eval` and `with`. Use **JavaScript-compatible native TypeScript** instead.

## Example Dialogue

Dev: Should this feature be part of the synchronous runtime milestone?

Domain expert: Only if it is needed for synchronous JavaScript-compatible native TypeScript. Promise scheduling belongs after that milestone.

Dev: Should the first target behave like Node?

Domain expert: No. The first target is the native CLI subset; Node compatibility is a separate concern.
