declare function print(value: unknown): void;

const arr: any = ["zero"];
arr["name"] = "named";
arr["keep"] = "kept";
delete arr["name"];

const values: unknown[] = Object.values(arr);
const entries: any = Object.entries(arr);
const names: unknown[] = Object.getOwnPropertyNames(arr);
const desc: any = Object.getOwnPropertyDescriptor(arr, "name");
const descriptors: any = Object.getOwnPropertyDescriptors(arr);

print(values.length);
print(values[0]);
print(values[1]);
print(entries.length);
print(entries[1][0]);
print(names.length);
print(names[0]);
print(names[1]);
print(names[2]);
print(desc);
print(Object.hasOwn(descriptors, "name"));
print(Object.hasOwn(descriptors, "keep"));
