declare function print(value: unknown): void;

const arr: unknown[] = ["x", "y", "x", undefined];
print(arr.lastIndexOf("x"));
print(arr.lastIndexOf("z"));
print(arr.lastIndexOf(undefined));
