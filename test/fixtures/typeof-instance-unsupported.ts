declare function print(value: unknown): void;

class C {
  v = 1;
}

const c = new C();

// `typeof` is answered statically from the binding, and an instance binding carries no static type
// name: the refusal names the operand rather than the condition around it.
if (typeof c !== "object") {
  print(1);
} else {
  print(2);
}
