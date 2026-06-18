declare function print(value: unknown): void;

const left = [1, 2];
const right = [3];
const arr = [0, ...left, ...right, 4];
print(arr.length);
print(arr[0]);
print(arr[1]);
print(arr[2]);
print(arr[3]);
print(arr[4]);
