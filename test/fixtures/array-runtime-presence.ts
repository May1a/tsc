declare function print(value: unknown): void;

const arr: unknown[] = [undefined, , "x"];
delete arr[2];
print(0 in arr);
print(Object.hasOwn(arr, 0));
print(1 in arr);
print(Object.hasOwn(arr, 1));
print(2 in arr);
print(Object.hasOwn(arr, 2));
print(9 in arr);
