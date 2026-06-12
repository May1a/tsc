declare function print(value: unknown): void;

const arr: unknown[] = [1, , 3];
print(arr.indexOf(undefined));
print(arr.lastIndexOf(undefined));
