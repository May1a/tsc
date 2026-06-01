declare function print(value: unknown): void;

const obj = { inner: { x: 1 } };
obj.inner.x = 42;
print(obj.inner.x);
