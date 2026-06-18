declare function print(value: unknown): void;

const left: unknown[] = ["a", "b"];
const right: unknown[] = ["c"];
const arr: unknown[] = [0, ...left, "tail", ...right];
print(arr.length);
print(arr[0]);
print(arr[1]);
print(arr[2]);
print(arr[3]);
print(arr[4]);
