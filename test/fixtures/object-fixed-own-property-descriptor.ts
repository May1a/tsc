declare function print(value: unknown): void;

const obj = { x: 1 };
const desc: any = Object.getOwnPropertyDescriptor(obj, "x");
const missing: any = Object.getOwnPropertyDescriptor(obj, "missing");
print(desc.value);
print(desc.writable);
print(desc.enumerable);
print(desc.configurable);
print(missing);
