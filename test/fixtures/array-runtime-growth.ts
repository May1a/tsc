declare function print(value: unknown): void;

const arr: unknown[] = [1, , 3];
arr[5] = "x";
print(arr.length);
print(arr[4]);
print(arr[5]);
