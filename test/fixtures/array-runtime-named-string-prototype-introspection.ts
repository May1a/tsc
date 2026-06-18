declare function print(value: unknown): void;

const proto: { name?: unknown } = { name: "proto" };
const arr: any = ["zero"];

Object.setPrototypeOf(arr, proto);
const protoKeys: unknown[] = Object.keys(arr);
const protoValues: unknown[] = Object.values(arr);
print(protoKeys.length);
print(protoValues.length);
arr["name"] = "own";
const ownKeys: unknown[] = Object.keys(arr);
const ownValues: unknown[] = Object.values(arr);
print(ownKeys.length);
print(ownKeys[1]);
print(ownValues.length);
print(ownValues[1]);
