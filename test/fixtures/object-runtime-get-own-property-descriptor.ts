declare function print(value: unknown): void;

const obj: { fixed?: unknown } = {};
Object.defineProperty(obj, "fixed", { value: "value", writable: false, enumerable: true, configurable: false });
const desc: { value?: unknown; writable?: unknown; enumerable?: unknown; configurable?: unknown } = Object.getOwnPropertyDescriptor(obj, "fixed")!;

print(desc.value);
print(desc.writable);
print(desc.enumerable);
print(desc.configurable);
