declare function print(value: unknown): void;

const arr = JSON.parse('["a", 2, false, null]');
print(arr.length);
print(arr[0]);
print(arr[1]);
print(arr[2]);
print(arr[3]);
