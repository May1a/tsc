declare function print(value: unknown): void;

const arr: unknown[] = ["zero", "one", "two"];
delete arr[1];
const names: unknown[] = Object.getOwnPropertyNames(arr);

print(names.length);
print(names[0]);
print(names[1]);
print(names[2]);
