declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b"];
arr.splice(1, 0, "x", "y");
print(arr.length);
print(arr[0]);
print(arr[1]);
print(arr[2]);
print(arr[3]);
