declare function print(value: unknown): void;

const root: { value?: unknown } = { value: "root" };
const child: { value?: unknown } = Object.create(root);
const got: { value?: unknown } = Object.getPrototypeOf(child);
print(got.value);

const a: { marker?: unknown } = { marker: "a" };
const b: { marker?: unknown } = Object.create(a);
Object.setPrototypeOf(a, b);
print(b.marker);
