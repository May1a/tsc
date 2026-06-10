declare function print(value: unknown): void;

const arr: unknown[] = [undefined];
delete arr[0];
arr[0] = "zero";
arr[9] = "nine";
arr[10] = "ten";
arr[12] = "twelve";
arr[123] = "big";

const keys: unknown[] = Object.keys(arr);
print(keys.length);
print(keys[0]);
print(keys[1]);
print(keys[2]);
print(keys[3]);
print(keys[4]);
