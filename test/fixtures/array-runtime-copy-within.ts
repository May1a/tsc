declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c", "d", "e"];
delete arr[3];
arr.copyWithin(1, 2, 5);

print(arr.length);
print(arr[0]);
print(arr[1]);
print(arr[2]);
print(arr[3]);
