declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c", "d"];
const removed: unknown[] = arr.splice(1, 2);
print(removed.length);
print(removed[0]);
print(removed[1]);
print(arr.length);
print(arr[0]);
print(arr[1]);
