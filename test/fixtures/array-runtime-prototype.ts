declare function print(value: unknown): void;

const proto: { "1"?: unknown; "3"?: unknown; shadow?: unknown } = { "1": "one", "3": "three" };
const arr: unknown[] = ["zero", , undefined];
Object.setPrototypeOf(arr, proto);

print(arr[0]);
print(arr[1]);
print(arr[2]);
print(arr[3]);
print(arr[4]);
