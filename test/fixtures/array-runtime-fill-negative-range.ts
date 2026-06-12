declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
arr.fill("x", -2, -1);
print(arr[0]);
print(arr[1]);
print(arr[2]);
