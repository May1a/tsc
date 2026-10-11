declare function print(value: unknown): void;

class C {
  v = 1;
}

// A `const` can hold the instance, but a `var` keeps the representation of its initializer, so the
// declaration names the storage limit rather than the declaration around it.
var c = new C();
print(c);
