declare function print(value: unknown): void;

const proto: { name?: unknown } = { name: "proto" };
const arr: any = [];

Object.setPrototypeOf(arr, proto);
print(arr["name"]);
print(Object.hasOwn(arr, "name"));
arr["name"] = "own";
print(arr["name"]);
print(Object.hasOwn(arr, "name"));
delete arr["name"];
print(arr["name"]);
print(Object.hasOwn(arr, "name"));
