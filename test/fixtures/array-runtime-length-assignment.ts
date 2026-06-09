declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
arr.length = 1;
print(arr.length);
print(arr[1]);
arr.length = 4;
print(arr.length);
print(arr[2]);
arr[3] = "d";
print(arr[3]);
