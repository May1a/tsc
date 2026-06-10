declare function print(value: unknown): void;

const proto: { "1"?: unknown } = { "1": "proto" };
const arr: unknown[] = ["zero", , "two"];
Object.setPrototypeOf(arr, proto);

print(arr["0"]);
print(arr["1"]);
print("0" in arr);
print("1" in arr);
print(Object.hasOwn(arr, "1"));
delete arr["2"];
print("2" in arr);
arr["3"] = "three";
print(arr["length"]);
print(arr[3]);
