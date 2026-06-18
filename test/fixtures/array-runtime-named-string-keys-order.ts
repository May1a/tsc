declare function print(value: unknown): void;

const arr: any = [];
arr[2] = "two";
arr["name"] = "named";
arr["01"] = "leading";
const keys: unknown[] = Object.keys(arr);
print(keys.length);
print(keys[0]);
print(keys[1]);
print(keys[2]);
