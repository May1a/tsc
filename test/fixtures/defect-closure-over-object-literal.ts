declare function print(value: unknown): void;

// An enclosing fixed object remains readable from a generated function.
const shape = { inner: 5 };

function read(): number {
  return shape.inner;
}

print(read());
