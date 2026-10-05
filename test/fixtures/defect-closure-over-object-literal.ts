declare function print(value: unknown): void;

// This program is here because it makes the compiler fail in a way that used to be invisible: it exits 1
// with nothing on stdout or stderr. Reading a field of an object literal from inside a function lowers to
// a path-based numeric access, and the layout that access needs is registered when `@main` is emitted —
// which happens *after* the function definitions. So the emitter cannot resolve it.
//
// The shape is correct TypeScript and correct JavaScript. What is wrong is the emission order in
// `src/compiler/llvm/module.ts`: `fnLines` is assembled before `mainLines` while both consume the same
// counters, so fixing it means reordering and accepting that every `main.ll` changes.
//
// The point of the fixture is the exit status and the message: `cli.test.ts` asserts that a compiler
// failure says something, so an internal error can never again be silent.
const shape = { inner: 5 };

function read(): number {
  return shape.inner;
}

print(read());
