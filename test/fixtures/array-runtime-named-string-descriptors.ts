declare function print(value: unknown): void;

const arr: any = ["zero"];
arr[2] = "two";
arr["name"] = "named";
arr["01"] = "leading";

const names: unknown[] = Object.getOwnPropertyNames(arr);
const desc: any = Object.getOwnPropertyDescriptor(arr, "name");
const descriptors: any = Object.getOwnPropertyDescriptors(arr);
const named: any = descriptors.name;
const leading: any = descriptors["01"];

print(names.length);
print(names[0]);
print(names[1]);
print(names[2]);
print(names[3]);
print(names[4]);
print(desc.value);
print(desc.writable);
print(desc.enumerable);
print(desc.configurable);
print(named.value);
print(leading.value);
