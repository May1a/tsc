declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
delete arr[1];
delete arr[8];
print(arr.length);
print(arr[1]);
print(arr[2]);
