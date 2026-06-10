declare function print(value: unknown): void;

const arr: unknown[] = ["x", , undefined];
delete arr[0];

print(arr.hasOwnProperty("0"));
print(arr.hasOwnProperty("2"));
print(arr.propertyIsEnumerable("2"));
