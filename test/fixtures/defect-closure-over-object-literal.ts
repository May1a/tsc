declare function print(value: unknown): void;

// This program is here because it makes the compiler fail in a way that used to be invisible: it exited 1
// with nothing on stdout or stderr. It is also the smallest witness of a real gap in capture lowering.
//
// The shape is correct TypeScript and correct JavaScript. What is wrong is that a function body
// referring to an outer *object* binding resolves the reference as a frame slot rather than through the
// capture environment. `lowerCapturedBindingValue` does record the capture, as an `objectRef`; but
// `emitReferenceValueExpression` turns an `objectRef` into `emitRuntimeObjectPointer`, which is a plain
// SSA name derived from the binding (`%Config.addr`). Inside the generated function nothing allocated
// that slot, so the read names a value that does not exist.
//
// An earlier version of this comment blamed the emission order in `src/compiler/llvm/module.ts` — that
// `fnLines` is assembled before `mainLines` — and the plan's own record of a wrong reason applies: the
// reordering was tried and changed every `main.ll` without fixing this. The layout is not the problem.
//
// The point of the fixture is also the exit status and the message: `cli.test.ts` asserts that a compiler
// failure says something, so an internal error can never again be silent.
const shape = { inner: 5 };

function read(): number {
  return shape.inner;
}

print(read());
