declare function print(value: unknown): void;

const arr: unknown[] = ["b", "c"];
print(arr.unshift("a"));
print(arr.length);
print(arr[0]);
print(arr[1]);
