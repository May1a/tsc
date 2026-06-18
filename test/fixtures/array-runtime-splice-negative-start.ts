declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
const removed: unknown[] = arr.splice(-2, 1);
print(removed.length);
print(removed[0]);
print(arr.length);
print(arr[0]);
print(arr[1]);
