declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3, 2, 1];
print(arr.indexOf(2, 2));
print(arr.indexOf(2, 4));
print(arr.lastIndexOf(2, 2));
print(arr.lastIndexOf(2, 99));
