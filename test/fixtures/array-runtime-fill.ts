declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c", "d"];
arr.fill("x", 1, 3);

print(arr[0]);
print(arr[1]);
print(arr[2]);
print(arr[3]);

arr.fill("z");
print(arr[0]);
print(arr[3]);
