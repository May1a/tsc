declare function print(value: unknown): void;

const arr: unknown[] = ["a"];
arr.fill("x", -1, 1);
print(arr[0]);
