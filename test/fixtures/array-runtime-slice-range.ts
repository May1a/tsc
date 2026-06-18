declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c", "d"];
const sliced: unknown[] = arr.slice(1, 3);
print(sliced.length);
print(sliced[0]);
print(sliced[1]);
print(arr.length);
print(arr[0]);
