declare function print(value: unknown): void;

const first: { value?: unknown } = {};
first.value = "first";
const second: { value?: unknown } = {};
second.value = "second";
const obj: { value?: unknown } = Object.create(first);
print(obj.value);
Object.setPrototypeOf(obj, second);
print(obj.value);
Object.setPrototypeOf(obj, null);
print(obj.value);
