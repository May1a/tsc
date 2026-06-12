declare function print(value: unknown): void;

const base: unknown[] = ["a", , "c"];
const arr: unknown[] = [...base, "d"];
const keys: unknown[] = Object.keys(arr);
print(arr.length);
print(arr[1]);
print(keys.length);
