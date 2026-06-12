declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
delete arr[1];
arr.reverse();

print(arr[0]);
print(arr[1]);
print(arr[2]);
print(Object.hasOwn(arr, "1"));
