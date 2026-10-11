declare function print(value: unknown): void;

class C {
  v = 1;
}

// A `var` holds a class instance in a boxed slot, as a `const` does.
var c = new C();
print(c);
