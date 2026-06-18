declare function print(value: unknown): void;

const arr: unknown[] = [undefined, , "x"];
arr[4] = "y";
delete arr[2];
arr.length = 6;

const keys: unknown[] = Object.keys(arr);
print(keys.length);
print(keys[0]);
print(keys[1]);
print(keys[2]);
