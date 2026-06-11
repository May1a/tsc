declare function print(value: unknown): void;

const arr: unknown[] = ["zero"];
const missing = Object.getOwnPropertyDescriptor(arr, "1");

print(missing === undefined);
