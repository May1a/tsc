declare function print(value: unknown): void;

const arr: unknown[] = [undefined, , "x"];
arr[4] = "y";
delete arr[2];
arr.length = 6;

const values: unknown[] = Object.values(arr);
print(values.length);
print(values[0]);
print(values[1]);
print(values[2]);
