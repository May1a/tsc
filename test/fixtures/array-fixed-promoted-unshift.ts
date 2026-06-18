declare function print(value: unknown): void;

const arr = [1];
arr.unshift(0);

print(arr.length);
print(arr[0]);
print(arr[1]);
