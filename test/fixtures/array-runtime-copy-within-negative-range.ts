declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c", "d"];
arr.copyWithin(-2, 0, 2);
print(arr[0]);
print(arr[1]);
print(arr[2]);
print(arr[3]);
