declare function print(value: unknown): void;

const arr: unknown[] = ["zero"];
const desc: { value?: unknown; writable?: unknown; enumerable?: unknown; configurable?: unknown } = Object.getOwnPropertyDescriptor(arr, "0")!;

print(desc.value);
print(desc.writable);
print(desc.enumerable);
print(desc.configurable);
