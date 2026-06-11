declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
print(arr.at(0));
print(arr.at(-1));
print(arr.at(3));
