declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b"];
arr.copyWithin(-1, 0, 1);
print(arr[0]);
