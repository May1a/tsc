declare function print(value: unknown): void;

// A `this: T` parameter is a type-only annotation. It must not occupy a runtime argv slot, or
// the declaration and the call site disagree about arity.
function f(this: void, x: number): void {
  print(x);
}

f(7);
print("done");
