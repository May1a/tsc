declare function print(value: unknown): void;

const arr: unknown[] = ["zero", "one", "two"];
const lengthDesc = Object.getOwnPropertyDescriptor(arr, "length")!;

print(lengthDesc.value);
print(lengthDesc.writable);
print(lengthDesc.enumerable);
print(lengthDesc.configurable);
