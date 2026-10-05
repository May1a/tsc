declare function print(value: unknown): void;

// A computed method name resolving to a constant. The plan recorded this as unsupported — "Object methods
// are not supported by known-shape numeric objects", a message about a numeric array that had nothing to
// do with the object in front of us — so the fixture is here to say the diagnostic no longer appears.
const literal = {
  ["m"](): number {
    return 1;
  }
};
print(literal.m());

// The same name through a `const`-bound key, which resolves at compile time rather than at runtime.
const methodName = "computed";
const fromBinding = {
  [methodName](): number {
    return 2;
  }
};
print(fromBinding.computed());

// A numeric computed key, whose value is a string key because a property key is always a string.
const numeric = {
  [0](): string {
    return "zero";
  }
};
print(numeric[0]());

// A symbol key. `Symbol.iterator` is a known constant here rather than an arbitrary expression, so the
// method lands on the key the iterator protocol looks for.
const iterable = {
  [Symbol.iterator](): number {
    return 3;
  }
};
print(iterable[Symbol.iterator]());

// A computed data key alongside a computed method, in one object, so the two key forms coexist.
const mixed = {
  base: 10,
  ["scaled"](): number {
    return 20;
  },
  [methodName]: 30
};
print(mixed.base);
print(mixed.scaled());
print(mixed[methodName]);
