declare function print(value: unknown): void;

const base: unknown[] = ["a"];
const arr: unknown[] = [...base, "b"];
print(arr.length);
print(arr[0]);
print(arr[1]);
