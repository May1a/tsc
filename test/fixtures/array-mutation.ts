declare function print(value: unknown): void;

const arr = [1, 2, 3];
arr[1] = 99;
print(arr[1]);
