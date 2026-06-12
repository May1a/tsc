declare function print(value: unknown): void;

const arr: any = ["zero"];
arr[2] = "two";
arr["name"] = "named";
arr["01"] = "leading";

const values: unknown[] = Object.values(arr);
const entries: any = Object.entries(arr);

print(values.length);
print(values[0]);
print(values[1]);
print(values[2]);
print(values[3]);
print(entries.length);
print(entries[0][0]);
print(entries[0][1]);
print(entries[1][0]);
print(entries[1][1]);
print(entries[2][0]);
print(entries[2][1]);
print(entries[3][0]);
print(entries[3][1]);
