declare function print(value: unknown): void;

const arr: unknown[] = ["b", , "d"];
print(arr.unshift("a"));
print(arr[0]);
print(arr[2]);
print(arr.shift());
print(arr.length);
print(arr[1]);
