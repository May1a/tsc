declare function print(value: unknown): void;

const obj = { inner: { x: 42 } };
print(obj.inner.x);
